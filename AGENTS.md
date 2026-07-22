# AGENTS.md

Last reviewed: 2026-07-21

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

## Project map

- `src/core/` — MIDI normalization, domain types, and score-to-geometry mapping.
- `src/renderers/` — Canvas preview and SVG/plotter export.
- `src/ui/` — browser-only control wiring and styling.
- `tests/` — deterministic unit tests.
- `public/demo-midi/` — small, redistributable MIDI demo fixtures.
- `dev-docs/` — project decisions and the active backlog.

## Safety and repository hygiene

- `.context/`, `dist/`, and `.dirac-cache/` are local artifacts; do not commit them.
- Keep source and documentation files below the repository's size limits; see [`policies/file-size-and-counts.md`](policies/file-size-and-counts.md).
- `notes_and_ideas/` is unrelated material inherited from the template. Do not use it as project documentation. Its removal requires a deliberate Git-history decision.
- For policy, CI, and reusable-template changes, use the linked material in `policies/`, `hooks/`, and `ci/` rather than duplicating it here.
