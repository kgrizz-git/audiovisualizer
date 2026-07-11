# Quality Improvement Assessment: [Scope]

Last reviewed: 2026-07-11
Date: YYYY-MM-DD
Reviewer: [agent or human]
Scope: [files, module, or system]
Note: This is an assessment only — no code is changed during this scan.

## Executive summary

2–3 sentences: overall quality signal, top finding category, and recommended priority.

## Findings

Ordered by leverage (high-impact, low-risk changes first).

### P1 — High leverage, low risk

| # | Location | Finding | Recommendation |
|---|---|---|---|
| 1 | `file.py:42` | [description] | [action] |

### P2 — Medium leverage or moderate risk

| # | Location | Finding | Recommendation |
|---|---|---|---|

### P3 — Low leverage or informational

| # | Location | Finding | Recommendation |
|---|---|---|---|

## Metrics snapshot

| Metric | Value | Tool |
|---|---|---|
| Files scanned | | |
| Total lines | | `wc -l` |
| Files > 400 lines (soft cap) | | `check_file_size.py` |
| Cyclomatic complexity violations | | `radon cc` |
| Unused imports | | `ruff F401` |
| Dead code candidates | | `vulture` |
| Test coverage | | `pytest --cov` |

## Patterns / systemic issues

Findings that appear in multiple places and indicate a structural problem.

## What NOT to change

Items that look like issues but are intentional, exempt, or risky to touch.

## Recommended next actions

- [ ] [action — owner — size estimate]
