# CI Guidance

Last reviewed: 2026-07-14

Guidance for selecting, structuring, and gating CI checks. Example workflows live in
`ci/examples/` — copy the ones you need to `.github/workflows/` to activate them.

This repository also ships a small required-check candidate at
[`.github/workflows/template-checks.yml`](../.github/workflows/template-checks.yml). It validates
the template's maintained Markdown, workflow examples, and hook scripts; it is not an
application test, type-check, coverage, or dependency-audit workflow.

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
| Unit tests | — | ✅ primary | — | — |
| Dep audit (pip-audit, npm audit) | — | ✅ primary | — | — |
| SAST / OWASP (Semgrep) | optional | — | ✅ primary | — |
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

For projects that must reject PII, PHI, data exports, or absolute machine paths, add a fast,
project-specific sensitive-data job to the PR lane and make it a required default-branch
check. Keep it local/approved for the repository's data classification, redact findings in CI
logs, and pair it with the staged-diff hook; see
[`policies/github-repository-hygiene.md`](../policies/github-repository-hygiene.md).

For medical/FHIR/HL7/DICOM or regulated-data repositories, use the stricter
[`examples/strict-sensitive-data.yml`](examples/strict-sensitive-data.yml). It scans every
tracked file rather than only a PR diff, and must be paired with the human-owned approval
inventory and local hook in [`inventory/medical-data-security.md`](../inventory/medical-data-security.md).
Make its `security / sensitive data` job required in the default-branch ruleset.

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
| `examples/strict-sensitive-data.yml` | Required-check candidate for strict PII/PHI/opaque-file scanning of every tracked file |
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
