# Subagent Workflow Prompt

Use this prompt when a task benefits from parallel AI agents.

## Decide Whether To Use Subagents

Use subagents for bounded work that can run independently, such as:

- Inventory review.
- Stack comparison.
- Security review.
- UX review.
- Test strategy.
- Documentation audit.
- Migration planning.

Do not split work when the next step depends on a single blocking answer.

## Delegation Rules

For each subagent:

- Give a narrow task.
- Define the expected output.
- Define files or areas it may edit, if any.
- Tell it not to revert or overwrite other agents' work.
- Ask it to cite evidence from files or sources.

## Merge Findings

When subagents finish:

1. Summarize each result.
2. Resolve conflicts.
3. Identify assumptions.
4. Convert findings into a single implementation plan.
5. Only then make broad changes.
