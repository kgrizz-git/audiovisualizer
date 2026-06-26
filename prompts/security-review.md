# Security Review Prompt

Run a structured security review of the specified scope and produce a completed
[`templates/security-review.md`](../templates/security-review.md) artifact.

## Scope

State what is being reviewed: a PR diff, a set of files, a feature, or a full module.
Check with the user if scope is ambiguous.

## Process

1. **Run automated scans first** — collect machine-readable signal before manual review.

   ```bash
   # Secrets
   gitleaks detect --source . --verbose

   # Dependencies
   pip-audit            # Python
   npm audit            # Node

   # SAST — OWASP Top 10
   semgrep --config=p/owasp-top-ten .
   semgrep --config=p/python-security .   # or language-specific ruleset

   # Vulnerabilities (filesystem scan)
   grype .
   ```

2. **Manual review** — walk through the OWASP Top 10 checklist in the template.
   For each category, cite specific file/line evidence or mark N/A.

3. **Check secrets & credentials** — no `.env` committed, no keys in history,
   `.env.example` present.

4. **Check dependency risk** — outdated direct deps with known CVEs; Dependabot status.

5. **Fill in the template** — every section. Mark findings with severity.

## Output

A completed `templates/security-review.md` with:

- Automated scan results (tool, command, summary).
- OWASP checklist filled in per-item.
- Findings ordered by severity with file:line references and specific remediation steps.
- Clear verdict: Pass / Pass with conditions / Fail.

## Constraints

- Do not fix findings during the review unless explicitly asked. Produce the assessment first.
- Cite evidence for every finding. Do not report theoretical issues without code evidence.
- Mark items N/A explicitly — a blank is ambiguous.
