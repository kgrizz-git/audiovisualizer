# CI Guidance

Last reviewed: 2026-06-26

Guidance for selecting, structuring, and gating CI checks. Example workflows live in
`ci/examples/` — copy the ones you need to `.github/workflows/` to activate them.

## What to gate in CI vs pre-commit vs agent

| Check | Pre-commit | CI (fast lane) | CI (slow lane) | Agent |
|---|---|---|---|---|
| Lint, format | ✅ primary | ✅ safety net | — | — |
| Type checking | optional | ✅ primary | — | — |
| Secret scanning (gitleaks) | ✅ primary | ✅ safety net | — | — |
| File size / doc freshness | ✅ primary | ✅ safety net | — | — |
| Unit tests | — | ✅ primary | — | — |
| Dep audit (pip-audit, npm audit) | — | ✅ primary | — | — |
| SAST / OWASP (Semgrep) | optional | — | ✅ primary | — |
| CodeQL deep analysis | — | — | ✅ primary | — |
| Container / IaC scan (grype, checkov) | — | — | ✅ primary | — |
| TruffleHog history scan | — | — | ✅ primary | — |
| Docs accuracy review | — | — | — | ✅ primary |
| Security / safety review | — | — | — | ✅ primary |
| Refactor / GC assessment | — | — | — | ✅ primary |

**Fast lane** (must stay < 5 min): lint, types, tests, secret scan, dep audit.
**Slow lane** (can run on schedule or on PR to main): SAST, CodeQL, container scans.
**Scheduled** (nightly or weekly): TruffleHog history, dep audit, stale-branch cleanup.

## Workflow design principles

1. **Required checks are small.** If a required job takes > 5 min, split it.
2. **Advisory jobs never block merges.** Use `continue-on-error: true` or separate
   workflows for slow/advisory checks.
3. **Cache aggressively.** `actions/cache` for pip/npm/cargo/go installs cuts most
   workflow times in half.
4. **Least-privilege tokens.** Set `permissions:` explicitly at the workflow and job
   level; default to `contents: read`.
5. **Pin action versions.** Use `uses: actions/checkout@v4` with a SHA comment for
   high-value steps; prevents supply-chain drift.
6. **Dependabot for Actions.** Enable `package-ecosystem: github-actions` in
   `dependabot.yml` so action versions stay current.

## Example files in this directory

| File | Description |
|---|---|
| `examples/lint-and-type.yml` | Ruff lint/format, pyright/basedpyright, markdownlint |
| `examples/security.yml` | gitleaks, pip-audit, Semgrep OWASP, TruffleHog (scheduled) |
| `examples/ci.yml` | Combined fast-lane: lint + types + tests + dep audit |
| `examples/codeql.yml` | CodeQL on PRs to main and on schedule |
| `examples/dependabot.yml` | Dependabot config for Python, npm, and GitHub Actions |

## Dependency update bots

**Dependabot** (GitHub-native, free):
- Zero setup overhead; files PRs for outdated deps and Actions versions.
- Pair with auto-merge for patch-level updates after tests pass.

**Renovate** (more configurable):
- Supports monorepos, custom grouping, semantic versioning ranges, more ecosystems.
- Use when Dependabot's grouping or scheduling isn't flexible enough.

## GitHub Apps that augment CI

See [`inventory/github-apps.md`](../inventory/github-apps.md) for: CodeRabbit (AI PR
review), DeepSource (SAST + autofix), Codecov (coverage), Snyk (vuln + license),
Aikido (CSPM/DAST), Sourcery (refactor suggestions).
