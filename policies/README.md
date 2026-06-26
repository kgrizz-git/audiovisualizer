# Policies

Last reviewed: 2026-06-26

Durable, opt-in repo rules a project can adopt and enforce. Each policy states the rule,
the rationale, sensible defaults, and how it is enforced (hook, CI, or convention).

Policies are **defaults to tune**, not laws. Pick what fits the project; change thresholds
in one place and let [`hooks/`](../hooks/) and [`ci/`](../ci/) enforce them.

## Policy files

| Policy | Enforced by |
|---|---|
| [file-size-and-counts.md](file-size-and-counts.md) — file/function size & per-dir file counts | `hooks/scripts/check_file_size.py` |
| [doc-freshness.md](doc-freshness.md) — `Last reviewed` markers & staleness windows | `hooks/scripts/check_doc_freshness.py` |
| [commits-and-branches.md](commits-and-branches.md) — commit messages, branch naming, PR hygiene | convention + optional CI |
| [security-baseline.md](security-baseline.md) — secrets, deps, SAST expectations | hooks + CI (see `inventory/security-quality.md`) |

## How to adopt

1. Read the policy and adjust thresholds to the project.
2. Wire the matching check in [`hooks/.pre-commit-config.yaml`](../hooks/.pre-commit-config.yaml)
   and/or a CI workflow.
3. Record the decision (e.g. in an ADR via [`templates/adr.md`](../templates/adr.md)).

## Enforcement tiers

- **Advisory** — surfaced in review/CI logs, does not block.
- **Soft gate** — warns locally (pre-commit), blocks in CI.
- **Hard gate** — blocks commit and CI.

Start advisory, promote to gates once the team agrees a rule is durable.
