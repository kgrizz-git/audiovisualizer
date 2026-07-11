# TODO And Plan Audit Prompt

Scan the repo for TODOs, plans, roadmap notes, issue references, temporary workarounds, and unfinished implementation markers.

## Search Targets

Look for:

- `TODO`
- `FIXME`
- `HACK`
- `XXX`
- `later`
- `follow up`
- active plan files
- roadmap docs
- unchecked markdown tasks
- test TODOs, skipped tests, xfail markers, and coverage notes

## Verify Against The Repo

Do not assume a checkbox or TODO is accurate. For each meaningful item:

- Inspect the referenced code, docs, tests, or config.
- Check whether the work appears implemented but not marked done.
- Check whether a plan says work is done but verification is missing.
- Check whether tests or CI cover the claimed completion.
- Identify duplicated items across `to_do.md`, source comments, plans, and issues.

Do not mark items complete unless the evidence is concrete.

## Output

Write a markdown report with:

- Open items grouped by area.
- Items that appear stale, duplicated, or already completed.
- Plan checkboxes that need updating, with evidence.
- Plans that appear ready to move to `plans/archive/`.
- Test-related TODOs or skipped/xfail tests that need explicit follow-up.
- Blockers.
- Low-risk quick wins.
- High-leverage project work.
- Items that should become `plans/*.md` via `prompts/backlog-to-plans.md`.
- Recommended next actions.

Do not delete or rewrite TODOs unless asked.
