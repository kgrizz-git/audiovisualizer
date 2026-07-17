# Strict PII/PHI Agent Guidance

Last reviewed: 2026-07-14

Use this guidance immediately when the user says the project handles medical data, PHI, PII,
clinical records, FHIR/HL7, DICOM, patient data, regulated data, or comparable identifiers.
Read [`inventory/medical-data-security.md`](../inventory/medical-data-security.md) before
selecting tooling.

This document keeps sensitive data **out of the repository and Git history**. For the
complementary risk — code that leaks PII/PHI/secrets/usernames/IPs/hostnames/paths at runtime
into logs, temp files, test/CI output, caches, telemetry, or third-party/AI calls (in production
*or* development) — see [`sensitive-data-leak-prevention.md`](sensitive-data-leak-prevention.md).

## Non-negotiable agent behavior

- Treat real PII/PHI and production-derived data as prohibited from the repository unless the
  user identifies an approved handling design. Never paste it into code, prompts, issues, PR
  descriptions, test output, logs, screenshots, or external tools.
- Use synthetic fixtures only. Do not create “realistic” examples from a person's information.
- Do not add, edit, or request an automated change to `.phi-security-approvals.json`. Only a
  named human reviewer may approve an exact file, its SHA-256, a reason, and a review reference.
  An agent cannot certify human approval.
- Do not bypass, disable, narrow, or add blanket exclusions to the strict sensitive-data hook.
  There are no directory, glob, test, generated-file, or “agent-generated” exemptions.
- Do not print a suspected match while debugging a scanner finding. Report only the rule ID and
  path to the user. Stop work on the affected file and ask the designated human security/privacy
  reviewer for direction.
- Do not send candidate repository content to a SaaS scanner, model, or GitHub App without the
  user's explicit confirmation that the service and data flow are approved for the data class.
- Run HoundDog only through its local CLI/Docker mode until the user explicitly authorizes a
  broader evaluation. Do not create a cloud account, enable an IDE plug-in, provide an API key,
  connect source control, or upload a report.
- Do not place sensitive details in commit messages. Use a sanitized issue or incident reference;
  the strict `commit-msg` hook has no approval bypass.

## Required setup before the first relevant commit

1. Have a human create `.phi-security-approvals.json` from
   `hooks/phi-security-approvals.json.example`, remove the placeholder entry, and add only
   exact reviewed files if any are permitted.
2. Enable `check-sensitive-data` in `.pre-commit-config.yaml`, run `pre-commit install`, and
   make the hook pass. The hook scans every file in the Git index—not just changed files—and
   checks tests, fixtures, and every tracked directory.
   Enable `check-commit-message-sensitive-data` at the same time.
3. Copy `ci/examples/strict-sensitive-data.yml` to `.github/workflows/` and require the
   `security / sensitive data` job in the default-branch ruleset.
4. Wire the structural gates in
   [`policies/sensitive-data-scan-gates.md`](../policies/sensitive-data-scan-gates.md): copy
   `hooks/gitignore-protected.example` → `.gitignore-protected` (protects required ignore rules),
   `hooks/forbidden-paths.example` → `.forbidden-paths` (forbids tracking data/export dirs), and —
   if heavy scanners apply — `hooks/scan-contract.json.example` → `.scan-contract.json` with a
   committed `.scan-ledger.json`. Enable the matching commented hooks. Only re-`record` a scanner
   after actually running it.
5. Add CODEOWNERS coverage for `.phi-security-approvals.json`, the hooks, workflows, the gate
   configs (`.gitignore`, `.gitignore-protected`, `.forbidden-paths`, `.scan-contract.json`,
   `.scan-ledger.json`), and data fixture paths. Require a human security/privacy owner to approve
   those changes.
6. Run `python3 hooks/scripts/check_sensitive_data.py` before opening the first PR and after
   any tool/configuration change.

## What the first-party guard blocks

- Suspected PII/PHI fields and values in UTF-8 text, including source, markdown, JSON, HTML,
  CSV, test fixtures, unknown text extensions, and XML/text inside `.xlsx` workbooks.
- Absolute Unix/Windows and home-shorthand paths, `file:///` URLs, and hardcoded local
  username/login or hostname values; private IPs, PACS/DICOM URLs, and internal hostnames.
- Log/cache artifacts and notebooks with nonempty output cells.
- Every PDF, pending manual visual/image review and an exact human approval; extractable PDF
  text is additionally scanned when `pypdf` is installed. TeX and UTF-8 PostScript are scanned
  as text, and unreadable PostScript fails closed.
- ZIP/TAR/GZIP archives, Office documents (`.docx`, `.pptx`, `.odt`, `.ods`), Mac document types
  (`.pages`, `.numbers`, `.key`, `.rtfd`, `.webarchive`), structured/binary datasets, and audio/video are
  manual-review artifacts. Archives are recursively inspected where possible; encrypted or
  unreadable archives fail closed. Treat `.sr` as DICOM-SR, not an ordinary text file.
- Every image, DICOM/DICOM-looking file, extensionless file, symbolic link, unreadable binary,
  and oversized file. DICOM does not need a `.dcm` suffix to be blocked.

The only bypass is a committed inventory entry for the exact relative path and SHA-256 with a
named human approver, approval date, review reference, and reason. A content change invalidates
the approval. Passing the guard is not proof that data is safe or de-identified.

## If a finding or accidental disclosure occurs

Do not commit, push, copy, quote, or “clean up” the data in place. Restrict access, preserve
only the minimum incident information required by the organization's process, notify the
designated security/privacy contact, and follow the incident plan. History rewriting comes only
after containment and does not remove clones, Actions artifacts, logs, caches, or external copies.
