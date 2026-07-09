#!/usr/bin/env python3
"""
check_open_prs.py — advisory listing of open GitHub pull requests.

Purpose:
  Help humans and agents notice existing open PRs (especially after a push, or
  about once a day) so work is not duplicated and branches get linked or updated.
  This is intentionally advisory: it never blocks git push or pre-commit.

  Agents: for the daily check, inspect `.context/open-prs-check.stamp` first and
  skip invoking this script when the stamp is < 24h old (fewer tokens than a
  Python/`gh` round-trip). Use `--once-per-day` as a safety net only.

Inputs:
  CLI flags (see --help). Uses the GitHub CLI (`gh`) for authenticated API calls.
  Optional once-per-day stamp file under .context/ (gitignored).

Outputs:
  Human-readable summary on stdout (JSON with --json). Exit 0 on success or when
  skipping due to the daily stamp. Exit 1 only if gh is missing/unusable and the
  check was not skipped (still safe to ignore in hooks — do not wire as a gate).

Requirements:
  - gh CLI installed and authenticated with repo read access.
  - Network access to api.github.com (or GH_HOST).

Examples:
  python3 ci/scripts/check_open_prs.py
  python3 ci/scripts/check_open_prs.py --branch
  python3 ci/scripts/check_open_prs.py --once-per-day
  python3 ci/scripts/check_open_prs.py --json
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_STAMP = Path(".context") / "open-prs-check.stamp"
DEFAULT_MAX_AGE_HOURS = 24
API_VERSION = "2022-11-28"


def die(msg: str, code: int = 1) -> None:
    print(f"[open-prs] ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def info(msg: str) -> None:
    print(f"[open-prs] {msg}")


def run_gh(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["gh", *args], capture_output=True, text=True)


def ensure_gh() -> None:
    if shutil.which("gh") is None:
        die("gh CLI not found on PATH. Install https://cli.github.com/ and authenticate.")


def stamp_is_fresh(stamp_path: Path, max_age_hours: float) -> bool:
    if not stamp_path.is_file():
        return False
    age_s = time.time() - stamp_path.stat().st_mtime
    return age_s < max_age_hours * 3600.0


def touch_stamp(stamp_path: Path) -> None:
    stamp_path.parent.mkdir(parents=True, exist_ok=True)
    stamp_path.write_text(
        datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ\n"),
        encoding="utf-8",
    )


def current_branch() -> str | None:
    proc = subprocess.run(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        return None
    name = (proc.stdout or "").strip()
    if not name or name == "HEAD":
        return None
    return name


def list_open_prs(repo: str | None, head_branch: str | None) -> list[dict[str, Any]]:
    """Return open PRs via `gh pr list` (JSON)."""
    args = [
        "pr",
        "list",
        "--state",
        "open",
        "--limit",
        "50",
        "--json",
        "number,title,url,headRefName,baseRefName,author,updatedAt,isDraft",
    ]
    if repo:
        args.extend(["--repo", repo])
    if head_branch:
        args.extend(["--head", head_branch])
    proc = run_gh(args)
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        die(f"gh pr list failed: {err or 'unknown error'}")
    text = (proc.stdout or "").strip()
    if not text:
        return []
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        die(f"could not parse gh pr list JSON: {exc}")
    if not isinstance(data, list):
        die("unexpected gh pr list payload (expected a JSON array)")
    return data


def format_human(prs: list[dict[str, Any]], scope: str) -> str:
    lines = [f"Open pull requests ({scope}): {len(prs)}"]
    if not prs:
        lines.append("  (none)")
        return "\n".join(lines)
    for pr in prs:
        num = pr.get("number", "?")
        title = pr.get("title", "")
        url = pr.get("url", "")
        head = pr.get("headRefName", "")
        base = pr.get("baseRefName", "")
        draft = " [draft]" if pr.get("isDraft") else ""
        author = ""
        author_obj = pr.get("author")
        if isinstance(author_obj, dict):
            author = author_obj.get("login") or ""
        who = f" @{author}" if author else ""
        lines.append(f"  #{num}{draft}{who} {head} → {base}: {title}")
        if url:
            lines.append(f"       {url}")
    return "\n".join(lines)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description=(
            "Advisory check: list open GitHub PRs (never blocks push/commit). "
            "Use after a push or with --once-per-day from agent session prompts."
        )
    )
    p.add_argument(
        "--repo",
        default=os.environ.get("OPEN_PRS_REPO") or None,
        help="owner/name (default: gh's current repo)",
    )
    p.add_argument(
        "--branch",
        action="store_true",
        help="only list open PRs whose head is the current git branch",
    )
    p.add_argument(
        "--head",
        default=None,
        help="only list open PRs for this head branch name (overrides --branch)",
    )
    p.add_argument(
        "--once-per-day",
        action="store_true",
        help="skip if the stamp file is newer than --max-age-hours (default 24)",
    )
    p.add_argument(
        "--max-age-hours",
        type=float,
        default=float(os.environ.get("OPEN_PRS_MAX_AGE_HOURS", DEFAULT_MAX_AGE_HOURS)),
        help="freshness window for --once-per-day (default 24)",
    )
    p.add_argument(
        "--stamp-file",
        type=Path,
        default=Path(os.environ.get("OPEN_PRS_STAMP_FILE", str(DEFAULT_STAMP))),
        help=f"stamp path for --once-per-day (default {DEFAULT_STAMP})",
    )
    p.add_argument(
        "--force",
        action="store_true",
        help="ignore the once-per-day stamp and always query",
    )
    p.add_argument(
        "--json",
        action="store_true",
        help="print JSON instead of a human summary",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    if args.once_per_day and not args.force:
        if stamp_is_fresh(args.stamp_file, args.max_age_hours):
            info(
                f"skipped (stamp fresh < {args.max_age_hours:g}h): {args.stamp_file}"
            )
            return 0

    ensure_gh()

    head: str | None = args.head
    if head is None and args.branch:
        head = current_branch()
        if head is None:
            die("could not resolve current branch for --branch (detached HEAD?)")

    prs = list_open_prs(args.repo, head)
    scope = f"head={head}" if head else "repo"
    if args.repo:
        scope = f"{args.repo} {scope}"

    if args.json:
        payload = {
            "scope": scope,
            "count": len(prs),
            "pull_requests": prs,
            "checked_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(format_human(prs, scope))
        if prs and head:
            info("If one of these matches your work, update that PR instead of opening another.")
        elif not prs and head:
            info("No open PR for this branch yet — open one when the change is ready to review.")

    if args.once_per_day or args.force:
        touch_stamp(args.stamp_file)

    return 0


if __name__ == "__main__":
    sys.exit(main())
