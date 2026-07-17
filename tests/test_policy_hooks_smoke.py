#!/usr/bin/env python3
"""Smoke tests for policy hook scripts and CI usage helper.

Run:
  python3 -m unittest tests.test_policy_hooks_smoke -v
"""

from __future__ import annotations

import subprocess
import sys
import hashlib
import json
import tempfile
import unittest
import zipfile
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


class SensitiveDataHookTests(unittest.TestCase):
    def init_repo(self, directory: Path) -> None:
        subprocess.run(["git", "init", "-q", str(directory)], check=True)
        (directory / ".phi-security-approvals.json").write_text(
            json.dumps({"version": 1, "approvals": []}), encoding="utf-8"
        )

    def scan(self, directory: Path) -> subprocess.CompletedProcess[str]:
        return run("check_sensitive_data.py", "--repo-root", str(directory))

    def stage(self, directory: Path) -> None:
        subprocess.run(["git", "-C", str(directory), "add", "."], check=True)

    def test_clean_tracked_text_passes(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            (root / "module.py").write_text("print('synthetic fixture')\n", encoding="utf-8")
            self.stage(root)
            self.assertEqual(self.scan(root).returncode, 0)

    def test_suspected_field_in_test_csv_blocks(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            tests = root / "tests"
            tests.mkdir()
            (tests / "fixture.csv").write_text("patient_id,value\nsynthetic-1,ok\n", encoding="utf-8")
            self.stage(root)
            result = self.scan(root)
            self.assertEqual(result.returncode, 1)
            self.assertIn("SUSPECTED_FIELD_HEADER", result.stderr)
            self.assertNotIn("synthetic-1", result.stderr)

    def test_xlsx_text_is_inspected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            with zipfile.ZipFile(root / "fixture.xlsx", "w") as workbook:
                workbook.writestr("xl/sharedStrings.xml", "<t>person@example.test</t>")
            self.stage(root)
            result = self.scan(root)
            self.assertEqual(result.returncode, 1)
            self.assertIn("SUSPECTED_EMAIL", result.stderr)
            self.assertNotIn("person@example.test", result.stderr)

    def test_xlsx_field_header_is_inspected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            with zipfile.ZipFile(root / "fixture.xlsx", "w") as workbook:
                workbook.writestr("xl/sharedStrings.xml", "<t>patient_id</t>")
            self.stage(root)
            result = self.scan(root)
            self.assertEqual(result.returncode, 1)
            self.assertIn("SUSPECTED_FIELD_XML_TEXT", result.stderr)

    def test_image_requires_exact_human_approval(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            image = root / "fixture.png"
            image.write_bytes(b"not-a-real-image")
            self.stage(root)
            self.assertIn("IMAGE_FILE", self.scan(root).stderr)

            digest = hashlib.sha256(image.read_bytes()).hexdigest()
            approvals = {
                "version": 1,
                "approvals": [{
                    "path": "fixture.png",
                    "sha256": digest,
                    "kind": "image",
                    "approved_by": "Security Reviewer",
                    "approved_on": "2026-07-14",
                    "approval_reference": "SEC-42",
                    "reason": "Synthetic image reviewed for test use.",
                }],
            }
            (root / ".phi-security-approvals.json").write_text(json.dumps(approvals), encoding="utf-8")
            self.stage(root)
            self.assertEqual(self.scan(root).returncode, 0)

    def test_extensionless_file_is_blocked(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            (root / "payload").write_text("safe-looking text\n", encoding="utf-8")
            self.stage(root)
            result = self.scan(root)
            self.assertEqual(result.returncode, 1)
            self.assertIn("EXTENSIONLESS_FILE", result.stderr)

    def test_dicom_magic_is_blocked_without_a_dcm_suffix(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            (root / "scan.bin").write_bytes(b"\0" * 128 + b"DICM" + b"pixel-data")
            self.stage(root)
            result = self.scan(root)
            self.assertEqual(result.returncode, 1)
            self.assertIn("DICOM_FILE", result.stderr)

    def test_hardcoded_username_is_blocked_without_echoing_it(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            (root / "settings.json").write_text('{"username": "local-alice"}\n', encoding="utf-8")
            self.stage(root)
            result = self.scan(root)
            self.assertEqual(result.returncode, 1)
            self.assertIn("HARDCODED_USERNAME", result.stderr)
            self.assertNotIn("local-alice", result.stderr)

    def test_hardcoded_absolute_path_is_blocked_without_echoing_it(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            (root / "settings.py").write_text('CACHE = "/Users/local-alice/cache"\n', encoding="utf-8")
            self.stage(root)
            result = self.scan(root)
            self.assertEqual(result.returncode, 1)
            self.assertIn("ABSOLUTE_UNIX_PATH", result.stderr)
            self.assertNotIn("local-alice", result.stderr)

    def test_private_ip_and_hostname_are_blocked_without_echoing_them(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            (root / "settings.json").write_text(
                '{"hostname": "scanner.local", "endpoint": "10.4.5.6"}\n', encoding="utf-8"
            )
            self.stage(root)
            result = self.scan(root)
            self.assertEqual(result.returncode, 1)
            self.assertIn("HARDCODED_HOSTNAME", result.stderr)
            self.assertIn("PRIVATE_IPV4", result.stderr)
            self.assertNotIn("scanner.local", result.stderr)
            self.assertNotIn("10.4.5.6", result.stderr)

    def test_log_artifact_is_blocked(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            (root / "run.log").write_text("apparently harmless\n", encoding="utf-8")
            self.stage(root)
            result = self.scan(root)
            self.assertEqual(result.returncode, 1)
            self.assertIn("LOG_OR_CACHE_ARTIFACT", result.stderr)

    def test_notebook_outputs_are_blocked(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            notebook = {"cells": [{"cell_type": "code", "outputs": [{"output_type": "stream"}]}]}
            (root / "analysis.ipynb").write_text(json.dumps(notebook), encoding="utf-8")
            self.stage(root)
            result = self.scan(root)
            self.assertEqual(result.returncode, 1)
            self.assertIn("NOTEBOOK_OUTPUTS_PRESENT", result.stderr)

    def test_tex_and_postscript_text_are_scanned(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            (root / "report.tex").write_text("patient_id = synthetic\n", encoding="utf-8")
            (root / "figure.ps").write_text("%%Contact: person@example.test\n", encoding="utf-8")
            self.stage(root)
            result = self.scan(root)
            self.assertEqual(result.returncode, 1)
            self.assertIn("SUSPECTED_FIELD_VALUE", result.stderr)
            self.assertIn("SUSPECTED_EMAIL", result.stderr)
            self.assertNotIn("person@example.test", result.stderr)

    def test_pdf_always_requires_manual_review(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            (root / "report.pdf").write_bytes(b"%PDF-1.4\nnot-a-real-pdf\n")
            self.stage(root)
            result = self.scan(root)
            self.assertEqual(result.returncode, 1)
            self.assertIn("PDF_MANUAL_REVIEW_REQUIRED", result.stderr)

    def test_archive_contents_are_scanned_recursively(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            with zipfile.ZipFile(root / "bundle.zip", "w") as archive:
                archive.writestr("nested/fixture.csv", "patient_id,value\nsynthetic-1,ok\n")
            self.stage(root)
            result = self.scan(root)
            self.assertEqual(result.returncode, 1)
            self.assertIn("SUSPECTED_FIELD_HEADER", result.stderr)
            self.assertIn("ARCHIVE_MANUAL_REVIEW_REQUIRED", result.stderr)
            self.assertNotIn("synthetic-1", result.stderr)

    def test_office_and_dataset_files_require_manual_review(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            with zipfile.ZipFile(root / "report.docx", "w") as document:
                document.writestr("word/document.xml", "<t>person@example.test</t>")
            (root / "records.parquet").write_bytes(b"not-a-real-parquet")
            self.stage(root)
            result = self.scan(root)
            self.assertEqual(result.returncode, 1)
            self.assertIn("OFFICE_MANUAL_REVIEW_REQUIRED", result.stderr)
            self.assertIn("SUSPECTED_EMAIL", result.stderr)
            self.assertIn("MANUAL_REVIEW_DATA_OR_MEDIA", result.stderr)
            self.assertNotIn("person@example.test", result.stderr)

    def test_dicom_sr_suffix_is_treated_as_dicom(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            (root / "report.sr").write_bytes(b"structured-report")
            self.stage(root)
            result = self.scan(root)
            self.assertEqual(result.returncode, 1)
            self.assertIn("DICOM_FILE", result.stderr)

    def test_mac_document_files_require_manual_review(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            with zipfile.ZipFile(root / "document.pages", "w") as document:
                document.writestr("Metadata/Properties.plist", "<t>person@example.test</t>")
            (root / "page.webarchive").write_bytes(b"bplist00not-real-webarchive")
            self.stage(root)
            result = self.scan(root)
            self.assertEqual(result.returncode, 1)
            self.assertIn("MAC_DOCUMENT_MANUAL_REVIEW_REQUIRED", result.stderr)
            self.assertIn("SUSPECTED_EMAIL", result.stderr)
            self.assertNotIn("person@example.test", result.stderr)


class ScanGateHookTests(unittest.TestCase):
    def init_repo(self, directory: Path) -> None:
        subprocess.run(["git", "init", "-q", str(directory)], check=True)

    def stage(self, directory: Path) -> None:
        subprocess.run(["git", "-C", str(directory), "add", "-A"], check=True)

    def test_gitignore_protected_blocks_removed_rule(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            (root / ".gitignore-protected").write_text("data/\nexports/\n", encoding="utf-8")
            (root / ".gitignore").write_text("data/\nexports/\n", encoding="utf-8")
            self.stage(root)
            ok = run("check_gitignore_protected.py", "--repo-root", str(root))
            self.assertEqual(ok.returncode, 0)

            (root / ".gitignore").write_text("data/\n", encoding="utf-8")  # exports/ removed
            self.stage(root)
            bad = run("check_gitignore_protected.py", "--repo-root", str(root))
            self.assertEqual(bad.returncode, 1)
            self.assertIn("exports/", bad.stderr)

    def test_forbidden_paths_blocks_tracked_match(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            (root / ".forbidden-paths").write_text("data/\n*.dcm\n", encoding="utf-8")
            self.stage(root)
            self.assertEqual(run("check_forbidden_paths.py", "--repo-root", str(root)).returncode, 0)

            data = root / "data"
            data.mkdir()
            (data / "records.csv").write_text("x\n", encoding="utf-8")
            subprocess.run(["git", "-C", str(root), "add", "-f", "data/records.csv"], check=True)
            bad = run("check_forbidden_paths.py", "--repo-root", str(root))
            self.assertEqual(bad.returncode, 1)
            self.assertIn("data/records.csv", bad.stderr)

    def test_scan_contract_never_recorded_then_record_then_stale(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            (root / ".scan-contract.json").write_text(
                json.dumps({
                    "version": 1,
                    "scanners": [{"id": "phi-scan", "paths": ["**/*.py"], "record_command": "record phi-scan"}],
                }),
                encoding="utf-8",
            )
            (root / "mod.py").write_text("print('hi')\n", encoding="utf-8")
            self.stage(root)
            never = run("check_scan_contract.py", "--repo-root", str(root))
            self.assertEqual(never.returncode, 1)
            self.assertIn("never been recorded", never.stderr)

            recorded = run("check_scan_contract.py", "--repo-root", str(root), "record", "phi-scan")
            self.assertEqual(recorded.returncode, 0)
            self.stage(root)
            self.assertEqual(run("check_scan_contract.py", "--repo-root", str(root)).returncode, 0)

            (root / "mod.py").write_text("print('changed')\n", encoding="utf-8")
            self.stage(root)
            stale = run("check_scan_contract.py", "--repo-root", str(root))
            self.assertEqual(stale.returncode, 1)
            self.assertIn("stale", stale.stderr)

    def test_scan_contract_inert_without_config(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.init_repo(root)
            self.assertEqual(run("check_scan_contract.py", "--repo-root", str(root)).returncode, 0)


class CommitMessageSensitiveDataTests(unittest.TestCase):
    def run_message(self, content: str) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as temp:
            message = Path(temp) / "commit-message"
            message.write_text(content, encoding="utf-8")
            cmd = [sys.executable, str(ROOT / "hooks" / "scripts" / "check_commit_message_sensitive_data.py"), str(message)]
            return subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)

    def test_sanitized_message_passes(self) -> None:
        self.assertEqual(self.run_message("docs: clarify local validation\n").returncode, 0)

    def test_private_endpoint_in_message_blocks_without_echoing_it(self) -> None:
        result = self.run_message("fix: route request to 10.4.5.6\n")
        self.assertEqual(result.returncode, 1)
        self.assertIn("PRIVATE_IPV4", result.stderr)
        self.assertNotIn("10.4.5.6", result.stderr)


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
