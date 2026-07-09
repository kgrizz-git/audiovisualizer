#!/usr/bin/env python3
"""Smoke tests for policy hook scripts and CI usage helper.

Run:
  python3 -m unittest tests.test_policy_hooks_smoke -v
"""

from __future__ import annotations

import subprocess
import sys
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
