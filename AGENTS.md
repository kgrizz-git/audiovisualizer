# AGENTS.md

Last reviewed: 2026-07-22

AudioVisualizer turns MIDI files into deterministic visual score art. This is the
single source of truth for coding agents; tool-specific entrypoints point here.

## Start here

Read these in order for implementation work:

1. [`README.md`](README.md) for local setup and user-facing behavior.
2. [`DESIGN.md`](DESIGN.md) for visual rules and export aesthetics.
3. [`ARCHITECTURE.md`](ARCHITECTURE.md) for domain contracts, stack, and runtime behavior.
4. [`dev-docs/agent-workflow.md`](dev-docs/agent-workflow.md) for the validation and handoff loop.
5. The files directly involved in the requested change and their tests.

## Working rules

1. Keep the MIDI parser and score-to-geometry mapper deterministic and side-effect free.
2. Update `DESIGN.md` when changing a visual rule, mapping formula, or export aesthetic;
   update `ARCHITECTURE.md` when changing a public domain contract, stack, library, or runtime boundary.
3. Add or update Vitest coverage with mapper, parser, and SVG behavior changes.
4. Run `npm run validate` before handing off a change. It type-checks, tests, and production-builds the app.
5. Do not upload user MIDI files or add telemetry without explicit approval. Browser file handling stays local.
6. Preserve the existing template policy and hook material unless the task explicitly changes it.

## Plan lifecycle

For multi-session or complex work, create a plan in `plans/` using `templates/plan.md`. See [`policies/plans-and-todos.md`](policies/plans-and-todos.md) for the full lifecycle semantics, line caps for living backlog, and checklist honesty rules.

1. **Create plan**: Write plan in `plans/YYYY-MM-DD-feature-name.md` using the template
2. **Add to backlog**: Add corresponding item to `dev-docs/TO_DO.md` with link to plan
3. **Implement**: Follow the plan phases, marking items complete as you go
4. **Complete plan**: When done, update plan status to "completed" with completion date
5. **Archive plan**: Move completed plan to `plans/archive/YYYY-MM-DD-feature-name.md`
6. **Update backlog**: Mark item complete in `dev-docs/TO_DO.md` and remove plan reference

For single-session tasks, skip the plan and work directly, updating relevant documentation and tests.

### Design specs

Design specs (visual rules, mapping contracts, export aesthetics) live in `plans/specs/` with the naming convention `YYYY-MM-DD-feature-name.md`. Specs describe *what* and *why*; implementation plans in `plans/` describe *how*. Link specs from their corresponding implementation plans.

## CHANGELOG and versioning

Update `CHANGELOG.md` for user-facing changes following [Keep a Changelog](https://keepachangelog.com/) format. See [`policies/changelog-conventions.md`](policies/changelog-conventions.md) for the dual-track model (public vs developer changelog), detailed SemVer impact rules, and agent procedures.

- **Added**: New user-facing features
- **Changed**: Changes to existing user-facing behavior
- **Deprecated**: Features to be removed
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security vulnerabilities

Apply [Semantic Versioning](https://semver.org/):
- **MAJOR**: Breaking changes to user-facing behavior or API
- **MINOR**: New user-facing features, non-breaking behavior changes
- **PATCH**: Bug fixes, internal changes, documentation

Process:
1. Before implementing, determine the SemVer impact
2. After implementation, add entry to `CHANGELOG.md` "Unreleased" section with SemVer annotation
3. For developer-only changes, use `CHANGELOG.dev.md` instead
4. Update `VERSION` file when releasing (manual process, not automated)

## Project map

- `src/core/` — MIDI normalization, domain types, and score-to-geometry mapping.
- `src/renderers/` — Canvas preview and SVG/plotter export.
- `src/ui/` — browser-only control wiring and styling.
- `tests/` — deterministic unit tests.
- `public/demo-midi/` — small, redistributable MIDI demo fixtures.
- `dev-docs/` — project decisions and the active backlog.
- `plans/` — implementation plans; `plans/specs/` for design specs; `plans/archive/` for completed work.

## Safety and repository hygiene

- `.context/`, `dist/`, and `.dirac-cache/` are local artifacts; do not commit them.
- Keep source and documentation files below the repository's size limits; see [`policies/file-size-and-counts.md`](policies/file-size-and-counts.md).
- `notes_and_ideas/` is unrelated material inherited from the template. Do not use it as project documentation. Its removal requires a deliberate Git-history decision.
- For policy, CI, and reusable-template changes, use the linked material in `policies/`, `hooks/`, and `ci/` rather than duplicating it here.
