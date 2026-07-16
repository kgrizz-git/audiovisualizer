# GitHub-Connected Apps & Review Bots

Last reviewed: 2026-07-14

Apps and services that connect to GitHub to augment CI, code review, security scanning,
and coverage. All are install-on-demand — evaluate per project before enabling.

Before installing any App, scope it to needed repositories and confirm its code/metadata
access, retention, subprocessors, and contractual fit for the repo's data classification.
For a ruleset, required-check, and PII/PHI/absolute-path gate baseline, see
[`policies/github-repository-hygiene.md`](../policies/github-repository-hygiene.md).

## AI-assisted code review

**CodeRabbit** — https://coderabbit.ai
AI PR reviewer; summarizes changes, flags bugs, suggests improvements, posts inline
comments. Free tier for public repos. Low friction to try; high signal on large diffs.

**Sourcery** — https://sourcery.ai
Suggests refactors and simplifications as inline PR comments. Python-focused but
expanding. Pairs well with ruff for Python projects.

**Qodo (CodiumAI)** — https://qodo.ai
Generates tests for changed code and reviews PR logic. Useful when test coverage is low.

## Static analysis & autofix

**SonarQube Community** — https://docs.sonarsource.com/sonarqube-community-build/try-out-sonarqube
Self-hosted quality/security gate (bugs, smells, coverage, some vulns). Prefer when you
want an on-prem dashboard; pair with Semgrep/CodeQL in CI rather than replacing them.

**DeepSource** — https://deepsource.com
Continuous static analysis with autofix PRs. Supports Python, JS/TS, Go, Ruby, Rust,
Java. Catches anti-patterns and security issues not caught by linters. Free for public
repos and small teams.

**Aikido** — https://aikido.dev
Developer-first security platform: SCA (deps), SAST, DAST, cloud config, container
scanning. Surfaces findings in GitHub PRs. Free tier available. Good unified view for
solo devs / small teams who want one dashboard instead of many tools.

**HoundDog.ai** — https://hounddog.ai
Privacy code scanner that traces sensitive-data flows through code, logs, files, third-party
SDKs, and AI paths. It offers local CLI/Docker and IDE scanning as well as GitHub/GitLab/Bitbucket
integrations that can block PRs. For this template, HoundDog is **local CLI/Docker only until
further user authorization**: do not use its IDE, cloud, API-key, or SCM/GitHub integration.
See [`inventory/medical-data-security.md`](medical-data-security.md).

## Vulnerability & license scanning

**Snyk** — https://snyk.io
SCA (open-source dep vulns), SAST, container scanning, IaC. Strong license compliance
checking. Integrates with GitHub, CI, and IDE extensions. Free tier; paid for teams.
Use when the project has compliance requirements or ships container images.

**Dependabot** — built into GitHub
Automated dependency update PRs; free for all repos. Enable via
`ci/examples/dependabot.yml`. The baseline choice — enable by default.

**GitHub Open Source License Compliance** (public preview) —
https://github.blog/changelog/2026-06-30-open-source-license-compliance-is-in-public-preview/

Enterprise-wide license policy + ruleset gate (“Require license compliance check results
before merging”). Annotates PRs that add noncompliant deps. Requires GitHub Enterprise
Cloud + Advanced Security Code Security. Use when legal/compliance owns an allow-list of
licenses; pair with Snyk/Dependabot for vulns.

**Renovate** — https://renovatebot.com
More configurable than Dependabot: monorepo grouping, custom schedules, semantic
version ranges, more ecosystems (Helm, Docker, terraform, etc.). Use when Dependabot's
grouping or scheduling is insufficient.

## Coverage

**Codecov** — https://codecov.io
Coverage reports, PR comments showing changed-file coverage delta, trend graphs.
Free for public repos. Integrates with `pytest --cov` via `codecov/codecov-action`.
Useful early — coverage delta on PRs catches regressions without enforcing a hard threshold.
See `ci/examples/ci.yml` for the upload step and `ci/examples/codecov.yml` for threshold config.
Requires a `CODECOV_TOKEN` secret (Settings → Secrets → Actions) for both public and private repos on v4+.

## Selection guidance

| Need | Recommendation |
|---|---|
| Start with zero friction | Dependabot + Codecov |
| Add AI review | CodeRabbit (best breadth) |
| Unified security dashboard | Aikido (solo/small team) or Snyk (enterprise) |
| Privacy data-flow scanning / HIPAA-oriented code review | HoundDog.ai (local CLI/Docker only until further authorization) |
| Static analysis + autofix PRs | DeepSource |
| More dep update control | Renovate (replaces Dependabot) |
| Test generation | Qodo |

Don't enable all at once. PR noise compounds; start with one or two and evaluate.
