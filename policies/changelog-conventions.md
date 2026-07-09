# Policy: Changelog Conventions (Public + Developer)

Last reviewed: 2026-07-09
Enforced by: convention + release hygiene (orchestrator / humans). See also
[`VERSION`](../VERSION) and root [`CHANGELOG.md`](../CHANGELOG.md).

## Why

Users and operators need a short, trustworthy story of what changed. Developers and
agents need a fuller record (tests, CI, refactors, inventory) that would clutter a
public release note. Split audiences so neither document lies by omission or noise.

## Dual-track model (recommended)

| Track | File (default) | Audience | Contents |
|---|---|---|---|
| **Public / user-facing** | `CHANGELOG.md` | Users, operators, release notes | User-visible features, fixes, breaking changes, migrations |
| **Developer / internal** | `CHANGELOG.dev.md` (optional) | Maintainers, agents | Tests added, CI/hooks, inventory, docs-only, refactors with no user impact |

If the project is template-only or early and has no external users, a single
`CHANGELOG.md` is fine — keep entries honest about impact, and promote to dual-track
when you ship to others.

### What goes where

**Public `CHANGELOG.md`**

- Added / Changed / Deprecated / Removed / Fixed / Security that affect callers or UX
- Breaking changes and migration notes
- Dependency upgrades that change runtime behavior or security posture

**Developer `CHANGELOG.dev.md`** (or a `### Internal` subsection if you keep one file)

- New or expanded tests, fixtures, coverage gates
- CI workflow / pre-commit / policy-hook changes
- Inventory and prompt/template updates with no product behavior change
- Pure refactors, renames, doc freshness, agent stub files

Never put secrets, tokens, or private URLs in either changelog.

## SemVer impact

Bump [`VERSION`](../VERSION) with the public changelog:

| Bump | When |
|---|---|
| **MAJOR** | Breaking public API / CLI / config / data format |
| **MINOR** | Backward-compatible user-visible feature or capability |
| **PATCH** | Bugfix, security patch, or docs/tooling that does not change product behavior |

Developer-only changes that do not alter product behavior are usually **PATCH** (or
unchanged version if you only commit inventory mid-cycle — prefer PATCH when releasing).

## Entry format

Follow [Keep a Changelog](https://keepachangelog.com/). Example public entry:

```markdown
## [1.2.0] - 2026-07-09

### Added
- Export reports as CSV from the dashboard.

### Fixed
- Login redirect loop on expired sessions.
```

Example developer entry:

```markdown
## [1.2.0] - 2026-07-09

### Added
- Pre-commit hook `check-todo-limits` (soft gate at 150 lines).
- CI: Semgrep OWASP ruleset on PRs.

### Changed
- Inventory: Graphify + NetworkX under knowledge-graph-code-mapping.
```

## Agent rules

1. When product behavior changes, update **public** changelog + `VERSION` in the same PR.
2. When only harness/inventory/tests/CI change, update **developer** changelog (or
   Internal section); bump PATCH if you cut a release.
3. Do not invent user-facing bullets for internal work.
4. Link PRs/issues when helpful; keep bullets scannable (one idea each).
