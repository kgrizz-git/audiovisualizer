# Linear Workflows

Last reviewed: 2026-07-11

Use Linear when work needs durable product/team tracking beyond what an in-repo
`to_do.md` or `plans/` folder can handle.

## Use Linear For

- Multi-person work with ownership, status, and due dates.
- Cross-repo or cross-system initiatives.
- Bugs or feature requests reported by users or stakeholders.
- Product commitments that need prioritization and visibility.
- Recurring triage queues.
- Work that should survive branch deletion or repo restructuring.

## Prefer In-Repo Plans For

- Solo or short-lived implementation planning.
- Agent-visible checklists that need code context.
- Work where file ownership, verification, and plan checkboxes matter more than product
  reporting.
- Scratch planning that belongs in `.context/`.

## Suggested Mapping

| Work type | Best home |
|---|---|
| Small TODO | `to_do.md` or direct fix |
| Non-trivial implementation | `plans/*.md` plus issue link if needed |
| Team-visible feature | Linear issue/project linking to plan or PR |
| Bug investigation | `templates/bug-review.md` plus Linear/GitHub issue if user-facing |
| Release coordination | `templates/release-checklist.md` plus Linear milestone/project if team-owned |

## Agent Guidance

- Ask before creating or modifying Linear issues.
- Link Linear issues to plans, PRs, ADRs, and reviews instead of duplicating all content.
- Keep implementation details in the repo when agents need them.
- Keep product priority, ownership, and stakeholder status in Linear.
- Close or update Linear only after verifying the corresponding code/docs change.
