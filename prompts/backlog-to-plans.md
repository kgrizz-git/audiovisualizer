# Backlog To Plans Prompt

Turn a repo backlog into reviewable implementation plans.

Use this when `to_do.md`, `TODO.md`, issue notes, source TODOs, or roadmap docs contain
work that is too large or risky to leave as loose bullets.

## Inputs

Read only the files needed to understand the backlog:

- Root `to_do.md` / `TODO.md`, if present.
- `plans/` and `plans/archive/`, if present.
- Open roadmap or issue-summary docs.
- Source TODOs only when they point to user-facing, risky, or cross-file work.

## Triage

For each item, classify it as:

- `plan-needed` — non-trivial, cross-file, risky, or requires sequencing.
- `quick-win` — small enough for a normal coding turn.
- `issue-only` — should live in GitHub/Linear because it needs product/team tracking.
- `stale-or-duplicate` — appears done, obsolete, or already covered elsewhere.
- `defer` — valid but intentionally not worth planning now.

Do not create plans for every TODO automatically. Group related small items into one plan
when that reduces coordination overhead.

## Plan Output

For each `plan-needed` item, draft a `templates/plan.md`-shaped plan with:

- Goal and out-of-scope notes.
- Proposed file changes with likely files/modules.
- Phased checklist.
- Dependencies between steps.
- Parallelization notes: what can run independently, what must be serialized.
- Verification checks.
- Risks and open questions.

If writing files, put active plans under `plans/` using stable names such as
`YYYY-MM-DD-slug.md`.

## Summary Output

Return:

- Plans created or proposed.
- Quick wins that do not need plans.
- Items to move to GitHub/Linear.
- Stale or duplicate items to remove only if the user approves.
- Recommended first plan to execute.
