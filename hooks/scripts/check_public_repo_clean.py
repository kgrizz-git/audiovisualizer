#!/usr/bin/env python3
"""
check_public_repo_clean.py — pre-commit / CI hook blocking local-identity leakage.

Scans every file tracked in the Git index for:
  * email addresses (excluding reserved example/test domains)
  * absolute paths under /Users, /home, /Volumes, C:\\Users, and file:// URIs
  * private IPv4 addresses

This keeps a repository safe to publish without leaking the author's local
identity. It reads the Git index (like the license-inventory hook), so it does
not rely on pre-commit passing only changed filenames.

Coverage is the **current Git index only** (tracked files at HEAD/staging). It is
not a full-history audit; use gitleaks history scans (or similar) when removing
content from past commits.

Usage (pre-commit wires this automatically):
  python hooks/scripts/check_public_repo_clean.py [--repo-root DIR] [--allow-file FILE]
                                                  [--redact]

Exit codes: 0 = clean, 1 = violations found (or Git enumeration failed).

Allowlisting (keep test fixtures working without a human review inventory):
  1. Root-level .repo-clean-allowlist — one literal token per line (# comments
     allowed). Tokens are matched verbatim against flagged content.
  2. Inline marker near the top of a file:
       # policy:repo-clean allow=<token>
  3. Built-in reserved example/test email domains are always allowed
     (example.com, example.org, example.net, example.test, example.edu,
     example.io, example.dev, localhost, invalid, test).

Output modes:
  * Local / default: print path, rule, and the matched token (actionable for fixing).
  * CI / ``--redact`` or ``POLICY_REPO_CLEAN_REDACT=1``: print path, line, rule id,
    and remediation text without the matched value (safer in shared logs).
"""

from __future__ import annotations

import argparse
import os
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
INLINE_ALLOW_LINE_LIMIT = 20

RULE_EMAIL = "email"
RULE_ABS_PATH = "absolute-path"
RULE_FILE_URI = "file-uri-path"
RULE_WIN_PATH = "windows-user-path"
RULE_PRIVATE_IP = "private-ipv4"

REMEDIATION = "remove the match or allowlist via .repo-clean-allowlist / inline marker"


def is_allowed_email(email: str) -> bool:
    """Return True when the email's domain is a reserved example/test domain."""
    domain = email.rsplit("@", 1)[-1].lower()
    return domain in ALLOWED_EMAIL_DOMAINS or domain.endswith(".example")


def inline_allowances_from_text(text: str) -> set[str]:
    """Parse ``policy:repo-clean allow=<token>`` markers from the first lines of text."""
    tokens: set[str] = set()
    for i, line in enumerate(text.splitlines()):
        if i >= INLINE_ALLOW_LINE_LIMIT:
            break
        for match in ALLOW_MARKER_RE.findall(line):
            tokens.add(match.strip("\"'"))
    return tokens


def _line_number_at(text: str, index: int) -> int:
    """1-based line number for a character offset into ``text``."""
    return text.count("\n", 0, index) + 1


def _format_finding(
    path: Path,
    line: int,
    rule_id: str,
    label: str,
    token: str,
    *,
    redact: bool,
) -> str:
    """Build one finding line; omit the matched token when ``redact`` is True."""
    if redact:
        return f"{path}:{line}: rule={rule_id} — {REMEDIATION}"
    return f"{path}:{line}: {label} {token!r}"


def check_file(path: Path, allowlist: set[str], *, redact: bool) -> list[str]:
    """Return violation descriptions for one tracked file.

    Reads the file once, derives inline allow markers from the same text, then
    scans for emails, absolute paths, file URIs, and private IPv4 addresses.
    """
    findings: list[str] = []
    if not path.exists():
        return findings

    try:
        content = path.read_bytes()
    except OSError:
        return findings

    text = content.decode("utf-8", errors="ignore")
    allowed = allowlist | inline_allowances_from_text(text)

    for match in EMAIL_RE.finditer(text):
        token = match.group(0)
        if token not in allowed and not is_allowed_email(token):
            findings.append(
                _format_finding(
                    path,
                    _line_number_at(text, match.start()),
                    RULE_EMAIL,
                    "email address",
                    token,
                    redact=redact,
                )
            )

    for pattern, rule_id, label in (
        (UNIX_USER_PATH_RE, RULE_ABS_PATH, "absolute path"),
        (FILE_URI_USER_PATH_RE, RULE_FILE_URI, "file:// URI with absolute path"),
        (WINDOWS_USER_PATH_RE, RULE_WIN_PATH, "Windows user path"),
        (PRIVATE_IP_RE, RULE_PRIVATE_IP, "private IPv4 address"),
    ):
        for match in pattern.finditer(text):
            groups = match.groups()
            token = groups[-1] if groups else match.group(0)
            if token not in allowed:
                findings.append(
                    _format_finding(
                        path,
                        _line_number_at(text, match.start()),
                        rule_id,
                        label,
                        token,
                        redact=redact,
                    )
                )

    return findings


def tracked_files(repo_root: Path) -> list[Path]:
    """Return cached (index) paths using NUL-delimited ``git ls-files -z``.

    Raises ``RuntimeError`` if Git cannot be queried. An empty list is only valid
    when ``git ls-files`` succeeds and the index is empty — swallowing Git
    failures would silently skip the entire scan.
    """
    try:
        result = subprocess.run(
            ["git", "-C", str(repo_root), "ls-files", "-z", "--cached"],
            capture_output=True,
            check=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(
            "git executable not found; cannot enumerate tracked files"
        ) from exc
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or b"").decode("utf-8", errors="replace").strip()
        raise RuntimeError(
            f"git ls-files failed (exit {exc.returncode})"
            + (f": {detail}" if detail else "")
        ) from exc

    names = result.stdout.split(b"\0")
    paths: list[Path] = []
    for raw in names:
        if not raw:
            continue
        # Decode verbatim bytes from -z output (avoids core.quotePath escaping).
        name = raw.decode("utf-8", errors="surrogateescape")
        paths.append(repo_root / name)
    return paths


def load_allowlist(allowlist_path: Path) -> set[str]:
    """Load literal allowlist tokens from a file; empty set if missing/unreadable."""
    if not allowlist_path.exists():
        return set()
    try:
        return {
            line.strip().strip("\"'")
            for line in allowlist_path.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.strip().startswith("#")
        }
    except OSError:
        return set()


def main(argv: list[str] | None = None) -> int:
    """CLI entry: scan the Git index and exit non-zero on findings or Git failure."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", default=".", help="Repository root (default: cwd)")
    parser.add_argument(
        "--allow-file",
        help="Alternative allowlist file relative to repo root (default: .repo-clean-allowlist)",
    )
    parser.add_argument(
        "--redact",
        action="store_true",
        help="Omit matched tokens from stderr (also POLICY_REPO_CLEAN_REDACT=1)",
    )
    args = parser.parse_args(argv)

    redact = args.redact or os.getenv("POLICY_REPO_CLEAN_REDACT", "0") == "1"
    repo_root = Path(args.repo_root).resolve()
    allowlist_path = repo_root / (args.allow_file or ALLOWLIST_FILE)
    allowlist = load_allowlist(allowlist_path)

    try:
        paths = tracked_files(repo_root)
    except RuntimeError as exc:
        print(f"[repo-clean] ERROR {exc}", file=sys.stderr)
        return 1

    findings: list[str] = []
    for path in paths:
        findings.extend(check_file(path, allowlist, redact=redact))

    for finding in findings:
        print(f"[repo-clean] ERROR {finding}", file=sys.stderr)

    if findings:
        print(
            "[repo-clean] Prefer removing the sensitive content. To keep a fixture, "
            f"add a token to {allowlist_path.name} or an inline "
            "'# policy:repo-clean allow=<token>' marker.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
