# Bug Review Prompt

Investigate the reported bug, confirm root cause, propose a fix, and produce a
completed [`templates/bug-review.md`](../templates/bug-review.md) artifact.

## Process

1. **Reproduce** — follow the reported steps; confirm the failure before investigating.
2. **Isolate** — narrow to the smallest failing case. Add a failing test first if practical.
3. **Root cause** — trace back to the originating code path. Do not stop at symptoms.
4. **Fix** — make the minimal change that addresses the root cause. Avoid scope creep.
5. **Verify** — confirm the reproduction steps now pass; check adjacent code for the same pattern.
6. **Document** — fill in `templates/bug-review.md` and link it to the issue/PR.

## Output

A completed `templates/bug-review.md` with:

- Reproduction steps that another agent or human can follow.
- Root cause stated precisely (file, line, logic error).
- Fix with rationale.
- New or updated test.
- Contributing factors and any follow-up systemic actions.

## Constraints

- Do not change behavior beyond what fixes the bug.
- Do not skip the reproduction step. "I found the likely cause" is not reproduction.
- If the bug cannot be reproduced, say so and ask the user for more context.
