# AudioVisualizer Agent Workflow

Last reviewed: 2026-07-24

## Harness choice

This project uses the `none` orchestration tier: one focused agent/session and a short,
repeatable validation loop. The codebase is small enough that multi-agent coordination
would add more overhead than value. Reconsider only when work naturally splits into
several independent, concurrent streams.

## Session loop

1. Read `AGENTS.md`, `README.md`, `DESIGN.md`, `ARCHITECTURE.md`, and the relevant source/test files.
2. State the narrow behavior being changed before editing.
3. Keep mapping behavior in `src/core/`; keep browser APIs in `src/ui/` or renderers.
4. Update focused Vitest coverage with the behavior.
5. Run `npm run validate`.
6. Reconcile the active backlog: remove completed work from `dev-docs/TO_DO.md`, then add a
   concise entry to `CHANGELOG.md` for user-facing work or `CHANGELOG.dev.md` for internal work.
7. Report changed files, validation result, and any deliberately deferred work.

## Project-specific checks

`npm run validate` is the required local gate. It runs:

- `npm test` — deterministic unit tests for mapping and SVG generation.
- `npm run build` — TypeScript strict checking and a Vite production build.

Do not add an external linter, formatter, deployment system, or agent framework without
a concrete project need. The existing policy and hook directories remain available for
future repository-wide controls.

## Change routing

| Change | Read/update |
|---|---|
| MIDI normalization or domain types | `ARCHITECTURE.md`, `src/core/types.ts`, parser tests |
| Mapping formula or configuration | `DESIGN.md`, mapper tests |
| SVG/plotter output | `DESIGN.md`, `ARCHITECTURE.md`, SVG tests |
| UI controls | `README.md` if user-visible behavior changes |
| Build/tooling | `ARCHITECTURE.md`, `package.json`, this document, and `README.md` if setup changes |

## Handoff note

For work that spans sessions, record only a short active plan in `plans/` using
`templates/plan.md`; archive it when done. Keep exploratory notes in `.context/`, which
is intentionally untracked.
