# Security And Quality Tools

Last reviewed: 2026-07-14

Choose tools based on project language, deployment model, data sensitivity, and team workflow.
See [`policies/security-baseline.md`](../policies/security-baseline.md) for what to enforce
and when.

---

## OWASP Top 10 (2021) — reference & tooling map

The [OWASP Top 10](https://owasp.org/www-project-top-ten/) is the canonical web application
security risk list. Cite it when justifying security requirements; run the tools below to
check for compliance. The `.cursor/rules/` and `.windsurf/rules/` CodeGuard files already
implement many of these as coding rules — the table below maps them.

| # | Risk | CodeGuard rule | Automated check |
|---|---|---|---|
| A01 | Broken Access Control | `codeguard-0-authorization-access-control` | Semgrep `p/owasp-top-ten` |
| A02 | Cryptographic Failures | `codeguard-0-additional-cryptography`, `codeguard-1-crypto-algorithms`, `codeguard-1-digital-certificates` | Semgrep, Bandit `B3xx` |
| A03 | Injection (SQL, XSS, cmd, LDAP…) | `codeguard-0-input-validation-injection`, `codeguard-0-client-side-web-security`, `codeguard-0-xml-and-serialization` | Semgrep, Bandit `B6xx`, CodeQL |
| A04 | Insecure Design | (design review) | Threat modeling, OWASP ASVS |
| A05 | Security Misconfiguration | `codeguard-0-devops-ci-cd-containers`, `codeguard-0-cloud-orchestration-kubernetes`, `codeguard-0-iac-security` | Checkov, Trivy, Grype |
| A06 | Vulnerable & Outdated Components | `codeguard-0-supply-chain-security` | pip-audit, npm audit, grype, Dependabot |
| A07 | Identification & Auth Failures | `codeguard-0-authentication-mfa`, `codeguard-0-session-management-and-cookies` | Semgrep, manual review |
| A08 | Software & Data Integrity Failures | `codeguard-0-supply-chain-security` | Sigstore, SLSA, SBOM (syft) |
| A09 | Security Logging & Monitoring | `codeguard-0-logging` | Log review, SIEM |
| A10 | Server-Side Request Forgery | `codeguard-0-api-web-services` | Semgrep `p/owasp-top-ten` |

### Running OWASP checks

```bash
# Semgrep — OWASP Top 10 ruleset (works on Python, JS, TS, Java, Go, Ruby, and more)
pip install semgrep
semgrep --config=p/owasp-top-ten .

# Language-specific companion rulesets (add alongside owasp-top-ten):
semgrep --config=p/python-security .
semgrep --config=p/javascript .
semgrep --config=p/typescript .
semgrep --config=p/golang .

# Bandit — Python SAST (maps to A02, A03, A06, A07)
pip install bandit
bandit -r . -ll    # -ll = medium+high severity only

# OWASP Dependency-Check — known CVEs in JVM/Node/Python/.NET deps (maps to A06)
# https://owasp.org/www-project-dependency-check/
# Run via Docker: docker run --rm -v $(pwd):/src owasp/dependency-check --scan /src

# OWASP ZAP — DAST (dynamic) web scanner (maps to A01-A10 at runtime)
# https://www.zaproxy.org/ — use in CI against a running app, not as a pre-commit hook
```

### OWASP ASVS

The [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/)
is a detailed checklist (L1/L2/L3) for deeper compliance work. Reference it when writing
`templates/security-review.md` assessments for high-sensitivity projects.

---

## Secret scanning

| Tool | When to use |
|---|---|
| **gitleaks** | Pre-commit + CI; fast, low false-positive, good baseline |
| **TruffleHog** | History scan; detects secrets in past commits, not just current |
| GitHub Advanced Security secret scanning | If on GitHub; catches pushed secrets automatically |

```bash
# gitleaks — scan current files
brew install gitleaks   # or: go install
gitleaks detect --source . --verbose

# TruffleHog — scan full git history
pip install trufflehog
trufflehog git file://. --only-verified
```

---

## Sensitive-data detection (PII / PHI)

These tools supplement—never prove—the rule that production and real regulated data should
not enter source control. Run them locally or on an approved runner, redact matches from logs,
and validate recall and false positives using synthetic fixtures before making a check block a
PR. See [`policies/github-repository-hygiene.md`](../policies/github-repository-hygiene.md)
for the required-check and data-handling model. For a strict first-party hook, human approval
inventory, and medical setup instructions, see
[`inventory/medical-data-security.md`](medical-data-security.md).

| Tool | Best fit | Notes |
|---|---|---|
| [Microsoft Presidio](https://microsoft.github.io/presidio/) | Text, structured data, and images; custom PII recognizers | Local/open-source detection and redaction components; add domain-specific recognizers. It explicitly does not guarantee that all sensitive information is found. |
| [phi-scan](https://pypi.org/project/phi-scan/) | Healthcare/FHIR source, config, and structured-data diffs | Local-first PHI/PII scanner with pre-commit/CI-oriented diff scanning and SARIF output. Pin and test before adoption; its PyPI release is currently marked alpha. |

For medical images, scanned PDFs, and other binaries, evaluate both metadata and visual/OCR
paths—or prohibit those file types outright—because a text-only scanner will not see embedded
or burned-in identifiers.

---

## Dependency vulnerability scanning

| Tool | Ecosystem | Notes |
|---|---|---|
| `pip-audit` | Python | Fast, uses OSV/PyPI Advisory DB |
| `npm audit` / `pnpm audit` | JS/TS | Built-in |
| `cargo audit` | Rust | RustSec advisory DB |
| `bundler-audit` | Ruby | |
| **grype** + syft | Any (SBOM-based) | Container images, filesystems, cross-ecosystem |
| **OWASP Dependency-Check** | JVM, Node, Python, .NET | NIST NVD + CPE matching |
| **osv-scanner** (Google) | Polyglot | Uses OSV database, fast |

```bash
pip install pip-audit && pip-audit
npm audit --audit-level=moderate

# grype — filesystem scan (generate SBOM with syft first for best results)
brew install anchore/grype/grype
syft . -o spdx-json > sbom.json && grype sbom:sbom.json
```

---

## SAST (static analysis)

| Tool | Language | Notes |
|---|---|---|
| **Semgrep** | 30+ languages | OSS rules + OWASP rulesets; fast; custom rules |
| **CodeQL** | 10+ languages | Deep dataflow analysis; built into GitHub Actions |
| **Bandit** | Python | Quick, maps to CWE/OWASP categories |
| **Snyk Code** | Multi-language | Integrated with Snyk platform |
| **SonarQube Community** | Multi-language | Self-hosted quality + security gate; try: https://docs.sonarsource.com/sonarqube-community-build/try-out-sonarqube |

---

## Code quality

| Tool | Purpose |
|---|---|
| **ruff** | Python lint + format (replaces flake8, isort, black, pyupgrade) |
| **basedpyright** / pyright | Python type checking |
| **radon** | Python cyclomatic complexity + maintainability index |
| **lizard** | Multi-language cyclomatic complexity and function length analysis |
| **vulture** | Python dead code detection |
| **ESLint** + TypeScript | JS/TS lint + types |
| **Prettier** / biome | JS/TS/CSS formatting |
| **markdownlint** | Markdown docs |
| **shellcheck** | Shell scripts |
| **actionlint** | GitHub Actions workflow lint |
| **yamllint** | YAML files |

---

## IaC & container security

| Tool | Purpose |
|---|---|
| **Checkov** (Bridgecrew) | Terraform, CloudFormation, K8s, ARM, Helm — maps to OWASP A05 |
| **Trivy** | Container images, filesystems, IaC, SBOM — broad and fast |
| **Grype** | Vulnerability scanner using SBOM; pairs with syft |
| **kube-score** | Kubernetes manifest static analysis |

---

## Agent-side security review plugins

### Codex Security plugin (OpenAI)
https://openai.com/daybreak/codex-security-plugin/

Installable Codex plugin that runs a guided security scan over a chosen project folder
(Desktop Codex or Codex CLI). Use as an **agent-side** review pass alongside (not instead
of) gitleaks / Semgrep / CodeQL in hooks and CI. Good for exploratory findings before a
PR; keep automated secret/SAST gates as the hard floor.

---

## Agent-friendly guardrails

Prefer checks that produce **actionable error messages** pointing to a specific file and
line. When a rule encodes project taste or architecture, document the rule and its
remediation path (in `policies/`) so future agents can fix failures without guessing.

The `.cursor/rules/` and `.windsurf/rules/` CodeGuard rule files in this repo implement
OWASP principles as per-file coding guidance — they are active during editing, not just
at commit time.

This template's example pre-commit config already wires **gitleaks**, **detect-private-key**,
**ruff**, **markdownlint**, and **shellcheck** — see [`hooks/.pre-commit-config.yaml`](../hooks/.pre-commit-config.yaml).
