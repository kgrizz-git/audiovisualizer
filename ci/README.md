# CI Guidance

Last reviewed: 2026-07-31

Guidance for selecting, structuring, and gating CI checks. Example workflows live in
`ci/examples/` — copy the ones you need to `.github/workflows/` to activate them.

This repository’s **active** CI is
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml):

| Job (status-check name) | What it runs |
|---|---|
| **Validate** | `npm run validate` (lint + Vitest with coverage + TypeScript + Vite build), uploads `coverage/lcov.info`, `npm audit --audit-level=high` (hard on `main` pushes; `continue-on-error` on PRs), license inventory gate (after `npm ci`) |
| **Policy** | Public-release clean gate, policy-hook unit tests (Python-only; parallel with Validate) |
| **Secret scan** | gitleaks |
| **SAST (Semgrep)** | Pinned `semgrep/semgrep` image; `p/typescript` + `p/python` on `src/`, `hooks/scripts/`, `tests/`, `ci/scripts/` (skipped for Dependabot) |

Use those exact job names when configuring required checks in a repository ruleset /
branch protection. It is application CI, not seed-template asset validation.

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
| Emails / absolute paths / private IPs (clean-repo) | ✅ primary | ✅ safety net (Policy job) | — | — |
| Unit tests + coverage report | — | ✅ primary (folded into validate) | — | — |
| Dep audit (npm audit) | — | ✅ primary on main; advisory on PRs | optional weekly | — |
| SAST / OWASP (Semgrep) | optional | ✅ primary (focused rulesets) | ✅ deeper suites (OWASP, etc.) | — |
| CodeQL deep analysis | — | — | ✅ primary | — |
| Container / IaC scan (grype, checkov) | — | — | ✅ primary | — |
| TruffleHog history scan | — | — | ✅ primary | — |
| Docs accuracy review | — | — | — | ✅ primary |
| Security / safety review | — | — | — | ✅ primary |
| Refactor / GC assessment | — | — | — | ✅ primary |
| Open PRs after push / daily reminder | — | — | optional advisory schedule | ✅ primary (local script) |

**Fast lane** (must stay < 5 min): lint, types, tests+coverage, secret scan, policy gates,
dep audit, focused Semgrep (`p/typescript` + `p/python`).
**Slow lane** (can run on schedule or on PR to main): deeper SAST, CodeQL, container scans.
**Scheduled** (nightly or weekly): TruffleHog history, dep audit refresh, stale-branch cleanup.

The clean-repo guard (`hooks/scripts/check_public_repo_clean.py`, wired as
`check-public-repo-clean` in the root `.pre-commit-config.yaml` and the CI **Policy** job)
scans every **currently tracked** file for emails, absolute paths, `file://` URIs, and
private IPv4 addresses. It does **not** replace gitleaks (credentials) and does not audit
full Git history. Local hooks print matched tokens for debugging; CI runs with `--redact`.
Make the Policy job a required default-branch check when needed; see
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
   high-value steps; prevents supply-chain drift. Pin container images by tag+digest.
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
