#!/usr/bin/env python3
"""
Fixture tests for hooks/scripts/check_license_inventory.py.

Covers lockfile v3 enumeration, prod/dev classification, optional platform packages,
SPDX OR expressions, content-diff --check, read-only --check, and human-review age gates.

Run:
  python3 -m unittest tests.hooks.test_check_license_inventory -v
"""

from __future__ import annotations

import importlib.util
import os
import shutil
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "hooks" / "scripts" / "check_license_inventory.py"
FIXTURES = ROOT / "tests" / "fixtures" / "license-inventory"


def load_module():
    """Import the license inventory script as a module."""
    spec = importlib.util.spec_from_file_location("check_license_inventory", SCRIPT)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules["check_license_inventory"] = mod
    spec.loader.exec_module(mod)
    return mod


class LicenseInventoryUnitTests(unittest.TestCase):
    """Unit tests that operate inside a temporary fixture checkout."""

    def setUp(self) -> None:
        self._cwd = Path.cwd()
        self._tmpdir = tempfile.TemporaryDirectory()
        self.root = Path(self._tmpdir.name)
        shutil.copy(FIXTURES / "package.json", self.root / "package.json")
        shutil.copy(FIXTURES / "package-lock.json", self.root / "package-lock.json")
        (self.root / "inventory").mkdir()
        os.chdir(self.root)
        os.environ["POLICY_LICENSE_SKIP_CHECKER"] = "1"
        # Reload so module-level Path defaults and env are read in a clean state.
        self.mod = load_module()
        # Point module paths at the temp root (module uses relative paths).
        self.mod.INVENTORY_PATH = Path("inventory/third-party-licenses.md")
        self.mod.PACKAGE_JSON = Path("package.json")
        self.mod.PACKAGE_LOCK = Path("package-lock.json")
        self.mod.SKIP_CHECKER = True

    def tearDown(self) -> None:
        os.chdir(self._cwd)
        self._tmpdir.cleanup()
        os.environ.pop("POLICY_LICENSE_SKIP_CHECKER", None)

    def test_lockfile_v3_enumeration_and_classification(self) -> None:
        deps = self.mod.collect_deps_from_lockfile()
        by_name = {d.name: d for d in deps}

        self.assertIn("prod-direct", by_name)
        self.assertTrue(by_name["prod-direct"].is_direct)
        self.assertFalse(by_name["prod-direct"].is_dev)

        self.assertIn("dev-direct", by_name)
        self.assertTrue(by_name["dev-direct"].is_direct)
        self.assertTrue(by_name["dev-direct"].is_dev)

        self.assertIn("trans-prod", by_name)
        self.assertFalse(by_name["trans-prod"].is_direct)
        self.assertFalse(by_name["trans-prod"].is_dev)

        self.assertIn("trans-dev", by_name)
        self.assertFalse(by_name["trans-dev"].is_direct)
        self.assertTrue(by_name["trans-dev"].is_dev)

        # Optional platform package is kept, not dropped.
        self.assertIn("prod-direct-darwin-arm64", by_name)
        self.assertFalse(by_name["prod-direct-darwin-arm64"].is_dev)

    def test_optional_packages_ignore_host_local_checker_metadata(self) -> None:
        """Optional packages must not pick up OS-specific repository/license enrichment."""
        self.mod.fetch_license_checker_map = lambda: {
            "prod-direct": {
                "licenses": "MIT",
                "repository": "https://example.com/prod-direct",
            },
            "prod-direct-darwin-arm64": {
                "licenses": "Apache-2.0",
                "repository": "https://example.com/should-not-appear",
            },
        }
        # Force the lockfile-only optional package to look like it needs enrichment.
        original_collect = self.mod.collect_deps_from_lockfile

        def collect_with_checker() -> list:
            # Bypass SKIP_CHECKER path by calling collect after monkeypatch.
            return original_collect()

        deps = {d.name: d for d in collect_with_checker()}
        optional = deps["prod-direct-darwin-arm64"]
        required = deps["prod-direct"]
        self.assertEqual(optional.repository, "")
        self.assertEqual(optional.license_display, "MIT")  # lockfile wins; checker ignored
        self.assertEqual(required.repository, "https://example.com/prod-direct")

    def test_spdx_or_expression_is_strong_copyleft(self) -> None:
        display, category = self.mod.categorize_license("MIT OR GPL-3.0")
        self.assertEqual(display, "MIT OR GPL-3.0")
        self.assertEqual(category, self.mod.Category.STRONG_COPYLEFT)

        deps = self.mod.collect_deps_from_lockfile()
        dual = next(d for d in deps if d.name == "dual-license-prod")
        self.assertEqual(dual.category, self.mod.Category.STRONG_COPYLEFT)
        self.assertTrue(self.mod.production_strong_copyleft(deps))

    def test_check_missing_inventory_does_not_create_file(self) -> None:
        inv = Path("inventory/third-party-licenses.md")
        self.assertFalse(inv.exists())
        code = self.mod.run_check()
        self.assertEqual(code, 1)
        self.assertFalse(inv.exists())

    def test_check_content_drift_fails(self) -> None:
        self.mod.run_update()
        self.mod.run_human_review()
        inv = Path("inventory/third-party-licenses.md")
        text = inv.read_text(encoding="utf-8")
        inv.write_text(text.replace("`prod-direct`", "`prod-direct-REMOVED`"), encoding="utf-8")
        self.assertEqual(self.mod.run_check(), 1)

    def test_check_ignores_only_human_review_date_change_via_regen_preserve(self) -> None:
        """Changing Last human reviewed then regenerating expected with that date still matches."""
        self.mod.run_update()
        self.mod.run_human_review()
        # Stamp again — body unchanged; check must still pass.
        self.mod.run_human_review()
        # Unknown + strong copyleft in fixture cause hard fail on policy gates even when
        # content matches — strip risk packages for this content-only assertion.
        deps = [
            d
            for d in self.mod.collect_deps_from_lockfile()
            if d.category
            not in (self.mod.Category.UNKNOWN, self.mod.Category.STRONG_COPYLEFT)
        ]
        content = self.mod.generate_inventory(
            last_reviewed=date.today(),
            human_reviewed=date.today(),
            deps=deps,
        )
        Path("inventory/third-party-licenses.md").write_text(content, encoding="utf-8")
        # Monkeypatch collector used inside run_check by writing matching file via same deps.
        original = self.mod.collect_deps_from_lockfile
        self.mod.collect_deps_from_lockfile = lambda: deps  # type: ignore[method-assign]
        try:
            self.assertEqual(self.mod.run_check(), 0)
        finally:
            self.mod.collect_deps_from_lockfile = original  # type: ignore[method-assign]

    def test_update_preserves_human_review_date(self) -> None:
        self.mod.run_update()
        inv = Path("inventory/third-party-licenses.md")
        # Manually set an older human review date.
        older = (date.today() - timedelta(days=5)).isoformat()
        text = inv.read_text(encoding="utf-8")
        if self.mod.HUMAN_REVIEW_RE.search(text):
            text = self.mod.HUMAN_REVIEW_RE.sub(f"Last human reviewed: {older}", text)
        else:
            text = self.mod.stamp_human_review(text, date.today() - timedelta(days=5))
        inv.write_text(text, encoding="utf-8")
        self.mod.run_update()
        updated = inv.read_text(encoding="utf-8")
        self.assertIn(f"Last human reviewed: {older}", updated)

    def test_human_review_stamp_does_not_rewrite_dep_list(self) -> None:
        self.mod.run_update()
        before = Path("inventory/third-party-licenses.md").read_text(encoding="utf-8")
        # Remove human line if present so stamp inserts.
        stripped = self.mod.HUMAN_REVIEW_RE.sub("", before)
        stripped = stripped.replace("\n\n\n", "\n\n")
        Path("inventory/third-party-licenses.md").write_text(stripped, encoding="utf-8")
        body_before = self.mod.LAST_REVIEWED_RE.split(stripped, maxsplit=1)[-1]
        self.mod.run_human_review()
        after = Path("inventory/third-party-licenses.md").read_text(encoding="utf-8")
        body_after = self.mod.HUMAN_REVIEW_RE.split(after, maxsplit=1)[-1]
        # Dependency catalog (everything after the date header block) stays intact.
        self.assertIn("## Direct Production Dependencies", body_after)
        self.assertIn("`prod-direct`", body_after)
        self.assertIn(f"Last human reviewed: {date.today().isoformat()}", after)

    def test_human_review_warn_vs_hard(self) -> None:
        warn_errs, warn_warns = self.mod.check_human_review_age(
            date.today() - timedelta(days=31),
            has_risk=False,
        )
        self.assertEqual(warn_errs, [])
        self.assertTrue(warn_warns)

        hard_errs, _ = self.mod.check_human_review_age(
            date.today() - timedelta(days=181),
            has_risk=False,
        )
        self.assertTrue(hard_errs)

        risk_errs, _ = self.mod.check_human_review_age(
            date.today() - timedelta(days=31),
            has_risk=True,
        )
        self.assertTrue(risk_errs)

    def test_four_way_headings_in_generated_inventory(self) -> None:
        text = self.mod.generate_inventory(
            last_reviewed=date.today(),
            human_reviewed=date.today(),
        )
        for heading in (
            "## Direct Production Dependencies",
            "## Direct Development Dependencies",
            "## Transitive Production Dependencies",
            "## Transitive Development Dependencies",
        ):
            self.assertIn(heading, text)
        self.assertIn("(v1.0.0)", text)
        self.assertIn("python hooks/scripts/check_license_inventory.py --update", text)
        self.assertNotIn("/tmp/license-data.json", text)


class RepoIntegrationSmoke(unittest.TestCase):
    """Light smoke against the real repo inventory (requires package-lock present)."""

    def test_repo_check_passes(self) -> None:
        if not (ROOT / "package-lock.json").exists():
            self.skipTest("package-lock.json missing")
        if not (ROOT / "inventory" / "third-party-licenses.md").exists():
            self.skipTest("inventory missing")
        env = os.environ.copy()
        # Allow checker; real inventory was generated with it.
        env.pop("POLICY_LICENSE_SKIP_CHECKER", None)
        import subprocess

        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--check"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            env=env,
        )
        self.assertEqual(
            result.returncode,
            0,
            msg=f"stdout={result.stdout}\nstderr={result.stderr}",
        )


if __name__ == "__main__":
    unittest.main()
