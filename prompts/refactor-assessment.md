# Refactor Assessment Prompt

Run a structured refactor assessment of this codebase or the requested area. Do not refactor yet unless explicitly asked.

## Scope

1. Confirm the target files, modules, or workflows.
2. Identify the user-visible behavior that must remain unchanged.
3. Find existing tests and commands that cover the area.

## Review

Assess:

- Duplication.
- Complexity.
- File and function size.
- Ownership boundaries.
- Coupling and dependency direction.
- Data shape validation.
- Error handling.
- Observability and debuggability.
- Test gaps.
- Migration risk.

## Output

Write a markdown report with:

- Executive summary.
- Findings ordered by risk and leverage.
- Recommended incremental refactor plan.
- Suggested tests or verification commands.
- Risks and rollback strategy.
- Items that should not be changed yet.
