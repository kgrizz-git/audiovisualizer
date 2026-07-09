# Changelog

All notable **user-facing / template-consumer** changes are documented here.
Developer-only detail (hooks internals, inventory menus, tests/CI) lives in
[`CHANGELOG.dev.md`](CHANGELOG.dev.md). See [`policies/changelog-conventions.md`](policies/changelog-conventions.md).

The format follows [Keep a Changelog](https://keepachangelog.com/), and this project
uses [Semantic Versioning](https://semver.org/).

## [0.4.4] - 2026-07-09

### Added
- Advisory open-PR check for agents after push / about once a day
  (`ci/scripts/check_open_prs.py`, guidance in commits policy and session prompts).
  Optional non-blocking daily workflow example; not a git hook.
  Agents check `.context/open-prs-check.stamp` first and skip the script when
  the stamp is fresh (saves tokens vs always launching the check).

## [0.4.3] - 2026-07-09

### Added
- Inventory: Archon harness builder; Pantheon (K-Dense) multi-persona brainstorming;
  cross-IDE handoff pattern links; expanded Sphinx/Pandoc docs guidance.

## [0.4.2] - 2026-07-09

### Added
- Inventory: AI code-wiki / repo-doc tools (Google Code Wiki, DeepWiki, deepwiki-open,
  RepoWiki, FSoft CodeWiki, repowise) plus Ry Walker code-intelligence survey.

## [0.4.1] - 2026-07-09

### Added
- Policy and script for GitHub Actions minutes/storage stewardship
  (`policies/github-actions-usage.md`, `ci/scripts/check_gha_usage.py`).

### Changed
- Firecrawl inventory entry is product-only (no API-key dashboard link).

## [0.4.0] - 2026-07-09

### Added
- Conventions for dual changelogs, plans/TODO lifecycle and archiving, and clearer
  agent entry stubs (`AGENTS.md` / `GEMINI.md` / `QWEN.md` / `CLAUDE.md`).
- Pre-commit policy hook for oversized living `to_do` / `TODO` backlogs; documented
  secret-scan and lint hooks already in the example config.
- Expanded harness and code-mapping inventory (agent quality patterns, Graphify,
  security plugin, license compliance, crawl tooling).

### Changed
- Default source-file soft warn raised to **600** lines (hard **1000**); see
  [`policies/file-size-and-counts.md`](policies/file-size-and-counts.md).

## [0.3.0] - 2026-07-09

### Changed
- Fixed Obra inventory pointers: replace dead `obraunsdorf/obra-superprompts` with
  `obra/superpowers`, `obra/superpowers-skills`, and `obra/superpowers-marketplace`.

### Added
- Harness reading: Loop Engineering (Addy Osmani) and Agent Patterns catalog links.
- OpenCode permission/config links for constraining filesystem writes.
- SonarQube Community menu entries (security-quality + github-apps).
- `datalab-to/lift` under RAG document parsing (schema-constrained PDF/image JSON).
- `genius-code-review` skill pointer in skills-index.
- `backups/` gitignore entry; optional prune-hook note in `hooks/README.md`.

## [0.2.0] - 2026-06-26

### Added
- Initial published template baseline (prompts, policies, hooks, CI examples, inventories).
