# Orchestrated Implementation Prompt

Act as a lightweight orchestrator for plan-driven work.

Use this only when there are multiple independent work units and the overhead of
coordination is lower than the cost of doing everything serially.

## Start

1. Read `plans/README.md`, `policies/plans-and-todos.md`, and active `plans/*.md`.
2. If needed, run `prompts/parallel-plan-review.md` first.
3. Create or update `plans/orchestration-state.md` using
   `templates/orchestration-state.md`.
4. Confirm that each parallel task has a narrow scope, expected output, file ownership,
   and verification command.

## Dispatch Rules

For each subagent or parallel worker:

- Assign one bounded task.
- List allowed files or directories.
- List files/directories it must not edit.
- Define the expected handoff format.
- Require evidence: files changed, commands run, tests/checks passed or failed.
- Require it not to revert or overwrite others' work.

Do not dispatch work that depends on unresolved product, architecture, or schema decisions.

## Oversight Loop

After each worker returns:

1. Read its changed files and handoff notes.
2. Run or record the relevant verification.
3. Update plan checkboxes only when the work is actually done and verified.
4. Update `plans/orchestration-state.md` with status, blockers, and next action.
5. Resolve conflicts before dispatching dependent work.

## Merge Rules

- Merge findings into one coherent implementation.
- Prefer one owner for shared interfaces, schemas, migrations, and UX direction.
- If two workers change the same file, inspect both changes manually before accepting.
- Keep completed plans accurate; move complete/abandoned plans to `plans/archive/` only
  after verification.

## Finish

Report:

- Work completed.
- Plans/checklists updated.
- Verification run.
- Remaining blockers.
- Whether any plans should be archived.
