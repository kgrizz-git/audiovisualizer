# Policy: Plans, TODOs, Archiving, and Completion

Last reviewed: 2026-07-09
Enforced by: convention + [`hooks/scripts/check_todo_limits.py`](../hooks/scripts/check_todo_limits.py)
+ [`prompts/todo-plan-audit.md`](../prompts/todo-plan-audit.md).

## Why

Agents and humans need a single place for “what’s next,” durable plans for non-trivial
work, and a clear done/archive path so the repo does not accumulate zombie checklists.

## Folders and files

| Path | Purpose |
|---|---|
| `plans/` | Implementation plans (`YYYY-MM-DD-slug.md` or stable names). Optional `orchestration-state.md` for multi-agent runs. |
| `plans/specs/` | Design specs describing visual rules, mapping contracts, and export aesthetics (*what* and *why*). |
| `plans/archive/` | Completed or abandoned plans moved out of the active set (keep git history). |
| `to_do.md` or `TODO.md` (repo root) | Short living backlog for the whole project — not a substitute for issues on large teams. |
| `assessments/` | Timestamped reviews (security, QI, etc.); historical — do not rewrite in place. |
| `.context/` | Scratch only (gitignored). Never the source of truth for plans. |

Use [`templates/plan.md`](../templates/plan.md) for new plans. Prefer GitHub/Linear issues
for cross-team tracking; keep `to_do.md` for agent-visible, in-repo backlog when that
helps the harness.

## Plan lifecycle

1. **draft** — written, not approved.
2. **approved** / **in-progress** — checklist drives work; mark `[x]` only when the item
   is fully done and verified (do not mark complete to “get past” a gate).
3. **complete** — all required checklist items done; verification section satisfied;
   status set to `complete`.
4. **abandoned** — explicitly stopped; note why in the plan header.

### Marking plans done

- Update `Status:` in the plan header to `complete` or `abandoned`.
- Move the file to `plans/archive/` (or rename with a `DONE-` / `ARCHIVED-` prefix if you
  prefer a flat `plans/` tree).
- If `plans/orchestration-state.md` exists, set phase to `complete` / `blocked` and point
  “next action” at none / user.
- Do **not** delete completed plans; archive them so agents can learn from prior work.

### Checklist honesty

- Mark `[ ]` → `[x]` only after the stated task is done **and** confirmed (tests, review,
  or explicit acceptance).
- If blocked, leave unchecked and add a comment under the item explaining the blocker —
  do not change the goal to something easier.

## Living `to_do` / `TODO` file

- Keep it short: prioritized bullets or a tiny table, not a novel.
- Soft line cap: **150** (warn). Hard cap: **300** (block) — see hook env vars.
- Each item should be actionable; link to a `plans/` file or issue when the work is large.
- Prune done items into a short “Recently done” section (max ~10) or delete them after
  they land in the changelog / git history.
- Stale `TODO`/`FIXME` in **source** are audited via [`prompts/todo-plan-audit.md`](../prompts/todo-plan-audit.md)
  and [`policies/garbage-collection.md`](garbage-collection.md) — not the line-cap hook.

## File size relationship

Active plans and `to_do` files are documentation; they still respect doc soft caps in
[`file-size-and-counts.md`](file-size-and-counts.md). Prefer splitting a huge plan into
phased linked plans over one 2k-line checklist.

## Notes_and_Ideas vs this template

Personal research dumps, private API key bookmarks, and exploratory idea notes belong in
a Notes_and_Ideas (or similar) repo. This template keeps **durable, reusable** conventions
and inventory menus only.
