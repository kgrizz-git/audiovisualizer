#!/usr/bin/env python3
"""
check_public_repo_clean.py — pre-commit hook blocking local-identity leakage.

Scans every file tracked in the Git index for:
  * email addresses (excluding reserved example/test domains)
  * absolute paths under /Users, /home, /Volumes, C:\\Users, and file:// URIs
  * private IPv4 addresses

This keeps a repository safe to publish without leaking the author's local
identity. It reads the Git index (like the license-inventory hook), so it does
not rely on pre-commit passing only changed filenames.

Usage (pre-commit wires this automatically):
  python hooks/scripts/check_public_repo_clean.py [--repo-root DIR] [--allow-file FILE]

Exit codes: 0 = clean, 1 = violations found.

Allowlisting (keep test fixtures working without a human review inventory):
  1. Root-level .repo-clean-allowlist — one literal token per line (# comments
     allowed). Tokens are matched verbatim against flagged content.
  2. Inline marker near the top of a file:
       # policy:repo-clean allow=<token>
  3. Built-in reserved example/test email domains are always allowed
     (example.com, example.org, example.net, example.test, example.edu,
     example.io, example.dev, localhost, invalid, test).
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

# ── Detection patterns ────────────────────────────────────────────────────────
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

ALLOWED_EMAIL_DOMAINS = {
    "example.com",
    "example.org",
    "example.net",
    "example.test",
    "example.edu",
    "example.io",
    "example.dev",
    "localhost",
    "invalid",
    "test",
}

UNIX_USER_PATH_RE = re.compile(
    r"(^|[\s\"'(=])(/(?:Users|home|Volumes|homepages)/[A-Za-z0-9_][A-Za-z0-9_./\-]*)"
)
FILE_URI_USER_PATH_RE = re.compile(
    r"file:///(?:Users|home|Volumes|homepages)/[A-Za-z0-9_][A-Za-z0-9_./\-]*"
)
WINDOWS_USER_PATH_RE = re.compile(r"[A-Za-z]:\\Users\\[A-Za-z0-9_][A-Za-z0-9_.\-]*")
PRIVATE_IP_RE = re.compile(
    r"\b(?:10\.(?:[0-9]{1,3})\.(?:[0-9]{1,3})\.(?:[0-9]{1,3})"
    r"|192\.168\.(?:[0-9]{1,3})\.(?:[0-9]{1,3})"
    r"|172\.(?:1[6-9]|2[0-9]|3[01])\.(?:[0-9]{1,3})\.(?:[0-9]{1,3}))\b"
)

ALLOW_MARKER_RE = re.compile(r"policy:repo-clean\s+allow=(\S+)", re.IGNORECASE)

ALLOWLIST_FILE = ".repo-clean-allowlist"


def is_allowed_email(email: str) -> bool:
    domain = email.rsplit("@", 1)[-1].lower()
    return domain in ALLOWED_EMAIL_DOMAINS or domain.endswith(".example")


def read_inline_allowances(path: Path) -> set[str]:
    """Load policy:repo-clean allow=<token> markers from the top of a file."""
    tokens: set[str] = set()
    try:
        with open(path, encoding="utf-8", errors="ignore") as fh:
            for i, line in enumerate(fh):
                if i >= 20:
                    break
                for match in ALLOW_MARKER_RE.findall(line):
                    tokens.add(match.strip("\"'"))
    except OSError:
        pass
    return tokens


def check_file(path: Path, allowlist: set[str]) -> list[str]:
    """Return violation descriptions for one tracked file."""
    findings: list[str] = []
    if not path.exists():
        return findings

    try:
        content = path.read_bytes()
    except OSError:
        return findings

    text = content.decode("utf-8", errors="ignore")
    allowed = allowlist | read_inline_allowances(path)

    for match in EMAIL_RE.findall(text):
        if match not in allowed and not is_allowed_email(match):
            findings.append(f"{path}: email address {match!r}")

    for pattern, label in (
        (UNIX_USER_PATH_RE, "absolute path"),
        (FILE_URI_USER_PATH_RE, "file:// URI with absolute path"),
        (WINDOWS_USER_PATH_RE, "Windows user path"),
        (PRIVATE_IP_RE, "private IPv4 address"),
    ):
        for match in pattern.findall(text):
            token = match if isinstance(match, str) else match[-1]
            if token not in allowed:
                findings.append(f"{path}: {label} {token!r}")

    return findings


def tracked_files(repo_root: Path) -> list[Path]:
    """Return cached (index) paths, or raise RuntimeError if Git cannot be queried.

    An empty list is only valid when `git ls-files` succeeds and the index is
    empty. Swallowing Git failures would silently skip the entire scan.
    """
    try:
        result = subprocess.run(
            ["git", "-C", str(repo_root), "ls-files", "--cached"],
            capture_output=True,
            text=True,
            check=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(
            "git executable not found; cannot enumerate tracked files"
        ) from exc
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or "").strip()
        raise RuntimeError(
            f"git ls-files failed (exit {exc.returncode})"
            + (f": {detail}" if detail else "")
        ) from exc
    return [repo_root / line for line in result.stdout.splitlines() if line.strip()]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", default=".", help="Repository root (default: cwd)")
    parser.add_argument(
        "--allow-file",
        help="Alternative allowlist file relative to repo root (default: .repo-clean-allowlist)",
    )
    args = parser.parse_args(argv)

    repo_root = Path(args.repo_root).resolve()
    allowlist_path = repo_root / (args.allow_file or ALLOWLIST_FILE)
    allowlist = set()
    if allowlist_path.exists():
        try:
            allowlist = {
                line.strip().strip("\"'")
                for line in allowlist_path.read_text(encoding="utf-8").splitlines()
                if line.strip() and not line.strip().startswith("#")
            }
        except OSError:
            allowlist = set()

    try:
        paths = tracked_files(repo_root)
    except RuntimeError as exc:
        print(f"[repo-clean] ERROR {exc}", file=sys.stderr)
        return 1

    findings: list[str] = []
    for path in paths:
        findings.extend(check_file(path, allowlist))

    for finding in findings:
        print(f"[repo-clean] ERROR {finding}", file=sys.stderr)

    if findings:
        print(
            "[repo-clean] Run with tokens you must keep in an allowlist via "
            f"{allowlist_path.name} or an inline '# policy:repo-clean allow=<token>' "
            "marker — but prefer removing the sensitive content.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
