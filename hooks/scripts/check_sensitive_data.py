#!/usr/bin/env python3
"""Block suspected PII/PHI and opaque files from a strict-data repository.

This hook deliberately scans *every tracked file* in the Git index, not only files passed by
pre-commit. It inspects UTF-8 text (including unknown text extensions), XML/text in OOXML/Open
Document workbooks, and recursively inspectable ZIP/TAR/GZIP archives. PDFs, Office documents,
archives, DICOM, media, datasets, extensionless, symbolic-link, and unreadable binary files are
blocked unless their exact path and SHA-256 appear in a human-approved inventory.

Usage:
  python hooks/scripts/check_sensitive_data.py
  python hooks/scripts/check_sensitive_data.py --repo-root /path/to/repo

The required inventory is .phi-security-approvals.json in the repository root. See
hooks/phi-security-approvals.json.example and inventory/medical-data-security.md.

The hook intentionally never prints a suspected value. A pass means only that the configured
heuristics found nothing; it is not a determination that a file is free of PII or PHI.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import tarfile
import zipfile
from dataclasses import dataclass
from datetime import date
from pathlib import Path

APPROVAL_FILE = ".phi-security-approvals.json"
MAX_SCAN_BYTES = int(os.getenv("PHI_SCAN_MAX_BYTES", str(10 * 1024 * 1024)))

IMAGE_EXTENSIONS = {
    ".avif", ".bmp", ".gif", ".heic", ".heif", ".ico", ".jpeg", ".jpg", ".png",
    ".raw", ".svg", ".tif", ".tiff", ".webp",
}
XLSX_EXTENSIONS = {".xlsx", ".xlsm", ".xltx", ".xltm"}
OFFICE_REVIEW_EXTENSIONS = {".docx", ".ods", ".odt", ".pptx"}
MAC_DOCUMENT_REVIEW_EXTENSIONS = {".key", ".numbers", ".pages", ".rtfd", ".webarchive"}
DATASET_REVIEW_EXTENSIONS = {".avro", ".db", ".feather", ".h5", ".hdf5", ".parquet", ".sqlite", ".sqlite3"}
MEDIA_REVIEW_EXTENSIONS = {".aac", ".avi", ".flac", ".m4a", ".mkv", ".mov", ".mp3", ".mp4", ".wav"}
BLOCKED_ARTIFACT_EXTENSIONS = {".cache", ".err", ".log", ".out", ".pkl", ".trace"}
FIELD_NAMES = (
    "accession", "accession_number", "address", "birth_date", "date_of_birth", "dateofbirth",
    "diagnosis", "dob", "email", "exam_date", "first_name", "firstname", "health_plan",
    "institution_name", "last_name", "lastname", "medical_record", "medical_record_number",
    "member_id", "mrn", "npi", "operator_name", "patient_age", "patient_id", "patient_name",
    "patient_sex", "patientbirthdate", "patientname", "performing_physician", "phone",
    "procedure_date", "procedure_id", "social_security", "ssn", "station_name", "study_id",
    "study_uid", "subject_id", "treatment",
)
FIELD_ALT = "|".join(re.escape(field) for field in FIELD_NAMES)
RULES: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("SUSPECTED_FIELD_VALUE", re.compile(rf"(?i)[\"']?(?:{FIELD_ALT})[\"']?\s*[:=]")),
    ("SUSPECTED_FIELD_INDEX", re.compile(rf"(?i)\[\s*[\"'](?:{FIELD_ALT})[\"']\s*\]")),
    ("SUSPECTED_FIELD_HEADER", re.compile(rf"(?im)^\s*(?:{FIELD_ALT})\s*(?:,|\t|;|\|)")),
    ("SUSPECTED_FIELD_XML_TEXT", re.compile(rf"(?i)>(?:{FIELD_ALT})<")),
    ("SUSPECTED_FHIR_PATIENT", re.compile(r"(?i)[\"']resourceType[\"']\s*[:=]\s*[\"']Patient[\"']")),
    ("SUSPECTED_EMAIL", re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)),
    ("SUSPECTED_US_SSN", re.compile(r"\b\d{3}-\d{2}-\d{4}\b")),
    ("SUSPECTED_US_PHONE", re.compile(r"(?<!\d)(?:\+?1[ .-]?)?(?:\(?\d{3}\)?[ .-])\d{3}[ .-]\d{4}(?!\d)")),
    ("ABSOLUTE_UNIX_PATH", re.compile(r"(?<![\w.])/(?:Users|home|root|private)/[^\s'\"`]+")),
    ("ABSOLUTE_WINDOWS_PATH", re.compile(r"(?i)(?<!\w)[A-Z]:\\(?:Users|Documents and Settings)\\")),
    ("FILE_URL", re.compile(r"(?i)file:///(?:Users|home|root|private)/")),
    ("HOME_SHORTHAND_PATH", re.compile(r"(?<!\w)~/(?:\.ssh|\.config|Desktop|Documents|Downloads)/")),
    ("HARDCODED_USERNAME", re.compile(
        r"(?im)[\"']?(?:username|user_name|login_name|local_user|os_user)[\"']?\s*[:=]\s*[\"'][^\"'${}<>\s]+[\"']"
    )),
    ("HARDCODED_LOGIN_ENV", re.compile(r"(?im)^\s*(?:export\s+)?(?:USER|LOGNAME)=[^\s$\"']+")),
    ("HARDCODED_HOSTNAME", re.compile(
        r"(?im)[\"']?(?:hostname|host_name|computer_name|machine_name)[\"']?\s*[:=]\s*[\"'][^\"'${}<>\s]+[\"']"
    )),
    ("PRIVATE_IPV4", re.compile(
        r"\b(?:10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2})\b"
    )),
    ("PRIVATE_IPV6", re.compile(r"(?i)\b(?:fc|fd)[0-9a-f]{2}:[0-9a-f:]+|\bfe80:[0-9a-f:]+")),
    ("INTERNAL_SERVICE_URL", re.compile(r"(?i)\b(?:dicom|pacs)://")),
    ("INTERNAL_HOSTNAME", re.compile(r"(?i)\b[a-z0-9][a-z0-9.-]*\.(?:local|internal|corp|lan)\b")),
)
AUTOMATION_APPROVER = re.compile(r"\b(?:ai|agent|bot|claude|codex|copilot)\b", re.IGNORECASE)


@dataclass(frozen=True)
class Approval:
    path: str
    sha256: str
    kind: str
    approved_by: str
    approved_on: str
    approval_reference: str
    reason: str


def git_tracked_files(root: Path) -> list[str]:
    result = subprocess.run(
        ["git", "-C", str(root), "ls-files", "-z", "--cached"],
        check=False,
        capture_output=True,
    )
    if result.returncode:
        raise RuntimeError("could not list tracked files with git ls-files --cached")
    return [path for path in result.stdout.decode("utf-8", errors="strict").split("\0") if path]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_approvals(root: Path) -> tuple[dict[str, Approval], list[tuple[str, str]]]:
    inventory = root / APPROVAL_FILE
    if not inventory.is_file():
        return {}, [("APPROVAL_INVENTORY_MISSING", f"missing required {APPROVAL_FILE}")]
    try:
        payload = json.loads(inventory.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}, [("APPROVAL_INVENTORY_INVALID", f"cannot parse {APPROVAL_FILE} as JSON")]

    errors: list[tuple[str, str]] = []
    approvals: dict[str, Approval] = {}
    if not isinstance(payload, dict) or payload.get("version") != 1:
        return {}, [("APPROVAL_INVENTORY_INVALID", "inventory must be an object with version 1")]
    entries = payload.get("approvals")
    if not isinstance(entries, list):
        return {}, [("APPROVAL_INVENTORY_INVALID", "inventory approvals must be a list")]

    required = ("path", "sha256", "kind", "approved_by", "approved_on", "approval_reference", "reason")
    for position, entry in enumerate(entries, start=1):
        if not isinstance(entry, dict) or any(not isinstance(entry.get(key), str) or not entry[key].strip() for key in required):
            errors.append(("APPROVAL_INVENTORY_INVALID", f"approval entry {position} is missing required human-approval metadata"))
            continue
        candidate = Path(entry["path"])
        if candidate.is_absolute() or ".." in candidate.parts or entry["path"] != candidate.as_posix():
            errors.append(("APPROVAL_INVENTORY_INVALID", f"approval entry {position} has a non-portable path"))
            continue
        if not re.fullmatch(r"[0-9a-fA-F]{64}", entry["sha256"]):
            errors.append(("APPROVAL_INVENTORY_INVALID", f"approval entry {position} has an invalid SHA-256"))
            continue
        if AUTOMATION_APPROVER.search(entry["approved_by"]):
            errors.append(("APPROVAL_INVENTORY_INVALID", f"approval entry {position} must name a human approver, not automation"))
            continue
        try:
            date.fromisoformat(entry["approved_on"])
        except ValueError:
            errors.append(("APPROVAL_INVENTORY_INVALID", f"approval entry {position} has an invalid approval date"))
            continue
        if entry["path"] in approvals:
            errors.append(("APPROVAL_INVENTORY_INVALID", f"approval entry {position} duplicates a path"))
            continue
        approvals[entry["path"]] = Approval(**{key: entry[key].strip() for key in required})
    return approvals, errors


def is_dicom(data: bytes, path: Path) -> bool:
    return path.suffix.lower() in {".dcm", ".dicom", ".sr"} or (len(data) >= 132 and data[128:132] == b"DICM")


def line_number(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def scan_text(label: str, data: bytes) -> list[tuple[str, str]]:
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return [("UNSCANNABLE_BINARY", f"{label} is not UTF-8 text")]
    findings: list[tuple[str, str]] = []
    for rule_id, pattern in RULES:
        match = pattern.search(text)
        if match:
            findings.append((rule_id, f"{label}:{line_number(text, match.start())}"))
    return findings


def scan_zip_bytes(label: str, data: bytes, depth: int = 0) -> list[tuple[str, str]]:
    if depth > 3 or len(data) > MAX_SCAN_BYTES:
        return [("UNSCANNABLE_ARCHIVE", f"{label} exceeds archive scan limits")]
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            findings: list[tuple[str, str]] = []
            expanded_size = 0
            for member in archive.infolist():
                if member.is_dir():
                    continue
                expanded_size += member.file_size
                if member.file_size > MAX_SCAN_BYTES or expanded_size > MAX_SCAN_BYTES:
                    return [("UNSCANNABLE_ARCHIVE", f"{label} exceeds expanded archive scan limits")]
                if member.flag_bits & 0x1:
                    findings.append(("ENCRYPTED_ARCHIVE_MEMBER", f"{label}!{member.filename}"))
                    continue
                findings.extend(scan_archive_member(f"{label}!{member.filename}", archive.read(member), depth + 1))
            return findings
    except (OSError, zipfile.BadZipFile, RuntimeError):
        return [("UNSCANNABLE_ARCHIVE", f"{label} could not be read as ZIP data")]


def scan_xlsx(path: Path) -> list[tuple[str, str]]:
    if path.stat().st_size > MAX_SCAN_BYTES:
        return [("UNSCANNABLE_XLSX", f"{path} exceeds {MAX_SCAN_BYTES} byte scan limit")]
    findings = scan_zip_bytes(str(path), path.read_bytes())
    return [(rule, location.replace("UNSCANNABLE_ARCHIVE", "UNSCANNABLE_XLSX")) for rule, location in findings]


def scan_notebook(path: Path) -> list[tuple[str, str]]:
    try:
        data = path.read_bytes()
        notebook = json.loads(data.decode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return [("UNSCANNABLE_NOTEBOOK", f"{path} could not be read as UTF-8 notebook JSON")]
    findings = scan_text(str(path), data)
    cells = notebook.get("cells") if isinstance(notebook, dict) else None
    if not isinstance(cells, list):
        return findings + [("UNSCANNABLE_NOTEBOOK", f"{path} has no valid cells list")]
    for cell in cells:
        if isinstance(cell, dict) and cell.get("outputs"):
            return findings + [("NOTEBOOK_OUTPUTS_PRESENT", f"{path} contains a nonempty output cell")]
    return findings


def scan_pdf(path: Path) -> list[tuple[str, str]]:
    """Scan extractable PDF text, but always require human visual/image review."""
    findings = [("PDF_MANUAL_REVIEW_REQUIRED", f"{path} requires exact human approval")]
    try:
        from pypdf import PdfReader  # type: ignore[import-not-found]
    except ImportError:
        return findings + [("PDF_TEXT_EXTRACTION_UNAVAILABLE", f"{path} requires optional pypdf text scan")]
    try:
        reader = PdfReader(str(path))
        for page_number, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            findings.extend(scan_text(f"{path}:page-{page_number}", text.encode("utf-8")))
    except Exception:
        return findings + [("UNSCANNABLE_PDF", f"{path} could not be text-extracted")]
    return findings


def is_archive_name(label: str) -> bool:
    name = label.lower()
    return name.endswith((".7z", ".gz", ".tar", ".tar.gz", ".tgz", ".zip"))


def scan_tar_bytes(label: str, data: bytes, depth: int) -> list[tuple[str, str]]:
    try:
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:*") as archive:
            findings: list[tuple[str, str]] = []
            expanded_size = 0
            for member in archive.getmembers():
                if not member.isfile():
                    continue
                expanded_size += member.size
                if member.size > MAX_SCAN_BYTES or expanded_size > MAX_SCAN_BYTES:
                    return [("UNSCANNABLE_ARCHIVE", f"{label} exceeds expanded archive scan limits")]
                handle = archive.extractfile(member)
                if handle is None:
                    return [("UNSCANNABLE_ARCHIVE", f"{label}!{member.name} could not be extracted")]
                findings.extend(scan_archive_member(f"{label}!{member.name}", handle.read(), depth + 1))
            return findings
    except (OSError, tarfile.TarError):
        return [("UNSCANNABLE_ARCHIVE", f"{label} could not be read as TAR data")]


def scan_archive_bytes(label: str, data: bytes, depth: int) -> list[tuple[str, str]]:
    if depth > 3 or len(data) > MAX_SCAN_BYTES:
        return [("UNSCANNABLE_ARCHIVE", f"{label} exceeds archive scan limits")]
    if label.lower().endswith(".7z"):
        return [("UNSCANNABLE_ARCHIVE", f"{label} is a 7z archive requiring human review")]
    if zipfile.is_zipfile(io.BytesIO(data)):
        return scan_zip_bytes(label, data, depth)
    if label.lower().endswith((".tar", ".tar.gz", ".tgz")):
        return scan_tar_bytes(label, data, depth)
    if label.lower().endswith(".gz"):
        try:
            return scan_archive_member(label[:-3], gzip.decompress(data), depth + 1)
        except OSError:
            return [("UNSCANNABLE_ARCHIVE", f"{label} could not be decompressed")]
    return [("UNSCANNABLE_ARCHIVE", f"{label} has an unsupported archive format")]


def scan_archive_member(label: str, data: bytes, depth: int) -> list[tuple[str, str]]:
    path = Path(label)
    suffix = path.suffix.lower()
    if not suffix:
        return [("EXTENSIONLESS_FILE", f"{label} requires exact human approval")]
    if suffix in IMAGE_EXTENSIONS:
        return [("IMAGE_FILE", f"{label} requires exact human approval for pixel-data review")]
    if is_dicom(data[:132], path):
        return [("DICOM_FILE", f"{label} requires exact human approval for metadata and pixel-data review")]
    if suffix in BLOCKED_ARTIFACT_EXTENSIONS:
        return [("LOG_OR_CACHE_ARTIFACT", f"{label} requires exact human approval")]
    if suffix == ".pdf":
        return [("PDF_MANUAL_REVIEW_REQUIRED", f"{label} requires exact human approval")]
    if suffix in DATASET_REVIEW_EXTENSIONS | MEDIA_REVIEW_EXTENSIONS:
        return [("MANUAL_REVIEW_DATA_OR_MEDIA", f"{label} requires exact human approval")]
    if suffix in OFFICE_REVIEW_EXTENSIONS:
        return scan_zip_bytes(label, data, depth) + [("OFFICE_MANUAL_REVIEW_REQUIRED", f"{label} requires exact human approval")]
    if suffix in MAC_DOCUMENT_REVIEW_EXTENSIONS:
        if zipfile.is_zipfile(io.BytesIO(data)):
            return scan_zip_bytes(label, data, depth) + [("MAC_DOCUMENT_MANUAL_REVIEW_REQUIRED", f"{label} requires exact human approval")]
        return [("MAC_DOCUMENT_MANUAL_REVIEW_REQUIRED", f"{label} requires exact human approval")]
    if is_archive_name(label):
        return scan_archive_bytes(label, data, depth) + [("ARCHIVE_MANUAL_REVIEW_REQUIRED", f"{label} requires exact human approval")]
    if len(data) > MAX_SCAN_BYTES:
        return [("UNSCANNABLE_LARGE_FILE", f"{label} exceeds {MAX_SCAN_BYTES} byte scan limit")]
    return scan_text(label, data)


def scan_path(root: Path, relative: str, approvals: dict[str, Approval]) -> list[tuple[str, str]]:
    path = root / relative
    if not path.exists() and not path.is_symlink():  # staged deletion
        return []
    if path.is_symlink() or not path.is_file():
        return [("UNSCANNABLE_SPECIAL_FILE", f"{relative} is not a regular file")]
    approval = approvals.get(relative)
    if approval and approval.sha256.lower() == sha256(path).lower():
        return []
    if approval:
        return [("APPROVAL_HASH_MISMATCH", f"{relative} differs from its human-approved SHA-256")]
    size = path.stat().st_size
    with path.open("rb") as handle:
        header = handle.read(132)
    if not path.suffix:
        return [("EXTENSIONLESS_FILE", f"{relative} requires exact human approval")]
    if path.suffix.lower() in IMAGE_EXTENSIONS:
        return [("IMAGE_FILE", f"{relative} requires exact human approval for pixel-data review")]
    if is_dicom(header, path):
        return [("DICOM_FILE", f"{relative} requires exact human approval for metadata and pixel-data review")]
    if path.suffix.lower() in BLOCKED_ARTIFACT_EXTENSIONS:
        return [("LOG_OR_CACHE_ARTIFACT", f"{relative} requires exact human approval")]
    if path.suffix.lower() in DATASET_REVIEW_EXTENSIONS | MEDIA_REVIEW_EXTENSIONS:
        return [("MANUAL_REVIEW_DATA_OR_MEDIA", f"{relative} requires exact human approval")]
    if size > MAX_SCAN_BYTES:
        return [("UNSCANNABLE_LARGE_FILE", f"{relative} exceeds {MAX_SCAN_BYTES} byte scan limit")]
    if path.suffix.lower() == ".pdf":
        return scan_pdf(path)
    if path.suffix.lower() in XLSX_EXTENSIONS:
        return scan_xlsx(path)
    if path.suffix.lower() in OFFICE_REVIEW_EXTENSIONS:
        return scan_zip_bytes(relative, path.read_bytes()) + [
            ("OFFICE_MANUAL_REVIEW_REQUIRED", f"{relative} requires exact human approval")
        ]
    if path.suffix.lower() in MAC_DOCUMENT_REVIEW_EXTENSIONS:
        data = path.read_bytes()
        if zipfile.is_zipfile(io.BytesIO(data)):
            return scan_zip_bytes(relative, data, 0) + [
                ("MAC_DOCUMENT_MANUAL_REVIEW_REQUIRED", f"{relative} requires exact human approval")
            ]
        return [("MAC_DOCUMENT_MANUAL_REVIEW_REQUIRED", f"{relative} requires exact human approval")]
    if is_archive_name(relative):
        return scan_archive_bytes(relative, path.read_bytes(), 0) + [
            ("ARCHIVE_MANUAL_REVIEW_REQUIRED", f"{relative} requires exact human approval")
        ]
    if path.suffix.lower() == ".ipynb":
        return scan_notebook(path)
    return scan_text(relative, path.read_bytes())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", default=None, help="repository root; defaults to the current Git root")
    args = parser.parse_args()
    if args.repo_root:
        root = Path(args.repo_root).resolve()
    else:
        result = subprocess.run(["git", "rev-parse", "--show-toplevel"], check=False, capture_output=True, text=True)
        if result.returncode:
            print("[sensitive-data] ERROR NOT_A_GIT_REPOSITORY", file=sys.stderr)
            return 1
        root = Path(result.stdout.strip()).resolve()

    approvals, findings = load_approvals(root)
    if not findings:
        try:
            tracked = git_tracked_files(root)
        except RuntimeError as error:
            print(f"[sensitive-data] ERROR GIT_INDEX_UNAVAILABLE: {error}", file=sys.stderr)
            return 1
        tracked_set = set(tracked)
        for relative in approvals:
            if relative not in tracked_set:
                findings.append(("APPROVAL_PATH_NOT_TRACKED", f"{relative} is listed in {APPROVAL_FILE} but is not tracked"))
        for relative in tracked:
            findings.extend(scan_path(root, relative, approvals))

    for rule_id, location in findings:
        print(f"[sensitive-data] ERROR {rule_id}: {location}", file=sys.stderr)
    if findings:
        print(
            "[sensitive-data] Do not commit the file. Remove the data or obtain explicit human approval "
            f"for the exact path and SHA-256 in {APPROVAL_FILE}.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
