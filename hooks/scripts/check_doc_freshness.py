#!/usr/bin/env python3
"""
check_doc_freshness.py — pre-commit hook enforcing policies/doc-freshness.md.

Checks that markdown docs in policy-required paths carry a valid
"Last reviewed: YYYY-MM-DD" marker that is not past the staleness window.

Usage (pre-commit wires this automatically):
  python hooks/scripts/check_doc_freshness.py [file ...]

Exit codes: 0 = pass, 1 = hard violation (missing marker in required path,
or doc is hard-stale). Soft warnings are printed but do not block.

Environment variables:
  POLICY_FRESHNESS_WARN_DAYS   days before soft warning (default 180)
  POLICY_FRESHNESS_HARD_DAYS   days before hard block  (default 365)
"""

from __future__ import annotations

import os
import re
import sys
from datetime import date
from pathlib import Path

from path_guard import confined_path, relative_to_root

# ── Staleness windows ─────────────────────────────────────────────────────────
WARN_DAYS = int(os.getenv("POLICY_FRESHNESS_WARN_DAYS", "180"))
HARD_DAYS = int(os.getenv("POLICY_FRESHNESS_HARD_DAYS", "365"))

# ── Paths that MUST carry the marker ─────────────────────────────────────────
REQUIRED_DIRS: set[str] = {"policies", "templates", "inventory", "docs"}
ROOT_REQUIRED: set[str] = {"README.md", "AGENTS.md"}

# ── Exempt path fragments ─────────────────────────────────────────────────────
EXEMPT_FRAGMENTS = [
    ".context/",
    "notes_and_ideas/",
    "CHANGELOG",
    "node_modules/",
    "vendor/",
    "dist/",
    "build/",
    # Auto-generated; cadence owned by check_license_inventory.py
    "inventory/third-party-licenses.md",
]

MARKER_RE = re.compile(r"Last reviewed:\s*(\d{4}-\d{2}-\d{2})", re.IGNORECASE)
TODAY = date.today()


def is_exempt(filepath: str) -> bool:
    norm = filepath.replace(os.sep, "/")
    return any(frag in norm for frag in EXEMPT_FRAGMENTS)


def is_required(rel_path: Path) -> bool:
    """Classify using a repo-relative path (not an absolute confined path)."""
    if rel_path.suffix.lower() != ".md":
        return False
    # Root-level docs
    if rel_path.name in ROOT_REQUIRED and len(rel_path.parts) == 1:
        return True
    # Docs inside required directories
    return bool(REQUIRED_DIRS & set(rel_path.parts))


def check(filepath: str) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    if not filepath.endswith(".md"):
        return errors, warnings

    try:
        path = confined_path(filepath)
        rel = relative_to_root(path)
    except ValueError as exc:
        # Fail closed: escaping paths must not silently skip the policy check.
        errors.append(f"{filepath}: {exc}")
        return errors, warnings

    if is_exempt(rel.as_posix()):
        return errors, warnings

    if not path.exists():
        return errors, warnings

    try:
        # Only scan first 2 KB — marker should be near the top
        # Path already confined via confined_path(); Sonar does not treat that as a sanitizer.
        with open(path, encoding="utf-8", errors="ignore") as fh:  # NOSONAR pythonsecurity:S8707
            head = fh.read(2048)
    except OSError:
        return errors, warnings

    match = MARKER_RE.search(head)

    if not match:
        if is_required(rel):
            errors.append(
                f"{filepath}: missing 'Last reviewed: YYYY-MM-DD' marker. "
                "Required in policies/, templates/, inventory/, docs/, and root agent docs."
            )
        return errors, warnings

    try:
        reviewed = date.fromisoformat(match.group(1))
    except ValueError:
        warnings.append(f"{filepath}: unparseable date '{match.group(1)}' in Last reviewed marker.")
        return errors, warnings

    age = (TODAY - reviewed).days

    if age > HARD_DAYS:
        errors.append(
            f"{filepath}: Last reviewed {reviewed} ({age} days ago) "
            f"exceeds hard limit of {HARD_DAYS} days. "
            "Re-read, verify accuracy, and update the date."
        )
    elif age > WARN_DAYS:
        warnings.append(
            f"{filepath}: Last reviewed {reviewed} ({age} days ago) "
            f"exceeds soft limit of {WARN_DAYS} days. Review when convenient."
        )

    return errors, warnings


def main() -> int:
    files = sys.argv[1:]
    if not files:
        return 0

    all_errors: list[str] = []
    all_warnings: list[str] = []

    for f in files:
        errs, warns = check(f)
        all_errors.extend(errs)
        all_warnings.extend(warns)

    for w in all_warnings:
        print(f"[doc-freshness] WARN  {w}", file=sys.stderr)
    for e in all_errors:
        print(f"[doc-freshness] ERROR {e}", file=sys.stderr)

    return 1 if all_errors else 0


if __name__ == "__main__":
    sys.exit(main())
