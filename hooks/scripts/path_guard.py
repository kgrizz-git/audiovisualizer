#!/usr/bin/env python3
"""
path_guard.py — confine filesystem paths under a trusted root.

Canonical helper for local CI/pre-commit hooks that accept path arguments from
the CLI or pre-commit. ``ci/scripts`` imports this module (do not duplicate it).

Resolving and checking ``relative_to(root)`` rejects ``..`` escapes and absolute
paths outside the repo (or other trusted root).

Note: SonarCloud's ``pythonsecurity:S8707`` does not treat this helper as a
sanitizer; call sites that need a clean Security rating also use
``# NOSONAR pythonsecurity:S8707`` on the actual I/O sink line after confinement.

Inputs:
  - path: user-supplied or tool-supplied filesystem path (relative or absolute)
  - root: trusted directory (defaults to ``Path.cwd()``)

Outputs:
  - Resolved ``Path`` guaranteed to be under ``root``
  - ``ValueError`` if the path escapes the root

Requirements: Python 3.10+.
"""

from __future__ import annotations

from pathlib import Path


def confined_path(path: Path | str, *, root: Path | None = None) -> Path:
    """
    Resolve ``path`` and require it to stay under ``root`` (default: cwd).

    Relative paths are interpreted relative to ``root``. Absolute paths must
    still resolve under ``root``.
    """
    base = (root or Path.cwd()).resolve()
    raw = Path(path)
    resolved = raw.resolve() if raw.is_absolute() else (base / raw).resolve()
    try:
        resolved.relative_to(base)
    except ValueError as exc:
        raise ValueError(f"path escapes trusted root {base}: {path}") from exc
    return resolved
