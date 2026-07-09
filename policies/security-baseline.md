# Policy: Security Baseline

Last reviewed: 2026-06-26
Enforced by: [`hooks/`](../hooks/) + CI. Tool menu: [`inventory/security-quality.md`](../inventory/security-quality.md).

## Why

A small, consistent security floor catches the cheap, high-impact mistakes (leaked secrets,
known-vulnerable deps) before they reach history or production.

## Baseline rules

| Area | Rule | Default tool | Tier |
|---|---|---|---|
| Secrets | No secrets in commits or history | gitleaks (pre-commit + CI), trufflehog (history); optional Codex Security plugin for agent-side review | hard gate |
| Dependencies | No known-critical vulns in direct deps | pip-audit / npm audit / osv-scanner | soft→hard gate |
| Dependency updates | Automated update PRs enabled | Dependabot or Renovate | advisory |
| SAST | Static analysis on changed code | Semgrep and/or CodeQL | soft gate |
| Containers/IaC (if used) | Scan images & IaC | grype + syft (SBOM); checkov/trivy for IaC | soft gate |
| Least privilege | CI tokens & app scopes minimized | manual review | advisory |

## Secrets handling

- Never commit `.env`, keys, tokens, or credentials. Provide `.env.example` instead.
- If a secret is committed: rotate it first, then scrub history. Rotation is mandatory;
  scrubbing alone is insufficient.
- Keep a secret-scanning hook on by default; it is the cheapest high-value check.

## Adopting

1. Turn on gitleaks in [`hooks/.pre-commit-config.yaml`](../hooks/.pre-commit-config.yaml).
2. Add the language-appropriate dependency audit + SAST to CI (see `ci/`).
3. Enable Dependabot/Renovate (see `ci/dependabot.yml.example`).
4. Record any deviations and accepted risks in an ADR.

## Reviews

For deeper, change-scoped reviews use the security/safety review templates and prompts:
[`templates/security-review.md`](../templates/security-review.md),
[`templates/safety-review.md`](../templates/safety-review.md).
