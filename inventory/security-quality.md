# Security And Quality Tools

Choose tools based on the project language, deployment model, data sensitivity, and team workflow.

## Security

- Semgrep for static analysis and custom project rules.
- Gitleaks for secret scanning.
- TruffleHog for deeper secret scanning and historical checks.
- Grype for container and filesystem vulnerability scanning.
- Snyk where the user or organization already uses it.
- Dependabot for dependency update pull requests.
- npm audit, pip-audit, cargo audit, bundler-audit, or ecosystem-specific audit tools where relevant.

## Quality

- basedpyright or pyright for Python type checking.
- Ruff for Python linting and formatting.
- ESLint and TypeScript for JavaScript or TypeScript.
- Prettier or biome for formatting where appropriate.
- markdownlint for docs-heavy repos.
- shellcheck for shell scripts.

## Agent-Friendly Guardrails

Prefer checks that produce actionable error messages. When a rule encodes project taste or architecture, document the rule and remediation path so future agents can fix failures without guessing.
