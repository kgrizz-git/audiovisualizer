# Policy: Commits & Branches

Last reviewed: 2026-06-26
Enforced by: convention; optional CI check (commitlint / branch-name regex).

## Commit messages

Default to [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <summary>

<optional body — what & why, not how>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `build`, `perf`, `revert`.

- Imperative mood, ≤ 72-char summary.
- Body explains intent and tradeoffs; the diff already shows the mechanics.
- One logical change per commit where practical.

## Branch naming

```
<type>/<short-kebab-summary>      e.g. feat/search-api-inventory
```

- Keep work off the default branch; branch first.
- Long-lived feature branches should rebase on the default branch regularly.

## Pull requests

- Title follows the commit convention; body states purpose, scope, and verification done.
- Keep PRs small and reviewable; split unrelated changes.
- Link the plan/ADR/issue the PR implements.
- Do not merge red CI; do not bump version in feature PRs unless that is the PR's purpose.

## Versioning

The template uses [SemVer](https://semver.org/) in [`VERSION`](../VERSION); record notable
changes in `CHANGELOG.md` when releases matter.

## Enforcement (optional)

- `commitlint` + a CI job to validate commit messages.
- A branch-name regex check in CI.
- Start advisory; promote to a gate only if the team finds it durable.
