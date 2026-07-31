# Bootstrap Checklist (Guided Steps)

Last reviewed: 2026-07-16

A phase-by-phase companion to [`bootstrap-project.md`](bootstrap-project.md). That prompt is the
narrative; this is the walk-through you tick off. Work top to bottom, but **interview before
scaffolding** — do not create many files until the user has answered Phase 0. Each step links to
the deep doc that owns the detail; do not duplicate it here.

Skip a step only when the user's answers make it clearly irrelevant, and say so.

## Phase 0 — Discovery (ask, then summarize)

- [ ] Ask what the repo is for, who uses it, platforms/runtimes/languages, and success criteria.
      Full question list: [`bootstrap-project.md`](bootstrap-project.md) §1.
- [ ] Ask the **data question explicitly**: what data can enter this repo (code, fixtures,
      screenshots, logs, exports)? Will it hold real personal/customer data or secrets — or is
      that prohibited with synthetic-only fixtures?
- [ ] Ask whether subagents/parallel workers should be used for research, planning, or review.
- [ ] Summarize answers back; list assumptions and open questions.
- [ ] If real personal/customer data or secrets may enter the repo, plan to keep them out: run
      `hooks/scripts/check_public_repo_clean.py` (wired as `check-public-repo-clean` in
      `.pre-commit-config.yaml`) before publishing; keep tokens, private keys, absolute local
      paths, emails, and private IPs out of history.

## Phase 1 — Profile

- [ ] Run [`project-init-profile.md`](project-init-profile.md); write `.context/project-profile.md`.
- [ ] Set the **data classification** and hygiene tier (`standard` / `sensitive` / `regulated`) —
      when unknown, use the more protective tier.
- [ ] Use the profile's "Relevant inventory" to decide which inventory files to load (not all of them).

## Phase 2 — Protect the template remote

- [ ] `git remote -v`; repoint `origin` away from this template before any push
      ([`bootstrap-project.md`](bootstrap-project.md) §2). Only push after the user confirms the remote.

## Phase 3 — Repo hygiene & GitHub settings

- [ ] Choose the tier and controls in [`policies/github-repository-hygiene.md`](../policies/github-repository-hygiene.md):
      default-branch ruleset, required reviews/checks, secret scanning + push protection, Dependabot,
      CodeQL, `CODEOWNERS`, `SECURITY.md`, least-privilege Apps/secrets/workflow permissions.
- [ ] Decide required-check names now (e.g. `ci / test`, `security / secret scan`) so rulesets match CI.

## Phase 4 — Hooks & CI

- [ ] Copy [`hooks/.pre-commit-config.yaml`](../hooks/.pre-commit-config.yaml) to the root; enable the
      baseline (gitleaks, private-key, file-size, doc-freshness, lint). `pre-commit install`.
- [ ] Pick CI workflows from [`ci/README.md`](../ci/README.md); estimate Actions cost first
      ([`policies/github-actions-usage.md`](../policies/github-actions-usage.md)).
- [ ] Decide what belongs in pre-commit vs CI vs agent-side ([`hooks/README.md`](../hooks/README.md)).

## Phase 4.5 — Environment

- [ ] Recommend `direnv` (+ `pyenv`/`.python-version` and a venv layout for Python)
      ([`bootstrap-project.md`](bootstrap-project.md) §6). Commit `.envrc.example`; gitignore `.envrc`.

## Phase 5 — Skills, subagents & references

- [ ] Pick a minimal set from [`inventory/catalog-skills-agents.md`](../inventory/catalog-skills-agents.md);
      record install-now / evaluate-later / skip-for-now and why in the profile.
- [ ] Choose an orchestration tier deliberately ([`inventory/harness-engineering.md`](../inventory/harness-engineering.md)) —
      do not default to Symphony for IDE work.
- [ ] Note other repos/sources to mine in [`inventory/source-repos-to-review.md`](../inventory/source-repos-to-review.md).

## Phase 6 — Agent harness & knowledge

- [ ] Write a thin `AGENTS.md` (small entrypoint → deep docs) and per-tool pointer files.
- [ ] If >~50 source files or type is `research`/`rag-knowledge`/`agentic`, set up a code map
      ([`inventory/knowledge-graph-code-mapping.md`](../inventory/knowledge-graph-code-mapping.md)); record it in the profile.

## Phase 7 — Docs & gardening

- [ ] Set up changelogs ([`policies/changelog-conventions.md`](../policies/changelog-conventions.md)),
      doc-freshness markers ([`policies/doc-freshness.md`](../policies/doc-freshness.md)), plans lifecycle
      ([`policies/plans-and-todos.md`](../policies/plans-and-todos.md)), and templates from [`templates/`](../templates/).
- [ ] Schedule the recurring [`maintenance-loop.md`](maintenance-loop.md) (weekly/monthly).

## Phase 8 — Scaffold, validate, hand off

- [ ] Produce the scaffold plan ([`bootstrap-project.md`](bootstrap-project.md) §5) and get approval before broad changes.
- [ ] Build the minimal scaffold; validate with real run/test/lint commands.
- [ ] Hand off ([`bootstrap-project.md`](bootstrap-project.md) §8): what was created, how to run/test,
      remote, checks passed, open decisions, next 3 steps. Point future sessions at
      [`new-agent-session.md`](new-agent-session.md).
