# Select Agent Skills Prompt

Choose the smallest useful set of agent skills or subagents for the current project or
task.

Use this before installing skills, copying subagents, or enabling orchestration rules.

## Inputs

Read:

- `.context/project-profile.md`, if present.
- `AGENTS.md` and any thin tool-specific agent entrypoints.
- `inventory/catalog-skills-agents.md`.
- `inventory/harness-engineering.md` when orchestration or parallel work is being considered.
- Active `plans/*.md` and `plans/orchestration-state.md`, if present.

## Selection Rules

- Prefer no extra skill when normal repo instructions are enough.
- Install skills only when they add a real workflow, domain protocol, or verification gate.
- Choose the lightest orchestration tier that fits the work.
- Prefer project-local templates and policies when present.
- Avoid installing broad skill bundles when one narrow skill is enough.
- Ask before connecting external services or project-management tools.

## Template And Policy Alignment

When recommending skills, note which local files they should use:

| Need | Local reference |
|---|---|
| Planning | `templates/plan.md`, `prompts/backlog-to-plans.md` |
| Parallel work | `prompts/parallel-plan-review.md`, `templates/orchestration-state.md` |
| Orchestration | `prompts/orchestrated-implementation.md`, `policies/plans-and-todos.md` |
| TODO audit | `prompts/todo-plan-audit.md` |
| Testing review | `templates/testing-assessment.md` |
| Security review | `templates/security-review.md`, `inventory/security-quality.md` |
| UX review | `inventory/frontend-design-ux.md`, `templates/design.md` |
| Private fork setup | `prompts/private-fork-bootstrap.md` |
| Team tracking | `inventory/linear-workflows.md` |

## Output

Return:

- Recommended skills/subagents to install or invoke.
- Why each one is useful now.
- Which local templates, prompts, and policies each should follow.
- Skills explicitly not recommended, with reasons.
- Any missing skill or repo convention worth creating upstream.
