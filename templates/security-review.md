# Security Review: [Title / Scope]

Last reviewed: 2026-07-11
Date: YYYY-MM-DD
Reviewer: [agent or human]
Scope: [files, PR, feature, or system under review]
Classification: routine | elevated | critical

## OWASP Top 10 checklist (2025)

Mark each as ✅ checked-clean | ⚠️ finding | N/A not applicable | — not checked.

| # | Risk | Status | Notes |
|---|---|---|---|
| A01 | Broken Access Control | — | |
| A02 | Security Misconfiguration | — | |
| A03 | Software Supply Chain Failures | — | |
| A04 | Cryptographic Failures | — | |
| A05 | Injection | — | |
| A06 | Insecure Design | — | |
| A07 | Authentication Failures | — | |
| A08 | Software or Data Integrity Failures | — | |
| A09 | Security Logging and Alerting Failures | — | |
| A10 | Mishandling of Exceptional Conditions | — | |

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
