# CI Guidance

Last reviewed: 2026-07-31

Guidance for selecting, structuring, and gating CI checks. Example workflows live in
`ci/examples/` — copy the ones you need to `.github/workflows/` to activate them.

This repository’s **active** CI is
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml):

- **Validate job (fast lane):** `npm run validate` (lint + Vitest + TypeScript + Vite
  production build), informational Vitest coverage (`continue-on-error`),
  `npm audit --audit-level=high`, the third-party license inventory gate, the
  public-release clean gate (`check_public_repo_clean.py`), and policy-hook unit tests.
- **Secrets job:** gitleaks.
- **SAST job:** Semgrep (`semgrep/semgrep` container, `p/typescript` +
  `p/python-security`) — kept as a separate job so it does not inflate the validate
  wall-clock target.

It is application CI, not seed-template asset validation.

`ci/examples/` remains inactive reference material from the bootstrap template (generic
Python/lint lanes, CodeQL, Dependabot samples, etc.). Do not treat those examples as
required checks unless you deliberately copy one into `.github/workflows/`.

**Minutes & storage:** use Actions deliberately — see
[`policies/github-actions-usage.md`](../policies/github-actions-usage.md) and
[`scripts/check_gha_usage.py`](scripts/check_gha_usage.py). Do not avoid GHA; do not
expand schedules/matrices/artifacts without a rough usage estimate in the PR.

## What to gate in CI vs pre-commit vs agent

| Check | Pre-commit | CI (fast lane) | CI (slow lane) | Agent |
|---|---|---|---|---|
| Lint, format | ✅ primary | ✅ safety net | — | — |
| Type checking | optional | ✅ primary | — | — |
| Secret scanning (gitleaks) | ✅ primary | ✅ safety net | — | — |
| File size / doc freshness | ✅ primary | ✅ safety net | — | — |
| Emails / absolute paths / private IPs (clean-repo) | ✅ primary | ✅ safety net | — | — |
| Unit tests | — | ✅ primary | — | — |
| Dep audit (pip-audit, npm audit) | — | ✅ primary | — | — |
| SAST / OWASP (Semgrep) | optional | ✅ primary (focused rulesets) | ✅ deeper suites (OWASP, etc.) | — |
| CodeQL deep analysis | — | — | ✅ primary | — |
| Container / IaC scan (grype, checkov) | — | — | ✅ primary | — |
| TruffleHog history scan | — | — | ✅ primary | — |
| Docs accuracy review | — | — | — | ✅ primary |
| Security / safety review | — | — | — | ✅ primary |
| Refactor / GC assessment | — | — | — | ✅ primary |
| Open PRs after push / daily reminder | — | — | optional advisory schedule | ✅ primary (local script) |

**Fast lane** (must stay < 5 min): lint, types, tests, secret scan, dep audit.
**Slow lane** (can run on schedule or on PR to main): SAST, CodeQL, container scans.
**Scheduled** (nightly or weekly): TruffleHog history, dep audit, stale-branch cleanup.

For repositories that must reject secrets, personal data, or absolute machine paths before a
public release, the clean-repo guard (`hooks/scripts/check_public_repo_clean.py`, wired as
`check-public-repo-clean` in the root `.pre-commit-config.yaml`) scans every tracked file for
emails, absolute paths, `file://` URIs, and private IPs. Run it in CI as a safety net and, if
it is required, make it a required default-branch check; see
[`policies/github-repository-hygiene.md`](../policies/github-repository-hygiene.md).

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
7. **Estimate minutes/storage** when changing triggers, schedules, matrices, runners,
   or artifact retention (see policy above). Prefer path filters and infrequent crons.

## Checking Actions minutes and storage

```bash
# Current repo: recent run wall-clock + billable minutes (via run timing API)
python3 ci/scripts/check_gha_usage.py --repo

# Authenticated account (user or org): billing usage summary (Actions + storage SKUs)
python3 ci/scripts/check_gha_usage.py --account

# Both (default), JSON, or custom lookback
python3 ci/scripts/check_gha_usage.py --days 14 --json
```

Requires [`gh`](https://cli.github.com/) authenticated. Repo timing needs normal repo
read. Account billing summary needs billing/admin access on the user or org; if the API
returns 403, use https://github.com/settings/billing (or org Billing) instead. Legacy
product-specific endpoints (`/settings/billing/actions`, `shared-storage`) are retired —
this script uses the consolidated usage summary API plus per-run timing.

## Example files in this directory

| File | Description |
|---|---|
| `examples/lint-and-type.yml` | Ruff lint/format, pyright/basedpyright, markdownlint |
| `examples/security.yml` | gitleaks, pip-audit, Semgrep OWASP, TruffleHog (scheduled) |
| `examples/ci.yml` | Combined fast-lane: lint + types + tests + dep audit |
| `examples/codeql.yml` | CodeQL on PRs to main and on schedule |
| `examples/dependabot.yml` | Dependabot config for Python, npm, and GitHub Actions |
| `examples/open-prs-advisory.yml` | Optional daily/advisory listing of open PRs (`continue-on-error`) |
| `scripts/check_gha_usage.py` | Report repo + account Actions/storage usage |
| `scripts/check_open_prs.py` | Advisory open-PR listing (local / agent; never a push gate) |

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
