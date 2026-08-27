#!/usr/bin/env python3
"""Unit tests for hooks.scripts.path_guard.confined_path."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

# Allow importing path_guard the same way hook scripts do (script directory on path).
_HOOKS_SCRIPTS = Path(__file__).resolve().parents[2] / "hooks" / "scripts"
if str(_HOOKS_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_HOOKS_SCRIPTS))

from path_guard import confined_path  # noqa: E402


class ConfinedPathTests(unittest.TestCase):
    def test_relative_path_under_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            target = root / "a" / "b.txt"
            target.parent.mkdir(parents=True)
            target.write_text("x", encoding="utf-8")
            got = confined_path("a/b.txt", root=root)
            self.assertEqual(got, target.resolve())

    def test_rejects_escape(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with self.assertRaises(ValueError):
                confined_path("../outside", root=root)


if __name__ == "__main__":
    unittest.main()
