#!/usr/bin/env python3
"""Block a commit when a required local scanner has not been re-run since covered files changed.

This is a *contract/ledger* gate for heavy, opt-in scanners that are too slow or too
environment-specific to run on every commit (for example Microsoft Presidio text and image
redaction, local OCR, dicom-phi-scan, phi-scan, HoundDog local CLI/Docker, or a self-hosted
SonarQube Community scan). Instead of running those tools here, this hook records the Git blob
state of the files each scanner covers, and blocks if that state has changed since the scanner
was last recorded as run.

Two files, both in the repository root:

  .scan-contract.json   Declares the scanners, the paths each one covers, and the command a
                        human or CI runs to record a completed scan. Committed and CODEOWNER-owned.
  .scan-ledger.json     Records, per scanner, the covered-file state hash at the time the scan
                        was last recorded. Committed so the gate is shared, not machine-local.

Usage:
  python hooks/scripts/check_scan_contract.py                 # check (default); non-zero if stale
  python hooks/scripts/check_scan_contract.py status          # human-readable per-scanner state
  python hooks/scripts/check_scan_contract.py record <id>     # after actually running that scanner
  python hooks/scripts/check_scan_contract.py record --all    # record every scanner
  python hooks/scripts/check_scan_contract.py --repo-root /path/to/repo

The state hash is derived from `git ls-files -s` blob hashes of the covered files, so at
pre-commit time it reflects the *staged* content about to be committed. Recording only updates
the ledger; it trusts that whoever runs `record` has actually run the scanner. Make CI run the
scanner itself (then `record`) so the ledger cannot be advanced without a real scan. The gate
fails closed: a missing ledger entry, a malformed ledger, or a changed state all block.

See policies/sensitive-data-scan-gates.md and inventory/medical-data-security.md.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

CONTRACT_FILE = ".scan-contract.json"
LEDGER_FILE = ".scan-ledger.json"


def _fail(message: str) -> None:
    print(f"[scan-contract] ERROR {message}", file=sys.stderr)


def repo_root(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit).resolve()
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, check=True,
        )
        return Path(out.stdout.strip()).resolve()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return Path.cwd().resolve()


def _glob_to_regex(pattern: str) -> re.Pattern[str]:
    """Translate a gitignore-ish glob (supporting ``**``, ``*``, ``?``) to an anchored regex.

    A trailing ``/`` matches everything beneath that directory.
    """
    prefix_dir = pattern.endswith("/")
    pattern = pattern.rstrip("/")
    out: list[str] = []
    i = 0
    while i < len(pattern):
        char = pattern[i]
        if char == "*":
            if pattern[i + 1: i + 2] == "*":
                out.append(".*")
                i += 2
                if pattern[i: i + 1] == "/":
                    i += 1
                continue
            out.append("[^/]*")
        elif char == "?":
            out.append("[^/]")
        else:
            out.append(re.escape(char))
        i += 1
    body = "".join(out)
    suffix = "(?:/.*)?" if prefix_dir else ""
    return re.compile(rf"^{body}{suffix}$")


def covered_files(root: Path, patterns: list[str]) -> list[tuple[str, str]]:
    """Return sorted (path, blob_sha) for tracked files matching any pattern (index state)."""
    matchers = [_glob_to_regex(p) for p in patterns]
    try:
        out = subprocess.run(
            ["git", "-C", str(root), "ls-files", "-s"],
            capture_output=True, text=True, check=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return []
    files: list[tuple[str, str]] = []
    for line in out.stdout.splitlines():
        # Format: "<mode> <blobsha> <stage>\t<path>"
        meta, _, path = line.partition("\t")
        parts = meta.split()
        if len(parts) != 3 or not path:
            continue
        blob_sha = parts[1]
        if any(m.match(path) for m in matchers):
            files.append((path, blob_sha))
    files.sort()
    return files


def state_hash(files: list[tuple[str, str]]) -> str:
    digest = hashlib.sha256()
    for path, blob_sha in files:
        digest.update(path.encode("utf-8", "surrogateescape"))
        digest.update(b"\0")
        digest.update(blob_sha.encode("ascii"))
        digest.update(b"\n")
    return digest.hexdigest()


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def scanners_from(contract: dict) -> list[dict]:
    scanners = contract.get("scanners")
    if not isinstance(scanners, list):
        raise ValueError("contract has no 'scanners' list")
    for scanner in scanners:
        if not isinstance(scanner, dict) or "id" not in scanner or "paths" not in scanner:
            raise ValueError("each scanner needs an 'id' and a 'paths' list")
    return scanners


def cmd_check(root: Path) -> int:
    contract_path = root / CONTRACT_FILE
    if not contract_path.exists():
        # No contract configured for this repo; nothing to enforce.
        return 0
    try:
        contract = load_json(contract_path)
        scanners = scanners_from(contract)
    except (ValueError, json.JSONDecodeError, OSError) as exc:
        _fail(f"{CONTRACT_FILE} is present but unreadable: {exc}")
        return 1

    ledger_path = root / LEDGER_FILE
    records: dict = {}
    if ledger_path.exists():
        try:
            ledger = load_json(ledger_path)
            records = ledger.get("records", {})
            if not isinstance(records, dict):
                raise ValueError("'records' must be an object")
        except (ValueError, json.JSONDecodeError, OSError) as exc:
            _fail(f"{LEDGER_FILE} is unreadable; fail closed: {exc}")
            return 1

    stale = 0
    for scanner in scanners:
        scanner_id = scanner["id"]
        files = covered_files(root, scanner["paths"])
        current = state_hash(files)
        record = records.get(scanner_id)
        recorded = record.get("state") if isinstance(record, dict) else None
        if recorded is None:
            stale += 1
            _fail(
                f"scanner '{scanner_id}' has never been recorded "
                f"({len(files)} covered file(s)). Run it, then: "
                f"{scanner.get('record_command', f'record {scanner_id}')}"
            )
        elif recorded != current:
            stale += 1
            _fail(
                f"scanner '{scanner_id}' is stale: {len(files)} covered file(s) changed "
                f"since it last ran. Re-run it, then: "
                f"{scanner.get('record_command', f'record {scanner_id}')}"
            )
    if stale:
        print(
            "[scan-contract] Do not record a scan you did not run. See "
            "policies/sensitive-data-scan-gates.md.",
            file=sys.stderr,
        )
        return 1
    return 0


def cmd_status(root: Path) -> int:
    contract_path = root / CONTRACT_FILE
    if not contract_path.exists():
        print(f"[scan-contract] no {CONTRACT_FILE}; contract gate is not configured")
        return 0
    contract = load_json(contract_path)
    scanners = scanners_from(contract)
    ledger_path = root / LEDGER_FILE
    records = load_json(ledger_path).get("records", {}) if ledger_path.exists() else {}
    for scanner in scanners:
        scanner_id = scanner["id"]
        files = covered_files(root, scanner["paths"])
        record = records.get(scanner_id) if isinstance(records, dict) else None
        recorded = record.get("state") if isinstance(record, dict) else None
        if recorded is None:
            state = "NEVER RECORDED"
        elif recorded == state_hash(files):
            state = f"up to date (recorded {record.get('recorded_on', '?')})"
        else:
            state = "STALE — re-run required"
        print(f"  {scanner_id:<24} {len(files):>4} file(s)  {state}")
    return 0


def cmd_record(root: Path, scanner_id: str | None, all_scanners: bool, by: str, note: str) -> int:
    contract_path = root / CONTRACT_FILE
    if not contract_path.exists():
        _fail(f"no {CONTRACT_FILE}; nothing to record")
        return 1
    scanners = scanners_from(load_json(contract_path))
    by_id = {s["id"]: s for s in scanners}
    if all_scanners:
        targets = list(by_id)
    elif scanner_id in by_id:
        targets = [scanner_id]
    else:
        _fail(f"unknown scanner id '{scanner_id}'. Known: {', '.join(by_id) or '(none)'}")
        return 1

    ledger_path = root / LEDGER_FILE
    ledger = load_json(ledger_path) if ledger_path.exists() else {"version": 1, "records": {}}
    records = ledger.setdefault("records", {})
    from datetime import date

    for target in targets:
        files = covered_files(root, by_id[target]["paths"])
        entry = {"state": state_hash(files), "recorded_on": date.today().isoformat()}
        if by:
            entry["recorded_by"] = by
        if note:
            entry["note"] = note
        records[target] = entry
        print(f"[scan-contract] recorded '{target}' at {len(files)} covered file(s)")
    ledger_path.write_text(json.dumps(ledger, indent=2) + "\n", encoding="utf-8")
    print(f"[scan-contract] updated {LEDGER_FILE}. Commit it so the gate is shared.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", default=None)
    sub = parser.add_subparsers(dest="command")
    sub.add_parser("check")
    sub.add_parser("status")
    record = sub.add_parser("record")
    record.add_argument("scanner_id", nargs="?", default=None)
    record.add_argument("--all", action="store_true", dest="all_scanners")
    record.add_argument("--by", default="")
    record.add_argument("--note", default="")
    args = parser.parse_args(argv)

    root = repo_root(args.repo_root)
    if args.command == "status":
        return cmd_status(root)
    if args.command == "record":
        return cmd_record(root, args.scanner_id, args.all_scanners, args.by, args.note)
    return cmd_check(root)


if __name__ == "__main__":
    sys.exit(main())
