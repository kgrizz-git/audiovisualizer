#!/usr/bin/env python3
"""Smoke tests for policy hook scripts and CI usage helper.

Run:
  python3 -m unittest tests.test_policy_hooks_smoke -v
"""

# policy:repo-clean allow=alice@personal-mail.net
# policy:repo-clean allow=/Users/local-alice/cache
# policy:repo-clean allow=10.4.5.6
# The tokens above are intentional synthetic fixtures that exercise the
# check_public_repo_clean hook; they never refer to a real person or machine.

from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(script: str, *args: str) -> subprocess.CompletedProcess[str]:
    cmd = [sys.executable, str(ROOT / "hooks" / "scripts" / script), *args]
    return subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)


class TodoLimitsTests(unittest.TestCase):
    def tearDown(self) -> None:
        backlog = ROOT / "to_do.md"
        if backlog.exists():
            backlog.unlink()

    def test_todo_limits_soft_warn(self) -> None:
        backlog = ROOT / "to_do.md"
        backlog.write_text("\n".join(str(i) for i in range(160)) + "\n", encoding="utf-8")
        result = run("check_todo_limits.py", str(backlog))
        self.assertEqual(result.returncode, 0)
        self.assertIn("WARN", result.stderr)

    def test_todo_limits_hard_error(self) -> None:
        backlog = ROOT / "to_do.md"
        backlog.write_text("\n".join(str(i) for i in range(310)) + "\n", encoding="utf-8")
        result = run("check_todo_limits.py", str(backlog))
        self.assertEqual(result.returncode, 1)
        self.assertIn("ERROR", result.stderr)


class FileSizeTests(unittest.TestCase):
    def test_file_size_script_runs_on_self(self) -> None:
        target = ROOT / "hooks" / "scripts" / "check_file_size.py"
        result = run("check_file_size.py", str(target))
        self.assertEqual(result.returncode, 0)


class PublicRepoCleanHookTests(unittest.TestCase):
    def init_repo(self, directory: Path) -> None:
        subprocess.run(["git", "init", "-q", str(directory)], check=True)

    def stage(self, directory: Path) -> None:
        subprocess.run(["git", "-C", str(directory), "add", "-A"], check=True)

    def scan(self, directory: Path, *extra: str) -> subprocess.CompletedProcess[str]:
        return run("check_public_repo_clean.py", "--repo-root", str(directory), *extra)

    def test_clean_tracked_text_passes(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            (root / "module.py").write_text("print('synthetic fixture')\n", encoding="utf-8")
            self.stage(root)
            self.assertEqual(self.scan(root).returncode, 0)

    def test_email_is_blocked(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            (root / "README.md").write_text("Contact: alice@personal-mail.net\n", encoding="utf-8")
            self.stage(root)
            result = self.scan(root)
            self.assertEqual(result.returncode, 1)
            self.assertIn("alice@personal-mail.net", result.stderr)

    def test_ci_redact_omits_match_value(self) -> None:
        """CI --redact keeps rule metadata but omits the matched token from logs."""
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            (root / "README.md").write_text("Contact: alice@personal-mail.net\n", encoding="utf-8")
            self.stage(root)
            result = self.scan(root, "--redact")
            self.assertEqual(result.returncode, 1)
            self.assertIn("rule=email", result.stderr)
            self.assertNotIn("alice@personal-mail.net", result.stderr)

    def test_example_domain_email_passes(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            (root / "README.md").write_text("Contact: person@example.test\n", encoding="utf-8")
            self.stage(root)
            self.assertEqual(self.scan(root).returncode, 0)

    def test_absolute_path_is_blocked(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            (root / "settings.py").write_text('CACHE = "/Users/local-alice/cache"\n', encoding="utf-8")
            self.stage(root)
            result = self.scan(root)
            self.assertEqual(result.returncode, 1)
            self.assertIn("/Users/local-alice/cache", result.stderr)

    def test_private_ip_is_blocked(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            (root / "config.json").write_text('{"endpoint": "10.4.5.6"}\n', encoding="utf-8")
            self.stage(root)
            result = self.scan(root)
            self.assertEqual(result.returncode, 1)
            self.assertIn("10.4.5.6", result.stderr)

    def test_inline_marker_allows_token(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            (root / "settings.py").write_text(
                '# policy:repo-clean allow="/Users/local-alice/cache"\n'
                'CACHE = "/Users/local-alice/cache"\n',
                encoding="utf-8",
            )
            self.stage(root)
            self.assertEqual(self.scan(root).returncode, 0)

    def test_allowlist_file_allows_token(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            (root / ".repo-clean-allowlist").write_text(
                "alice@personal-mail.net\n", encoding="utf-8"
            )
            (root / "README.md").write_text("Contact: alice@personal-mail.net\n", encoding="utf-8")
            self.stage(root)
            self.assertEqual(self.scan(root).returncode, 0)

    def test_non_git_directory_fails_closed(self) -> None:
        """Without a Git index the gate must fail, not silently pass."""
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "README.md").write_text("clean\n", encoding="utf-8")
            result = self.scan(root)
            self.assertEqual(result.returncode, 1)
            self.assertIn("git ls-files failed", result.stderr)


class GhaUsageScriptTests(unittest.TestCase):
    def test_help_exits_zero(self) -> None:
        cmd = [sys.executable, str(ROOT / "ci" / "scripts" / "check_gha_usage.py"), "--help"]
        result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)
        self.assertIn("Actions", result.stdout)


class OpenPrsScriptTests(unittest.TestCase):
    def test_help_exits_zero(self) -> None:
        cmd = [sys.executable, str(ROOT / "ci" / "scripts" / "check_open_prs.py"), "--help"]
        result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)
        self.assertIn("open", result.stdout.lower())

    def test_once_per_day_skips_when_stamp_fresh(self) -> None:
        stamp = ROOT / ".context" / "open-prs-check-test.stamp"
        stamp.parent.mkdir(parents=True, exist_ok=True)
        stamp.write_text("fresh\n", encoding="utf-8")
        cmd = [
            sys.executable,
            str(ROOT / "ci" / "scripts" / "check_open_prs.py"),
            "--once-per-day",
            "--stamp-file",
            str(stamp),
            "--max-age-hours",
            "24",
        ]
        result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)
        self.assertIn("skipped", result.stdout.lower())
        if stamp.exists():
            stamp.unlink()


if __name__ == "__main__":
    unittest.main()
