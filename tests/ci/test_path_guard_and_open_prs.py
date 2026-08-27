#!/usr/bin/env python3
"""
Tests for CI helpers that import hooks/scripts/path_guard and open-PR stamp confinement.

Usage:
  python3 -m unittest tests.ci.test_path_guard_and_open_prs -v
"""

from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HOOKS_SCRIPTS = ROOT / "hooks" / "scripts"
CI_SCRIPTS = ROOT / "ci" / "scripts"


def _load_module(name: str, path: Path):
    """Load a script module by file path (scripts are not an installed package)."""
    # Ensure hooks/scripts is importable for path_guard when loading open_prs.
    if str(HOOKS_SCRIPTS) not in sys.path:
        sys.path.insert(0, str(HOOKS_SCRIPTS))
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


class CiPathGuardImportTests(unittest.TestCase):
    def test_open_prs_imports_hooks_path_guard(self) -> None:
        from path_guard import confined_path

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "ok.txt").write_text("x", encoding="utf-8")
            self.assertEqual(confined_path("ok.txt", root=root), (root / "ok.txt").resolve())
            with self.assertRaises(ValueError):
                confined_path("../escape", root=root)


class OpenPrsStampConfinementTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.open_prs = _load_module(
            "check_open_prs_under_test",
            CI_SCRIPTS / "check_open_prs.py",
        )

    def test_stamp_is_fresh_rejects_path_outside_repo_root(self) -> None:
        outside = Path(tempfile.gettempdir()) / "audiovisualizer-open-prs-escape.stamp"
        outside.write_text("x", encoding="utf-8")
        try:
            self.assertFalse(self.open_prs.stamp_is_fresh(outside, max_age_hours=24.0))
        finally:
            outside.unlink(missing_ok=True)

    def test_touch_stamp_rejects_path_outside_repo_root(self) -> None:
        outside = Path(tempfile.gettempdir()) / "audiovisualizer-open-prs-escape2.stamp"
        with self.assertRaises(ValueError):
            self.open_prs.touch_stamp(outside)


class GhaSlugValidationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.gha = _load_module(
            "check_gha_usage_under_test",
            CI_SCRIPTS / "check_gha_usage.py",
        )

    def test_accepts_normal_slug_and_login(self) -> None:
        self.assertEqual(self.gha.validate_repo_slug("kgrizz-git/audiovisualizer"), "kgrizz-git/audiovisualizer")
        self.assertEqual(self.gha.validate_login("kgrizz-git"), "kgrizz-git")

    def test_rejects_leading_hyphen_login(self) -> None:
        with self.assertRaises(SystemExit):
            self.gha.validate_login("-evil")

    def test_rejects_leading_hyphen_repo_name(self) -> None:
        with self.assertRaises(SystemExit):
            self.gha.validate_repo_slug("owner/-name")

    def test_rejects_dot_repo_names(self) -> None:
        with self.assertRaises(SystemExit):
            self.gha.validate_repo_slug("owner/.")
        with self.assertRaises(SystemExit):
            self.gha.validate_repo_slug("owner/..")


if __name__ == "__main__":
    unittest.main()
