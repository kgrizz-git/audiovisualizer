#!/usr/bin/env python3
"""
check_license_inventory.py — generate and verify third-party license inventory.

Produces `inventory/third-party-licenses.md`: a human-readable catalog of direct and
transitive npm dependencies (production and development), their versions, licenses,
and license categories. Enforces content freshness and license-policy gates.

Inputs:
  - package.json (direct dependency names)
  - package-lock.json (lockfile v3 `packages` map for the full tree)
  - optional: `npx license-checker@<pinned>` for richer license metadata
    (skipped for lockfile `"optional": true` platform packages so inventories
    stay identical across OS runners)
  - optional: node_modules LICENSE files as a last-resort fallback
    (also skipped for optional platform packages)

Outputs:
  - Markdown inventory (on `--update` / `--human-review` only)
  - stdout/stderr status; exit 0 pass, exit 1 hard violation

Usage:
  python hooks/scripts/check_license_inventory.py --check
  python hooks/scripts/check_license_inventory.py --update
  python hooks/scripts/check_license_inventory.py --human-review

Environment:
  POLICY_LICENSE_HUMAN_WARN_DAYS   warn when human review older than N days (default 30)
  POLICY_LICENSE_HUMAN_HARD_DAYS   hard-fail when human review older than N days (default 180)
  POLICY_LICENSE_SKIP_CHECKER      if "1", skip npx license-checker (lockfile-only path)

Requirements: Python 3.10+, Node/npm when using license-checker (fallback works without it).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import date
from enum import Enum
from pathlib import Path
from typing import Iterable

# ── Configuration ────────────────────────────────────────────────────────────
INVENTORY_PATH = Path("inventory/third-party-licenses.md")
PACKAGE_JSON = Path("package.json")
PACKAGE_LOCK = Path("package-lock.json")

# Pin license-checker so inventory generation stays reproducible.
LICENSE_CHECKER_VERSION = "25.0.1"

HUMAN_WARN_DAYS = int(os.getenv("POLICY_LICENSE_HUMAN_WARN_DAYS", "30"))
HUMAN_HARD_DAYS = int(os.getenv("POLICY_LICENSE_HUMAN_HARD_DAYS", "180"))
SKIP_CHECKER = os.getenv("POLICY_LICENSE_SKIP_CHECKER", "0") == "1"

HUMAN_REVIEW_RE = re.compile(
    r"^Last human reviewed:\s*(\d{4}-\d{2}-\d{2})$", re.MULTILINE
)
LAST_REVIEWED_RE = re.compile(r"^Last reviewed:\s*(\d{4}-\d{2}-\d{2})$", re.MULTILINE)

# License category sets (canonical SPDX-ish tokens after normalization).
PERMISSIVE_LICENSES = {
    "MIT",
    "ISC",
    "BSD-2-CLAUSE",
    "BSD-3-CLAUSE",
    "APACHE-2.0",
    "UNLICENSE",
    "0BSD",
    "CC0-1.0",
    "BLUEOAK-1.0.0",
    "PYTHON-2.0",
}
WEAK_COPYLEFT = {
    "MPL-2.0",
    "LGPL-2.1",
    "LGPL-2.1-ONLY",
    "LGPL-2.1-OR-LATER",
    "LGPL-3.0",
    "LGPL-3.0-ONLY",
    "LGPL-3.0-OR-LATER",
}
STRONG_COPYLEFT = {
    "GPL-2.0",
    "GPL-2.0-ONLY",
    "GPL-2.0-OR-LATER",
    "GPL-3.0",
    "GPL-3.0-ONLY",
    "GPL-3.0-OR-LATER",
    "AGPL-3.0",
    "AGPL-3.0-ONLY",
    "AGPL-3.0-OR-LATER",
}

SYNONYMS = {
    "APACHE 2.0": "APACHE-2.0",
    "APACHE-2": "APACHE-2.0",
    "APACHE2": "APACHE-2.0",
    "BSD": "BSD-3-CLAUSE",
    "BSD-2": "BSD-2-CLAUSE",
    "BSD-3": "BSD-3-CLAUSE",
    "MPL2": "MPL-2.0",
    "MPL-2": "MPL-2.0",
    "GPLV2": "GPL-2.0",
    "GPLV3": "GPL-3.0",
    "LGPLV2.1": "LGPL-2.1",
    "LGPLV3": "LGPL-3.0",
}


class Category(Enum):
    """Restrictiveness order used for dual-license gating (higher = worse)."""

    PERMISSIVE = 1
    WEAK_COPYLEFT = 2
    STRONG_COPYLEFT = 3
    UNKNOWN = 4


@dataclass(frozen=True)
class DepRecord:
    """One inventory row: a resolved package with license metadata."""

    name: str
    version: str
    license_display: str
    category: Category
    is_direct: bool
    is_dev: bool
    repository: str = ""


def _read_json(path: Path) -> dict:
    """Load a JSON object from disk; return {} on missing/invalid file."""
    if not path.exists():
        return {}
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def package_identity() -> str:
    """Return this project's package name so it can be skipped in the inventory."""
    return str(_read_json(PACKAGE_JSON).get("name") or "audio-visualizer")


def direct_dep_sets() -> tuple[set[str], set[str]]:
    """Return (production direct names, development direct names) from package.json."""
    pkg = _read_json(PACKAGE_JSON)
    prod = set(pkg.get("dependencies", {}) or {})
    dev = set(pkg.get("devDependencies", {}) or {})
    return prod, dev


def lockfile_package_name(lock_key: str) -> str | None:
    """
    Convert a lockfile v3 packages key to an npm package name.

    Examples:
      '' -> None (root)
      'node_modules/vite' -> 'vite'
      'node_modules/@tonejs/midi' -> '@tonejs/midi'
      'node_modules/foo/node_modules/bar' -> 'bar'
    """
    if not lock_key or not lock_key.startswith("node_modules/"):
        return None
    # Nested installs: take the final node_modules segment.
    tail = lock_key.rsplit("node_modules/", 1)[-1]
    return tail or None


def normalize_license_token(raw: str) -> str:
    """Normalize a single SPDX-ish license token for category matching."""
    token = raw.strip().strip("()")
    token = token.upper().replace(" ", "-")
    token = SYNONYMS.get(token, token)
    return token


def split_license_expression(expr: str) -> list[str]:
    """Split a license expression on OR/AND (case-insensitive), keeping tokens."""
    parts = re.split(r"\s+(?:OR|AND)\s+", expr.strip(), flags=re.IGNORECASE)
    return [p for p in parts if p.strip()]


def categorize_license(license_value: object) -> tuple[str, Category]:
    """
    Normalize a license field to (display_string, Category).

    For `A OR B` / `A AND B`, the category is the most restrictive of the parts
    (conservative gating). Display keeps the original joined expression.
    """
    if license_value is None:
        return "UNKNOWN", Category.UNKNOWN

    if isinstance(license_value, list):
        display = " OR ".join(str(x) for x in license_value)
        tokens = [normalize_license_token(str(x)) for x in license_value]
    else:
        display = str(license_value).strip()
        if not display or display.upper() in {"UNLICENSED", "UNKNOWN", "SEE LICENSE IN LICENSE"}:
            return display or "UNKNOWN", Category.UNKNOWN
        tokens = [normalize_license_token(t) for t in split_license_expression(display)]

    if not tokens:
        return display or "UNKNOWN", Category.UNKNOWN

    worst = Category.PERMISSIVE
    for token in tokens:
        if token in STRONG_COPYLEFT or token.startswith("GPL-") or token.startswith("AGPL-"):
            worst = max(worst, Category.STRONG_COPYLEFT, key=lambda c: c.value)
        elif token in WEAK_COPYLEFT or token.startswith("LGPL-") or token.startswith("MPL-"):
            worst = max(worst, Category.WEAK_COPYLEFT, key=lambda c: c.value)
        elif token in PERMISSIVE_LICENSES:
            worst = max(worst, Category.PERMISSIVE, key=lambda c: c.value)
        else:
            worst = max(worst, Category.UNKNOWN, key=lambda c: c.value)

    return display, worst


def get_license_from_node_modules(name: str) -> str | None:
    """Best-effort SPDX-ish license string from a package's LICENSE file."""
    license_patterns = [
        f"node_modules/{name}/LICENSE",
        f"node_modules/{name}/LICENSE.md",
        f"node_modules/{name}/license",
        f"node_modules/{name}/license.md",
        f"node_modules/{name}/LICENCE",
        f"node_modules/{name}/LICENCE.md",
        f"node_modules/{name}/package.json",
    ]
    for pattern in license_patterns:
        path = Path(pattern)
        if not path.exists():
            continue
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        if path.name == "package.json":
            try:
                data = json.loads(content)
            except json.JSONDecodeError:
                continue
            lic = data.get("license")
            if isinstance(lic, dict):
                lic = lic.get("type")
            if lic:
                return str(lic)
            continue
        spdx = re.search(r"SPDX-License-Identifier:\s*([^\s]+)", content, re.IGNORECASE)
        if spdx:
            return spdx.group(1)
        first = content.split("\n", 1)[0].strip().upper()
        for needle, spdx_id in (
            ("MIT", "MIT"),
            ("APACHE", "Apache-2.0"),
            ("MPL", "MPL-2.0"),
            ("ISC", "ISC"),
            ("BSD", "BSD-3-Clause"),
        ):
            if needle in first:
                return spdx_id
    return None


def fetch_license_checker_map() -> dict[str, dict]:
    """
    Run pinned license-checker; return map of package name -> info dict.

    Keys are bare package names (version stripped). On failure, returns {}.
    """
    if SKIP_CHECKER:
        return {}
    try:
        result = subprocess.run(
            [
                "npx",
                "--yes",
                f"license-checker@{LICENSE_CHECKER_VERSION}",
                "--json",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return {}
    if result.returncode != 0 or not result.stdout.strip():
        return {}
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        return {}

    out: dict[str, dict] = {}
    self_name = package_identity()
    for key, info in data.items():
        if not isinstance(info, dict):
            continue
        # license-checker keys are "name@version" (scoped: "@scope/name@version").
        if key.startswith("@"):
            name = key.rsplit("@", 1)[0]
        else:
            name = key.rsplit("@", 1)[0]
        if name == self_name:
            continue
        out[name] = info
    return out


def collect_deps_from_lockfile() -> list[DepRecord]:
    """
    Enumerate all lockfile v3 packages and classify direct/transitive + prod/dev.

    Prefer license fields from lock entries, then license-checker, then LICENSE files.
    Deduplicates by name@version.

    Optional/platform packages (`"optional": true` in the lockfile) use lockfile
    license fields only. Host-local license-checker repository URLs and
    node_modules LICENSE fallbacks are skipped for them so `--check` stays
    identical on macOS, Linux, and Windows runners.
    """
    lock = _read_json(PACKAGE_LOCK)
    packages = lock.get("packages")
    if not isinstance(packages, dict):
        return []

    prod_direct, dev_direct = direct_dep_sets()
    direct_names = prod_direct | dev_direct
    checker = fetch_license_checker_map()
    self_name = package_identity()

    seen: set[tuple[str, str]] = set()
    records: list[DepRecord] = []

    for lock_key, info in packages.items():
        if not isinstance(info, dict):
            continue
        name = lockfile_package_name(str(lock_key))
        if name is None or name == self_name:
            continue
        version = str(info.get("version") or "")
        dedupe_key = (name, version)
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)

        is_direct = name in direct_names
        # Lockfile marks pure-dev packages with "dev": true. Production (and optional
        # platform binaries of prod deps) omit the flag or set it false.
        is_dev = bool(info.get("dev")) or (name in dev_direct and name not in prod_direct)
        is_optional = bool(info.get("optional"))

        license_raw = info.get("license")
        repository = ""
        checker_info = None if is_optional else checker.get(name)
        if checker_info:
            if not license_raw or str(license_raw).upper() in {"", "UNKNOWN"}:
                license_raw = checker_info.get("licenses")
            repository = str(checker_info.get("repository") or "")

        # Optional packages are only present under node_modules on matching hosts;
        # never fall back to host-local files for them.
        if not license_raw and not is_optional:
            license_raw = get_license_from_node_modules(name)

        display, category = categorize_license(license_raw)
        records.append(
            DepRecord(
                name=name,
                version=version or "?",
                license_display=display,
                category=category,
                is_direct=is_direct,
                is_dev=is_dev,
                repository=repository,
            )
        )

    records.sort(key=lambda r: (r.name.lower(), r.version))
    return records


def format_entry(dep: DepRecord) -> str:
    """Format one markdown bullet for a dependency."""
    entry = f"- `{dep.name}` (v{dep.version}) — {dep.license_display}"
    if dep.repository:
        entry += f" ([source]({dep.repository}))"
    entry += f" — see `node_modules/{dep.name}/`"
    return entry


def _section_blocks(deps: Iterable[DepRecord]) -> list[str]:
    """Render permissive/weak/strong/unknown subsections for a dep bucket."""
    by_cat: dict[Category, list[str]] = {
        Category.PERMISSIVE: [],
        Category.WEAK_COPYLEFT: [],
        Category.STRONG_COPYLEFT: [],
        Category.UNKNOWN: [],
    }
    for dep in deps:
        by_cat[dep.category].append(format_entry(dep))

    lines: list[str] = []
    headings = [
        (Category.PERMISSIVE, "### Permissive Licenses"),
        (Category.WEAK_COPYLEFT, "### Weak Copyleft Licenses"),
        (Category.STRONG_COPYLEFT, "### Strong Copyleft Licenses"),
        (Category.UNKNOWN, "### Unknown/Check Manually"),
    ]
    for cat, heading in headings:
        items = by_cat[cat]
        if not items:
            continue
        lines.append(heading)
        lines.append("")
        lines.extend(items)
        lines.append("")
    return lines


def count_by_category(deps: list[DepRecord], *, dev: bool) -> dict[Category, int]:
    """Count deps in one prod/dev slice by category."""
    counts = {c: 0 for c in Category}
    for dep in deps:
        if dep.is_dev == dev:
            counts[dep.category] += 1
    return counts


def extract_date(pattern: re.Pattern[str], content: str) -> date | None:
    """Parse the first YYYY-MM-DD captured by pattern from content."""
    match = pattern.search(content)
    if not match:
        return None
    try:
        return date.fromisoformat(match.group(1))
    except ValueError:
        return None


def read_existing_inventory() -> str | None:
    """Return inventory file text, or None if missing."""
    if not INVENTORY_PATH.exists():
        return None
    try:
        return INVENTORY_PATH.read_text(encoding="utf-8")
    except OSError:
        return None


def generate_inventory(
    *,
    last_reviewed: date | None = None,
    human_reviewed: date | None = None,
    deps: list[DepRecord] | None = None,
) -> str:
    """
    Build the full inventory markdown.

    last_reviewed defaults to today (generation stamp).
    human_reviewed is preserved when provided; omitted from output if None.
    """
    records = deps if deps is not None else collect_deps_from_lockfile()
    reviewed = last_reviewed or date.today()

    lines = [
        "# Third-Party License Inventory",
        "",
        f"Last reviewed: {reviewed.isoformat()}",
    ]
    if human_reviewed is not None:
        lines.append(f"Last human reviewed: {human_reviewed.isoformat()}")
    lines.extend(
        [
            "",
            "This document catalogs third-party dependencies and their licenses for compliance,",
            "attribution, and license compatibility review. It is auto-generated by",
            "`hooks/scripts/check_license_inventory.py`. Update with `--update`; stamp a human",
            "review with `--human-review`. Do not hand-edit the dependency lists.",
            "",
        ]
    )

    buckets = [
        (
            "## Direct Production Dependencies",
            [d for d in records if d.is_direct and not d.is_dev],
        ),
        (
            "## Direct Development Dependencies",
            [d for d in records if d.is_direct and d.is_dev],
        ),
        (
            "## Transitive Production Dependencies",
            [d for d in records if not d.is_direct and not d.is_dev],
        ),
        (
            "## Transitive Development Dependencies",
            [d for d in records if not d.is_direct and d.is_dev],
        ),
    ]

    for heading, bucket in buckets:
        lines.append(heading)
        lines.append("")
        if not bucket:
            lines.append("_None._")
            lines.append("")
            continue
        lines.extend(_section_blocks(bucket))

    prod_counts = count_by_category(records, dev=False)
    dev_counts = count_by_category(records, dev=True)

    lines.extend(
        [
            "## License Summary",
            "",
            "| Category | Production | Development |",
            "|----------|------------|-------------|",
            f"| Permissive | {prod_counts[Category.PERMISSIVE]} | {dev_counts[Category.PERMISSIVE]} |",
            f"| Weak Copyleft | {prod_counts[Category.WEAK_COPYLEFT]} | {dev_counts[Category.WEAK_COPYLEFT]} |",
            f"| Strong Copyleft | {prod_counts[Category.STRONG_COPYLEFT]} | {dev_counts[Category.STRONG_COPYLEFT]} |",
            f"| Unknown/Check | {prod_counts[Category.UNKNOWN]} | {dev_counts[Category.UNKNOWN]} |",
            "",
            "## License References",
            "",
            "- **MIT** — Permissive, attribution required",
            "- **ISC** — Permissive, similar to MIT",
            "- **Apache-2.0** — Permissive with patent grant, attribution required",
            "- **MPL-2.0** — Weak copyleft, file-level disclosure for modifications",
            "- **GPL-2.0/GPL-3.0** — Strong copyleft, derivative works must be open source",
            "- **LGPL-2.1/LGPL-3.0** — Weak copyleft, dynamic linking allowed",
            "- **BSD-2-Clause/BSD-3-Clause** — Permissive with minimal restrictions",
            "",
            "## Generating & Updating",
            "",
            "The inventory is checked during pre-commit and CI. To regenerate after dependency changes:",
            "",
            "```bash",
            "python hooks/scripts/check_license_inventory.py --update",
            "```",
            "",
            "After a human spot-check of the catalog (especially Unknown and copyleft rows):",
            "",
            "```bash",
            "python hooks/scripts/check_license_inventory.py --human-review",
            "```",
            "",
            f"Uses `license-checker@{LICENSE_CHECKER_VERSION}` when available; falls back to",
            "lockfile v3 `packages` metadata if `npx` is unavailable.",
            "",
        ]
    )
    return "\n".join(lines)


def inventory_has_risk(deps: list[DepRecord]) -> bool:
    """True if Unknown entries exist or strong copyleft appears anywhere."""
    return any(
        d.category == Category.UNKNOWN or d.category == Category.STRONG_COPYLEFT
        for d in deps
    )


def production_strong_copyleft(deps: list[DepRecord]) -> list[DepRecord]:
    """Production (non-dev) packages under a strong copyleft license."""
    return [d for d in deps if not d.is_dev and d.category == Category.STRONG_COPYLEFT]


def unknown_licenses(deps: list[DepRecord]) -> list[DepRecord]:
    """Packages whose license could not be classified."""
    return [d for d in deps if d.category == Category.UNKNOWN]


def check_human_review_age(
    human_reviewed: date | None,
    *,
    has_risk: bool,
) -> tuple[list[str], list[str]]:
    """
    Evaluate human-review cadence.

    Returns (errors, warnings) per the policy gate table.
    """
    errors: list[str] = []
    warnings: list[str] = []
    if human_reviewed is None:
        errors.append(
            f"{INVENTORY_PATH}: missing 'Last human reviewed' date — "
            "run --human-review after a spot-check"
        )
        return errors, warnings

    age = (date.today() - human_reviewed).days
    if age > HUMAN_HARD_DAYS:
        errors.append(
            f"{INVENTORY_PATH}: Last human reviewed {human_reviewed.isoformat()} "
            f"is {age} days old (hard limit {HUMAN_HARD_DAYS})"
        )
    elif age > HUMAN_WARN_DAYS and has_risk:
        errors.append(
            f"{INVENTORY_PATH}: Last human reviewed {human_reviewed.isoformat()} "
            f"is {age} days old and inventory has Unknown/strong-copyleft risk "
            f"(risk-accelerated limit {HUMAN_WARN_DAYS})"
        )
    elif age > HUMAN_WARN_DAYS:
        warnings.append(
            f"{INVENTORY_PATH}: Last human reviewed {human_reviewed.isoformat()} "
            f"is {age} days old (warn after {HUMAN_WARN_DAYS}; hard after {HUMAN_HARD_DAYS})"
        )
    return errors, warnings


def run_check() -> int:
    """
    Read-only verification: content must match regeneration; enforce license gates.

    Never writes the inventory file.
    """
    existing = read_existing_inventory()
    if existing is None:
        print(
            f"[license-inventory] ERROR {INVENTORY_PATH} is missing — run --update",
            file=sys.stderr,
        )
        return 1

    deps = collect_deps_from_lockfile()
    human = extract_date(HUMAN_REVIEW_RE, existing)
    auto = extract_date(LAST_REVIEWED_RE, existing) or date.today()
    expected = generate_inventory(
        last_reviewed=auto,
        human_reviewed=human,
        deps=deps,
    )

    if expected != existing:
        print(
            f"[license-inventory] ERROR {INVENTORY_PATH} is out of date with "
            "package-lock.json / classification — run --update",
            file=sys.stderr,
        )
        return 1

    errors: list[str] = []
    warnings: list[str] = []

    for dep in unknown_licenses(deps):
        errors.append(
            f"Unknown/Check license: {dep.name}@{dep.version} ({dep.license_display})"
        )
    for dep in production_strong_copyleft(deps):
        errors.append(
            f"Strong copyleft in production: {dep.name}@{dep.version} ({dep.license_display})"
        )
    for dep in deps:
        if dep.is_dev and dep.category == Category.STRONG_COPYLEFT:
            warnings.append(
                f"Strong copyleft in development: {dep.name}@{dep.version} ({dep.license_display})"
            )

    hr_errors, hr_warnings = check_human_review_age(
        human, has_risk=inventory_has_risk(deps)
    )
    errors.extend(hr_errors)
    warnings.extend(hr_warnings)

    for w in warnings:
        print(f"[license-inventory] WARN  {w}", file=sys.stderr)
    for e in errors:
        print(f"[license-inventory] ERROR {e}", file=sys.stderr)

    if errors:
        return 1

    print(f"[license-inventory] PASS  {INVENTORY_PATH} is up-to-date")
    return 0


def run_update() -> int:
    """Regenerate inventory; preserve Last human reviewed when present."""
    existing = read_existing_inventory() or ""
    human = extract_date(HUMAN_REVIEW_RE, existing)
    content = generate_inventory(
        last_reviewed=date.today(),
        human_reviewed=human,
    )
    INVENTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    INVENTORY_PATH.write_text(content, encoding="utf-8")
    print(f"[license-inventory] Updated {INVENTORY_PATH}")
    if human is None:
        print(
            "[license-inventory] INFO  No Last human reviewed yet — "
            "run --human-review after a spot-check",
            file=sys.stderr,
        )
    return 0


def stamp_human_review(content: str, reviewed_on: date) -> str:
    """
    Insert or refresh `Last human reviewed` without changing the dependency body.

    Keeps the same blank-line layout as `generate_inventory` so `--check` diffs match.
    """
    today_s = reviewed_on.isoformat()
    if HUMAN_REVIEW_RE.search(content):
        return HUMAN_REVIEW_RE.sub(f"Last human reviewed: {today_s}", content, count=1)

    # Collapse any blank lines after Last reviewed, then emit:
    #   Last reviewed: ...
    #   Last human reviewed: ...
    #   <blank>
    #   body...
    updated, count = re.subn(
        r"(Last reviewed:\s*\d{4}-\d{2}-\d{2})\n+",
        rf"\1\nLast human reviewed: {today_s}\n\n",
        content,
        count=1,
    )
    if count:
        return updated

    return content.replace(
        "# Third-Party License Inventory\n",
        f"# Third-Party License Inventory\n\nLast human reviewed: {today_s}\n",
        1,
    )


def run_human_review() -> int:
    """Stamp today's date into Last human reviewed without regenerating the body."""
    existing = read_existing_inventory()
    if existing is None:
        print(
            f"[license-inventory] ERROR {INVENTORY_PATH} missing — run --update first",
            file=sys.stderr,
        )
        return 1

    today = date.today()
    updated = stamp_human_review(existing, today)
    INVENTORY_PATH.write_text(updated, encoding="utf-8")
    print(f"[license-inventory] Stamped Last human reviewed: {today.isoformat()}")
    return 0


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint."""
    parser = argparse.ArgumentParser(
        description="Generate and verify third-party license inventory"
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--check",
        action="store_true",
        help="Verify inventory matches deps and policy gates (read-only)",
    )
    group.add_argument(
        "--update",
        action="store_true",
        help="Regenerate the inventory file",
    )
    group.add_argument(
        "--human-review",
        action="store_true",
        help="Stamp today's date into Last human reviewed",
    )
    args = parser.parse_args(argv)

    if args.update:
        return run_update()
    if args.human_review:
        return run_human_review()
    # Default: --check
    return run_check()


if __name__ == "__main__":
    sys.exit(main())
