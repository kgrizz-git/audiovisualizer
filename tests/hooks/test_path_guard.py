#!/usr/bin/env python3
"""Unit tests for hooks.scripts.path_guard and related path-classification fixes."""

from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

# Allow importing path_guard the same way hook scripts do (script directory on path).
_HOOKS_SCRIPTS = Path(__file__).resolve().parents[2] / "hooks" / "scripts"
if str(_HOOKS_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_HOOKS_SCRIPTS))

from path_guard import confined_path, relative_to_root  # noqa: E402


def _load_hook(name: str):
    path = _HOOKS_SCRIPTS / name
    spec = importlib.util.spec_from_file_location(name.replace(".", "_"), path)
    assert spec is not None
    assert spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


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

    def test_relative_to_root_strips_absolute_prefix(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            abs_path = confined_path("README.md", root=root)
            # File need not exist for relative_to_root after we construct under root.
            abs_path = (root / "README.md").resolve()
            self.assertEqual(relative_to_root(abs_path, root=root), Path("README.md"))


class DocFreshnessRootRequiredTests(unittest.TestCase):
    """Regression: confined absolute paths must still treat README/AGENTS as required."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.doc = _load_hook("check_doc_freshness.py")

    def test_is_required_root_docs_via_relative_path(self) -> None:
        self.assertTrue(self.doc.is_required(Path("README.md")))
        self.assertTrue(self.doc.is_required(Path("AGENTS.md")))
        self.assertFalse(self.doc.is_required(Path("src") / "README.md"))

    def test_missing_marker_on_root_readme_errors(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            readme = root / "README.md"
            readme.write_text("# No review marker\n", encoding="utf-8")
            # Run check() with cwd = temp root so confined_path uses that root.
            import os

            prev = os.getcwd()
            try:
                os.chdir(root)
                errs, _warns = self.doc.check("README.md")
            finally:
                os.chdir(prev)
            self.assertTrue(any("missing 'Last reviewed" in e for e in errs))

    def test_escape_path_is_hard_error(self) -> None:
        import os

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            prev = os.getcwd()
            try:
                os.chdir(root)
                errs, _warns = self.doc.check("../outside.md")
            finally:
                os.chdir(prev)
            self.assertTrue(errs)
            self.assertTrue(any("escapes trusted root" in e for e in errs))


class TodoLimitsIgnoreRelativeTests(unittest.TestCase):
    """Regression: parent-dir ignore fragments must not skip in-repo backlog files."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.todo = _load_hook("check_todo_limits.py")

    def test_absolute_path_under_backups_parent_still_checked(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            # Simulate checkout at .../backups/<repo>/ with a living backlog file.
            repo = Path(tmp) / "backups" / "myrepo"
            repo.mkdir(parents=True)
            backlog = repo / "TO_DO.md"
            # Exceed hard cap with many lines + a checked-off item to force an error.
            lines = ["# Backlog\n", "- [x] done item\n"] + [f"- [ ] item {i}\n" for i in range(320)]
            backlog.write_text("".join(lines), encoding="utf-8")
            import os

            prev = os.getcwd()
            try:
                os.chdir(repo)
                errs, _warns = self.todo.check(backlog.resolve())
            finally:
                os.chdir(prev)
            self.assertTrue(
                errs,
                "expected TODO limits to enforce even when absolute path contains 'backups/'",
            )


if __name__ == "__main__":
    unittest.main()
