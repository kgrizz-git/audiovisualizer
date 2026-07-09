# GitHub-Connected Apps & Review Bots

Last reviewed: 2026-07-09

Apps and services that connect to GitHub to augment CI, code review, security scanning,
and coverage. All are install-on-demand — evaluate per project before enabling.

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

## Vulnerability & license scanning

**Snyk** — https://snyk.io
SCA (open-source dep vulns), SAST, container scanning, IaC. Strong license compliance
checking. Integrates with GitHub, CI, and IDE extensions. Free tier; paid for teams.
Use when the project has compliance requirements or ships container images.

**Dependabot** — built into GitHub
Automated dependency update PRs; free for all repos. Enable via
`ci/examples/dependabot.yml`. The baseline choice — enable by default.

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
| Static analysis + autofix PRs | DeepSource |
| More dep update control | Renovate (replaces Dependabot) |
| Test generation | Qodo |

Don't enable all at once. PR noise compounds; start with one or two and evaluate.
