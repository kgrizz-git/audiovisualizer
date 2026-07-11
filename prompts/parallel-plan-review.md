# Parallel Plan Review Prompt

Review active plans and decide which work can be done in parallel without creating file,
state, or decision conflicts.

## Inputs

Read:

- `plans/*.md`, excluding `plans/archive/`.
- `plans/orchestration-state.md`, if present.
- Relevant `to_do.md` / `TODO.md` entries, if they link to active plans.

## Analysis

For each plan, identify:

- Goal and current status.
- Files or modules likely to be touched.
- Shared dependencies, migrations, schemas, APIs, or product decisions.
- Verification commands.
- Open questions or blockers.

Then classify work units:

- `parallel-safe` — independent files/modules, clear verification, no shared decision gate.
- `parallel-with-coordination` — can run together if file ownership is assigned first.
- `serial` — must happen after another task or decision.
- `do-not-start` — blocked, stale, or unclear.

## Collision Check

Flag likely collisions:

- Same file or module touched by multiple work units.
- API/schema changes that downstream work depends on.
- Tests or fixtures shared by multiple agents.
- UX or product decisions that need one coherent choice.
- Migration/release steps that should not be split.

## Output

Write a markdown report with:

- Recommended execution order.
- Parallel batches.
- File/module ownership per batch.
- Required coordination points.
- Work that should stay with one agent.
- Plans that need revision before implementation.

Do not spawn subagents. This prompt only produces the parallelization review.
