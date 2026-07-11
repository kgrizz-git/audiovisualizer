# Templates

Last reviewed: 2026-07-11

Fill-in artifact forms. Use these when you need a structured output document — a plan to
review and approve, a completed assessment to store, an ADR to record a decision.

For the *prompts* that instruct an agent to produce these outputs, see [`prompts/`](../prompts/).

## Available templates

| Template | Use when |
|---|---|
| [plan.md](plan.md) | Starting a non-trivial task; need a reviewable plan before coding |
| [orchestration-state.md](orchestration-state.md) | Tracking multi-agent or parallel plan execution state |
| [project-brief.md](project-brief.md) | Capturing project purpose, users, constraints, and success criteria |
| [design.md](design.md) | Making a non-obvious architecture or UX decision |
| [adr.md](adr.md) | Recording a durable architecture decision and its rationale |
| [runbook.md](runbook.md) | Documenting how to operate, debug, and recover a system or workflow |
| [release-checklist.md](release-checklist.md) | Preparing a versioned release, tag, deployment, or handoff |
| [bug-review.md](bug-review.md) | Documenting a bug investigation and its fix |
| [incident-review.md](incident-review.md) | Reviewing a production incident, outage, data issue, or user-impacting event |
| [security-review.md](security-review.md) | Scoped security assessment of code, config, or a change |
| [safety-review.md](safety-review.md) | Assessing AI/ML model behavior, outputs, or deployment safety |
| [qi-assessment.md](qi-assessment.md) | Quality improvement scan — prioritized findings without refactoring |
| [testing-assessment.md](testing-assessment.md) | Test coverage audit and testing strategy review |
| [refactor-assessment.md](refactor-assessment.md) | Pre-refactor risk and leverage analysis |

## Conventions

- Fill in every section; remove sections that don't apply.
- Keep the file name stable (e.g. `plans/2026-06-26-auth-refactor.md`) so it is linkable.
- Date assessments; they become stale. If stored in `assessments/` or `plans/`, they're
  historical record — don't update in place, create a new one.
- When a plan is complete or abandoned, move it to `plans/archive/` (see
  [`policies/plans-and-todos.md`](../policies/plans-and-todos.md)).
- If a template grows beyond ~300 lines, it's trying to be a doc, not an assessment —
  split the supporting material into a linked doc.
- Release notes: public vs developer changelog split is documented in
  [`policies/changelog-conventions.md`](../policies/changelog-conventions.md).
