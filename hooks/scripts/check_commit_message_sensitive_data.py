#!/usr/bin/env python3
"""Block PII/PHI and local/infrastructure leakage in a Git commit message.

Wire this as a pre-commit ``commit-msg`` stage. It accepts the message-file path supplied by
Git, reports only rule IDs and line numbers, and never supports allowlist bypasses: sensitive
details belong in the approved issue/incident system, not immutable Git history.
"""

from __future__ import annotations

import sys
from pathlib import Path

from check_sensitive_data import scan_text


def main() -> int:
    if len(sys.argv) != 2:
        print("[commit-message-sensitive-data] ERROR expected one commit-message file", file=sys.stderr)
        return 1
    message_path = Path(sys.argv[1])
    try:
        findings = scan_text(str(message_path), message_path.read_bytes())
    except OSError:
        print("[commit-message-sensitive-data] ERROR could not read commit-message file", file=sys.stderr)
        return 1
    for rule_id, location in findings:
        print(f"[commit-message-sensitive-data] ERROR {rule_id}: {location}", file=sys.stderr)
    if findings:
        print(
            "[commit-message-sensitive-data] Remove the sensitive detail; use a sanitized issue or incident reference instead.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
