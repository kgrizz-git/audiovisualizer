# Security Review: [Title / Scope]

Date: YYYY-MM-DD
Reviewer: [agent or human]
Scope: [files, PR, feature, or system under review]
Classification: routine | elevated | critical

## OWASP Top 10 checklist (2021)

Mark each as ✅ checked-clean | ⚠️ finding | N/A not applicable | — not checked.

| # | Risk | Status | Notes |
|---|---|---|---|
| A01 | Broken Access Control | — | |
| A02 | Cryptographic Failures | — | |
| A03 | Injection | — | |
| A04 | Insecure Design | — | |
| A05 | Security Misconfiguration | — | |
| A06 | Vulnerable & Outdated Components | — | |
| A07 | Identification & Auth Failures | — | |
| A08 | Software & Data Integrity Failures | — | |
| A09 | Security Logging & Monitoring | — | |
| A10 | Server-Side Request Forgery | — | |

## Automated scan results

| Tool | Command run | Result summary |
|---|---|---|
| gitleaks | `gitleaks detect --source .` | |
| pip-audit / npm audit | | |
| Semgrep | `semgrep --config=p/owasp-top-ten .` | |
| grype | `grype .` | |

## Findings

### Critical

- **[Finding title]** — [file:line] — [description and impact]
  - Remediation: [specific action]
  - OWASP: A0X

### High

- (none)

### Medium

- (none)

### Low / informational

- (none)

## Secrets & credentials

- [ ] No secrets in source or history
- [ ] `.env.example` provided (not `.env`)
- [ ] All credentials use environment variables or a secrets manager

## Dependency risk

- [ ] No known critical CVEs in direct dependencies
- [ ] Dependabot / Renovate enabled

## Verdict

**Pass / Pass with conditions / Fail**

Conditions or blocking items before merge/deploy:

- [ ] [item]
