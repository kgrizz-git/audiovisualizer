# Medical Data Security Tools & Strict Guard Setup

Last reviewed: 2026-07-14

This menu is for repositories that may handle PII, PHI, clinical data, FHIR/HL7, DICOM, or
other regulated records. Start with the first-party strict guard below; use external tools only
after the organization approves the data flow, access, retention, and contracts. A successful
scan is not evidence of HIPAA compliance or complete de-identification.

## First-party strict guard: install now

This template supplies a fail-closed check that scans **every Git-indexed file**, including
tests and fixtures. It examines UTF-8 text and text/XML in `.xlsx` workbooks for suspected
PII/PHI fields, identifier-like values, hardcoded usernames, and absolute/home paths. It blocks
private IPs/internal hostnames/PACS URLs, log/cache artifacts, and notebooks with output cells.
It also blocks images, DICOM (including files identified by DICOM magic bytes), extensionless
files, symbolic links, unreadable binary files, and oversized files because they can conceal
PHI or burned-in pixels.

PDFs are always manual-review artifacts: the guard blocks them even when text extraction finds
nothing, because PDFs can contain rasterized/vector images. Install `pypdf` in the approved local
environment to add extractable-text scanning; the human reviewer must still inspect pages/images
before adding an exact SHA-256 approval. `.tex` and UTF-8 PostScript (`.ps`) files are scanned as
text; unreadable PostScript fails closed. Never commit generated PDF reports, plots, or exports
without that review.

ZIP/TAR/GZIP archives are recursively inspected within bounded depth/size limits, then require
manual approval themselves. Encrypted or unreadable archives fail closed. Office documents
(`.docx`, `.pptx`, `.odt`, `.ods`) and Mac document types (`.pages`, `.numbers`, `.key`,
`.rtfd`, `.webarchive`) have their extractable XML/plist/text scanned (when structured as ZIP containers)
but still require manual review for embedded preview thumbnails (`QuickLook/Preview.jpg`) or media.
SQLite/Parquet/Avro/Feather/HDF5 datasets and audio/video files are blocked for manual
review; DICOM-SR (`.sr`) is handled as DICOM. These controls are intentionally conservative—use
an approved local extractor only after a human authorizes a more specialized data workflow.

1. Have a human create the root approval inventory. Do not let an agent author it:

   ```sh
   cp hooks/phi-security-approvals.json.example .phi-security-approvals.json
   ```

   Remove the placeholder approval. The human may add an entry only after reviewing the exact
   file for PII/PHI and recording its path, SHA-256, name, date, review reference, and reason.
   No globs, directories, test exemptions, or mutable approvals are supported. A changed hash
   blocks the file again.

2. Uncomment `check-sensitive-data` and `check-commit-message-sensitive-data` in
   `.pre-commit-config.yaml`, then install and run the tracked-file guard:

   ```sh
   pre-commit install
   python3 hooks/scripts/check_sensitive_data.py
   ```

3. Copy [`ci/examples/strict-sensitive-data.yml`](../ci/examples/strict-sensitive-data.yml) to
   `.github/workflows/`, and require its `security / sensitive data` job in the default-branch
   GitHub ruleset. Protect the inventory, hook, workflow, and fixture paths with CODEOWNERS.

The guard emits a rule ID and location, never the matched value. It purposefully has no “safe
directory” setting. If it blocks a required artifact, remove it or obtain an exact, documented,
human approval; do not weaken the scanner.

The commit-message guard has no approval inventory. Never place PHI/PII, a local username or
path, IP/hostname, PACS endpoint, or similar operational detail in immutable Git history; use a
sanitized issue or incident reference.

## Tools to evaluate after the guard is in place

| Tool | Use | Setup / caution |
|---|---|---|
| [HoundDog.ai](https://docs.hounddog.ai/cloud/overview) | **Preferred next evaluation:** privacy code/data-flow scanning across code, logs, files, third-party SDKs, and AI/LLM paths; HIPAA-oriented privacy analysis | **Local CLI/Docker only until further user authorization.** Do not create a cloud account, use an IDE plug-in, provide an API key, connect GitHub/SCM, upload reports, or make it a required check. Any later cloud/SCM use needs a separate privacy/security approval for code access, retention, subprocessors, and any required BAA/DPA. |
| [phi-scan](https://pypi.org/project/phi-scan/) | Local-first PHI/PII scanning for source, config, structured data, and Git diffs | Install with `pipx install phi-scan`; evaluate its pre-commit/CI output against synthetic fixtures. Pin the version and test before gating because its current PyPI release is alpha. |
| [Microsoft Presidio](https://microsoft.github.io/presidio/) | Custom PII recognizers and text/structured/image redaction workflows | Run locally or on an approved isolated runner; add domain-specific recognizers. Its documentation warns that it cannot find all sensitive information. |
| [NVIDIA GLiNER PII](https://huggingface.co/nvidia/gliner-PII) | Local, context-aware entity detection for text missed by deterministic patterns | Evaluate as a second-pass local model behind the strict regex gate. The model is large (~1.8 GB) and under the NVIDIA Open Model License; pin a reviewed revision, test recall/false positives on synthetic clinical text, and avoid logging detected spans. |
| [dicom-phi-scan](https://github.com/elijahrockers/dicom-phi-scan) | Candidate DICOM review: metadata tags plus OCR of burned-in pixel text | Promising two-layer approach (`pydicom` + OCR), but it is a small project with no published release at review time. Pin a commit, test only with synthetic DICOM, keep scan reports out of Git, and do not use its result as a substitute for human approval of an image/DICOM fixture. |
| [@certifieddata/pii-scan](https://github.com/certifieddata/pii-scan) | Quick local CSV/JSON heuristic scan for synthetic-data development | Diagnostic only, not a strict gate. Its documented console output includes redacted sample values, which can still be sensitive in terminal/CI logs; do not run it on real PHI or add it to CI without a safe-output review. |
| Local OCR libraries (`pytesseract`, `rapidocr`, `surya-ocr`, `docTR`) | Deterministic, high-throughput offline OCR for scanned PDFs, images, and document pipelines prior to regex/Presidio text redaction | Install in an isolated local/CI environment (`pip install rapidocr_onnxruntime surya-ocr`). Run offline on image/document ingest. Ensure OCR text output is piped directly into redaction recognizers without logging unredacted raw text or storing interim OCR dumps in Git. |
| Local AI multimodal vision (`qwen2-vl`, `llava`, `moondream2` via Ollama) | Contextual detection of visual PII/PHI (e.g., patient ID wristbands, handwritten notes, signatures, badges, or complex table layouts) missed by deterministic OCR | Run strictly offline via local inference engines (`ollama`, `vllm`). Pin exact model digests. The models are heavy (2GB–8GB+); test latency and false positives on synthetic clinical/image fixtures. Never send candidate images or OCR text to cloud LLM/vision APIs without explicit data-flow approval and required BAAs. |
| DICOM metadata + OCR tooling | Only when a human approves a DICOM/image workflow | Inspect both metadata and burned-in pixels. Do not treat a filename extension or a metadata-only pass as proof that an image is safe. |
| GitHub secret scanning / gitleaks | Credentials and high-confidence organization-specific secrets | Keep enabled, but do not mistake it for PHI detection. See [`inventory/security-quality.md`](security-quality.md). |

Use the strict guard with—not instead of—threat modeling, access control, encryption, audit,
retention, incident response, and legal/privacy review. See
[`policies/github-repository-hygiene.md`](../policies/github-repository-hygiene.md) and
[`prompts/strict-phi-agent-guidance.md`](../prompts/strict-phi-agent-guidance.md).

### Local OCR and AI vision evaluation guidance

When a project ingests, processes, or exports scanned documents, PDFs, images, or DICOM files, the bootstrap process should recommend evaluating local OCR or local multimodal AI vision models before data ingestion:

1. **Start deterministic (`rapidocr_onnxruntime` or `pytesseract`)**: For clean scans and standard document layouts, conventional OCR engines are fast, lightweight, and deterministic. Pair OCR output with regex rules or Presidio to flag and mask PII/PHI.
2. **Layer local AI vision where necessary (`qwen2-vl`, `llava`, `moondream2`)**: For complex layouts, handwritten clinical notes, or visual identifiers in photographs, evaluate local open-weight vision models running offline via Ollama.
3. **Fail closed on OCR errors**: If an image or document cannot be extracted or processed by local OCR, block ingestion until human review. Never log unredacted OCR text to terminal or CI outputs.

### HoundDog evaluation sequence

1. Use only the local CLI/Docker scanner on a synthetic fixture project. Do not create a cloud
   account, use an IDE plug-in, supply an API key, or connect a source-control provider unless
   the user later explicitly authorizes that expansion.
2. Run the local CLI/Docker scanner and record only sanitized finding categories, paths, and
   remediation—not source snippets or detected values—in the evaluation notes.
3. Compare its data-flow findings with the strict first-party guard, CodeQL/Semgrep, and a human
   privacy review. Tune ownership and false-positive handling before introducing a merge gate.
4. If the user later authorizes a cloud/SCM evaluation, review GitHub App, IDE, API-key,
   report-retention, subprocessor, and contractual implications separately. Local scanning does
   not authorize any of those integrations.
5. If a later authorized integration is adopted, protect its configuration and required-check
   name with CODEOWNERS; retain the
   first-party guard because HoundDog does not replace exact-file approval for images/DICOM or
   the commit-message gate.
