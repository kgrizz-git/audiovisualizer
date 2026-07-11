# Refactor Assessment: [Scope]

Last reviewed: 2026-07-11
Date: YYYY-MM-DD
Reviewer: [agent or human]
Scope: [files or module]
Note: Assessment only — no changes made. See prompts/refactor-assessment.md for the agent prompt.

## Executive summary

Overall refactor pressure (low / medium / high), top area of concern, and recommended
entry point.

## Findings (ordered by risk × leverage)

| # | Location | Issue | Risk | Leverage | Recommendation |
|---|---|---|---|---|---|
| 1 | `file.py:L10-L80` | [e.g. 3 responsibilities in one class] | med | high | Extract into X, Y, Z |

## File / function size violations

| File / function | Lines | Cap | Action |
|---|---|---|---|

## Coupling & dependency issues

Describe components that are tightly coupled in ways that make isolated testing or change
difficult.

## Test coverage of scope

What tests exist? What is at risk of breaking during refactor?

## Recommended incremental plan

Do not refactor everything at once. Suggest safe, ordered steps.

1. [step — safe to do in isolation]
2. [step — depends on step 1]

## What NOT to refactor now

Items that look messy but are risky, actively changing, or low-priority.

## Rollback strategy

How do we verify nothing broke? What do we revert to if a step goes wrong?
