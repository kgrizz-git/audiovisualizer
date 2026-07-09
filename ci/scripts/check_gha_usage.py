#!/usr/bin/env python3
"""
check_gha_usage.py — report GitHub Actions / storage usage for a repo and account.

Purpose:
  Help humans and agents estimate and monitor GitHub Actions minutes and related
  storage (artifacts, caches, packages) before expanding CI. See
  policies/github-actions-usage.md and ci/README.md.

Inputs:
  CLI flags (see --help). Uses the GitHub CLI (`gh`) for authenticated API calls.
  Optional: GH_HOST, GH_TOKEN / gh auth session.

Outputs:
  Human-readable summary on stdout (JSON with --json). Exit 0 on success, 1 on
  hard failure (gh missing / auth), 2 if some billing endpoints were forbidden
  but repo-level timing still printed.

Requirements:
  - gh CLI installed and authenticated (repo scope; billing needs plan/billing
    permission on the user or org — often a classic PAT or fine-grained token
    with Administration/Billing read for the account).
  - Network access to api.github.com.

Examples:
  python3 ci/scripts/check_gha_usage.py              # repo + account (best effort)
  python3 ci/scripts/check_gha_usage.py --repo
  python3 ci/scripts/check_gha_usage.py --account
  python3 ci/scripts/check_gha_usage.py --repo owner/name --days 14
  python3 ci/scripts/check_gha_usage.py --json
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

API_VERSION = "2022-11-28"


def die(msg: str, code: int = 1) -> None:
    print(f"[gha-usage] ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def warn(msg: str) -> None:
    print(f"[gha-usage] WARN: {msg}", file=sys.stderr)


def run_gh(args: list[str], check: bool = False) -> subprocess.CompletedProcess[str]:
    cmd = ["gh", *args]
    return subprocess.run(cmd, capture_output=True, text=True, check=check)


def gh_api(path: str, jq: str | None = None) -> tuple[int, Any, str]:
    """Call `gh api` and return (http_exit_or_process_code, parsed_json_or_None, stderr)."""
    args = ["api", "-H", f"X-GitHub-Api-Version: {API_VERSION}", path]
    if jq:
        args.extend(["--jq", jq])
    proc = run_gh(args)
    text = proc.stdout.strip()
    err = (proc.stderr or "").strip()
    if proc.returncode != 0:
        return proc.returncode, None, err or text
    if not text:
        return 0, None, err
    if jq:
        # jq may return a scalar string
        try:
            return 0, json.loads(text), err
        except json.JSONDecodeError:
            return 0, text, err
    try:
        return 0, json.loads(text), err
    except json.JSONDecodeError:
        return 0, text, err


def require_gh() -> None:
    if not shutil.which("gh"):
        die("GitHub CLI `gh` not found on PATH. Install: https://cli.github.com/")


def resolve_repo(explicit: str | None) -> str:
    if explicit:
        return explicit
    code, data, err = gh_api("repos/{owner}/{repo}", jq=".full_name")
    # Prefer gh repo view — works from a git checkout
    proc = run_gh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"])
    if proc.returncode == 0 and proc.stdout.strip():
        return proc.stdout.strip()
    if code == 0 and isinstance(data, str) and data:
        return data
    die(f"Could not resolve repository. Pass --repo owner/name. ({err or proc.stderr})")


def resolve_viewer_login() -> str | None:
    code, data, err = gh_api("user", jq=".login")
    if code == 0 and isinstance(data, str) and data:
        return data
    warn(f"Could not resolve authenticated user login via /user ({err}). Account billing may be skipped.")
    return None


def iso_days_ago(days: int) -> str:
    dt = datetime.now(timezone.utc) - timedelta(days=days)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch_repo_run_timing(repo: str, days: int, limit: int) -> dict[str, Any]:
    """
    Aggregate wall-clock and billable minutes from recent workflow runs.

    Billable minutes use GET .../actions/runs/{id}/timing when available.
    Wall-clock is always computed from run timestamps (includes queue time).
    """
    owner, _, name = repo.partition("/")
    if not owner or not name:
        die(f"Invalid --repo {repo!r}; expected owner/name")

    since = iso_days_ago(days)
    # List completed runs; paginate via gh --paginate
    path = (
        f"repos/{owner}/{name}/actions/runs"
        f"?per_page=100&status=completed&created=>{since}"
    )
    proc = run_gh(
        [
            "api",
            "--paginate",
            "-H",
            f"X-GitHub-Api-Version: {API_VERSION}",
            path,
            "--jq",
            ".workflow_runs",
        ]
    )
    if proc.returncode != 0:
        warn(f"Failed to list workflow runs: {proc.stderr.strip() or proc.stdout.strip()}")
        return {
            "repo": repo,
            "days": days,
            "runs_considered": 0,
            "error": proc.stderr.strip() or proc.stdout.strip(),
        }

    # --paginate with --jq may concatenate JSON arrays; parse carefully
    runs: list[dict[str, Any]] = []
    raw = proc.stdout.strip()
    if raw:
        decoder = json.JSONDecoder()
        idx = 0
        while idx < len(raw):
            while idx < len(raw) and raw[idx].isspace():
                idx += 1
            if idx >= len(raw):
                break
            obj, offset = decoder.raw_decode(raw, idx)
            idx = offset
            if isinstance(obj, list):
                runs.extend(obj)
            elif isinstance(obj, dict):
                runs.append(obj)

    runs = runs[:limit]
    by_workflow: dict[str, dict[str, float]] = defaultdict(
        lambda: {"runs": 0, "wall_seconds": 0.0, "billable_ms": 0.0}
    )
    total_wall = 0.0
    total_billable_ms = 0.0
    timing_ok = 0
    timing_fail = 0

    for run in runs:
        wf = run.get("name") or run.get("path") or "unknown"
        run_id = run.get("id")
        # Wall clock
        start = run.get("run_started_at") or run.get("created_at")
        end = run.get("updated_at")
        wall = 0.0
        if start and end:
            try:
                t0 = datetime.fromisoformat(start.replace("Z", "+00:00"))
                t1 = datetime.fromisoformat(end.replace("Z", "+00:00"))
                wall = max(0.0, (t1 - t0).total_seconds())
            except ValueError:
                wall = 0.0
        by_workflow[wf]["runs"] += 1
        by_workflow[wf]["wall_seconds"] += wall
        total_wall += wall

        if not run_id:
            continue
        t_code, timing, _ = gh_api(f"repos/{owner}/{name}/actions/runs/{run_id}/timing")
        if t_code != 0 or not isinstance(timing, dict):
            timing_fail += 1
            continue
        billable = timing.get("billable") or {}
        ms = 0.0
        if isinstance(billable, dict):
            for _os, info in billable.items():
                if isinstance(info, dict):
                    ms += float(info.get("total_ms") or 0)
        by_workflow[wf]["billable_ms"] += ms
        total_billable_ms += ms
        timing_ok += 1

    workflows = [
        {
            "name": name_,
            "runs": int(stats["runs"]),
            "wall_minutes": round(stats["wall_seconds"] / 60.0, 2),
            "billable_minutes": round(stats["billable_ms"] / 60000.0, 2),
        }
        for name_, stats in sorted(by_workflow.items(), key=lambda kv: -kv[1]["billable_ms"])
    ]

    return {
        "repo": repo,
        "days": days,
        "runs_considered": len(runs),
        "timing_fetched": timing_ok,
        "timing_failed": timing_fail,
        "total_wall_minutes": round(total_wall / 60.0, 2),
        "total_billable_minutes": round(total_billable_ms / 60000.0, 2),
        "workflows": workflows,
        "notes": [
            "Billable minutes come from the run timing API (private repos; public often 0).",
            "Wall-clock includes queue/approval time and is an upper bound for capacity planning.",
            "Artifact/cache storage is not included in run timing — see account billing summary.",
        ],
    }


def fetch_account_usage(login: str, year: int | None, month: int | None, repository: str | None) -> dict[str, Any]:
    """Best-effort account billing summary (enhanced billing platform)."""
    q: list[str] = []
    if year:
        q.append(f"year={year}")
    if month:
        q.append(f"month={month}")
    if repository:
        q.append(f"repository={quote(repository, safe='')}")
    qs = ("?" + "&".join(q)) if q else ""

    # Try user summary first
    user_path = f"users/{login}/settings/billing/usage/summary{qs}"
    code, data, err = gh_api(user_path)
    source = f"GET /{user_path}"
    if code != 0:
        # Org-shaped accounts sometimes use organizations/
        org_path = f"organizations/{login}/settings/billing/usage/summary{qs}"
        code2, data2, err2 = gh_api(org_path)
        if code2 == 0:
            code, data, err = code2, data2, err2
            source = f"GET /{org_path}"
        else:
            return {
                "account": login,
                "ok": False,
                "error": err or err2,
                "hint": (
                    "Billing usage APIs require account admin + billing read permission. "
                    "Use a PAT with billing access, or open https://github.com/settings/billing "
                    "(user) / org Settings → Billing. Legacy /settings/billing/actions endpoints "
                    "are retired."
                ),
                "tried": [user_path, org_path],
            }

    items = []
    if isinstance(data, dict):
        items = data.get("usageItems") or []

    # Group Actions-ish and storage-ish products for a quick view
    by_product: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in items:
        if not isinstance(item, dict):
            continue
        product = str(item.get("product") or "unknown")
        by_product[product].append(item)

    def summarize(product_substr: str) -> list[dict[str, Any]]:
        out = []
        for product, rows in by_product.items():
            if product_substr.lower() not in product.lower():
                continue
            for row in rows:
                out.append(
                    {
                        "product": product,
                        "sku": row.get("sku"),
                        "unitType": row.get("unitType"),
                        "netQuantity": row.get("netQuantity"),
                        "netAmount": row.get("netAmount"),
                        "grossQuantity": row.get("grossQuantity"),
                    }
                )
        return out

    return {
        "account": login,
        "ok": True,
        "source": source,
        "timePeriod": data.get("timePeriod") if isinstance(data, dict) else None,
        "repository_filter": repository,
        "all_products": sorted(by_product.keys()),
        "actions_related": summarize("action") + summarize("Actions"),
        "storage_related": summarize("storage") + summarize("Storage") + summarize("Packages") + summarize("Artifact"),
        "usageItems": items,
        "ui": "https://github.com/settings/billing",
    }


def print_repo_report(report: dict[str, Any]) -> None:
    print()
    print(f"=== Repo Actions usage: {report.get('repo')} (last {report.get('days')} days) ===")
    if report.get("error"):
        print(f"  Error: {report['error']}")
        return
    print(f"  Runs considered:     {report.get('runs_considered')}")
    print(f"  Timing API fetched:  {report.get('timing_fetched')} (failed: {report.get('timing_failed')})")
    print(f"  Total wall minutes:  {report.get('total_wall_minutes')}")
    print(f"  Total billable min:  {report.get('total_billable_minutes')}")
    wfs = report.get("workflows") or []
    if wfs:
        print("  By workflow:")
        for wf in wfs[:15]:
            print(
                f"    - {wf['name']}: runs={wf['runs']} "
                f"wall={wf['wall_minutes']}m billable={wf['billable_minutes']}m"
            )
    for note in report.get("notes") or []:
        print(f"  Note: {note}")


def print_account_report(report: dict[str, Any]) -> None:
    print()
    print(f"=== Account billing usage: {report.get('account')} ===")
    if not report.get("ok"):
        print(f"  Unavailable: {report.get('error')}")
        if report.get("hint"):
            print(f"  Hint: {report['hint']}")
        return
    print(f"  Source: {report.get('source')}")
    print(f"  Period: {report.get('timePeriod')}")
    if report.get("repository_filter"):
        print(f"  Repo filter: {report['repository_filter']}")
    print(f"  Products seen: {', '.join(report.get('all_products') or []) or '(none)'}")
    actions = report.get("actions_related") or []
    storage = report.get("storage_related") or []
    if actions:
        print("  Actions-related lines:")
        for row in actions:
            print(
                f"    - {row.get('product')} / {row.get('sku')}: "
                f"qty={row.get('netQuantity')} {row.get('unitType')} "
                f"net=${row.get('netAmount')}"
            )
    else:
        print("  Actions-related lines: (none in this period — or labeled differently; see raw products)")
    if storage:
        print("  Storage/Packages-related lines:")
        for row in storage:
            print(
                f"    - {row.get('product')} / {row.get('sku')}: "
                f"qty={row.get('netQuantity')} {row.get('unitType')} "
                f"net=${row.get('netAmount')}"
            )
    else:
        print("  Storage-related lines: (none matched by name heuristics)")
    print(f"  Billing UI: {report.get('ui')}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--repo", metavar="OWNER/NAME", help="Repository to inspect (default: current gh repo)")
    parser.add_argument("--account", metavar="LOGIN", help="User or org login for billing summary (default: viewer)")
    parser.add_argument("--repo-only", action="store_true", help="Only print repo run timing")
    parser.add_argument("--account-only", action="store_true", help="Only print account billing summary")
    # Aliases matching the policy docs
    parser.add_argument("--days", type=int, default=30, help="Lookback days for repo runs (default 30)")
    parser.add_argument("--limit", type=int, default=50, help="Max completed runs to time (default 50)")
    parser.add_argument("--year", type=int, default=None, help="Billing summary year (default: API default)")
    parser.add_argument("--month", type=int, default=None, help="Billing summary month 1-12")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON")
    args = parser.parse_args()

    # Support documented flags from the policy: --repo / --account as mode switches
    # when used without values via environment-style invocation in docs.
    # Our argparse uses optional values; policy examples use bare --repo/--account.
    # Handle bare mode: if user passes only boolean intent via repo-only/account-only.

    require_gh()

    do_repo = not args.account_only
    do_account = not args.repo_only
    if args.repo_only and args.account_only:
        die("Choose at most one of --repo-only / --account-only")

    out: dict[str, Any] = {}
    partial = False

    repo = None
    if do_repo:
        repo = resolve_repo(args.repo)
        out["repo_report"] = fetch_repo_run_timing(repo, days=args.days, limit=args.limit)
        if not args.json:
            print_repo_report(out["repo_report"])

    if do_account:
        login = args.account or resolve_viewer_login()
        if not login:
            partial = True
            out["account_report"] = {
                "account": "(unknown)",
                "ok": False,
                "error": "Could not resolve authenticated user/org login",
                "hint": (
                    "Pass --account LOGIN, or authenticate gh with a token that can "
                    "read /user. Billing UI: https://github.com/settings/billing"
                ),
            }
        else:
            # When both, also filter account summary to this repo if possible
            repo_filter = repo if (do_repo and repo) else None
            out["account_report"] = fetch_account_usage(
                login, year=args.year, month=args.month, repository=None
            )
            if repo_filter and out["account_report"].get("ok"):
                out["account_report_for_repo"] = fetch_account_usage(
                    login, year=args.year, month=args.month, repository=repo_filter
                )
            if not out["account_report"].get("ok"):
                partial = True

        if not args.json:
            print_account_report(out["account_report"])
            if out.get("account_report_for_repo"):
                print()
                print(f"=== Account usage filtered to repository {repo_filter} ===")
                print_account_report(out["account_report_for_repo"])

    if args.json:
        print(json.dumps(out, indent=2, default=str))

    print()
    print(
        "Estimate tip: monthly_minutes ≈ (expected_runs_per_month) × "
        "(billable_or_wall_minutes_per_run) × (OS multiplier). "
        "See policies/github-actions-usage.md."
    )

    return 2 if partial else 0


if __name__ == "__main__":
    # Allow policy-doc style: `check_gha_usage.py --repo` meaning repo-only
    # when --repo is given as a flag without OWNER/NAME. argparse with metavar
    # can't do that easily; preprocess argv.
    argv = sys.argv[1:]
    rewritten: list[str] = []
    i = 0
    while i < len(argv):
        tok = argv[i]
        if tok == "--repo" and (i + 1 >= len(argv) or argv[i + 1].startswith("-")):
            rewritten.append("--repo-only")
            i += 1
            continue
        if tok == "--account" and (i + 1 >= len(argv) or argv[i + 1].startswith("-")):
            rewritten.append("--account-only")
            i += 1
            continue
        rewritten.append(tok)
        i += 1
    sys.argv = [sys.argv[0], *rewritten]
    sys.exit(main())
