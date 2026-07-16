# AGENTS.md

Last reviewed: 2026-07-14

Single source of truth for AI coding agents working in this repository. Other agent
entrypoints (`CLAUDE.md`, `GEMINI.md`, `QWEN.md`, `.github/copilot-instructions.md`,
`.cursor/rules/`, `.windsurf/rules/`) are thin pointers back to this file.

> This repo is a **project-seed template**, not an application. Its asset is durable
> guidance: a bootstrap prompt, policies, hooks, CI guidance, reusable prompt/doc
> templates, and curated inventories. Keep additions small, durable, and discoverable.

## Read this first (thin entry → deep docs)

Do not load everything. Start here, then open only what the task needs.

| If you are… | Read |
|---|---|
| Starting a new project from this template | [`prompts/bootstrap-project.md`](prompts/bootstrap-project.md) |
| Starting a work session on an existing project | [`prompts/new-agent-session.md`](prompts/new-agent-session.md) |
| Capturing what kind of project this is | [`prompts/project-init-profile.md`](prompts/project-init-profile.md) |
| Running periodic repo health checks | [`prompts/maintenance-loop.md`](prompts/maintenance-loop.md) |
| Looking for a tool / library / service | [`inventory/README.md`](inventory/README.md) (a menu, not a checklist) |
| Adding/enforcing repo rules | [`policies/README.md`](policies/README.md) |
| Wiring local checks | [`hooks/README.md`](hooks/README.md) |
| Setting up CI | [`ci/README.md`](ci/README.md) |
| Working with PII, PHI, medical/FHIR/HL7/DICOM, or regulated data | [`prompts/strict-phi-agent-guidance.md`](prompts/strict-phi-agent-guidance.md) **before editing or configuring tools** |
| Checking Actions minutes / storage | [`ci/scripts/check_gha_usage.py`](ci/scripts/check_gha_usage.py), [`policies/github-actions-usage.md`](policies/github-actions-usage.md) |
| Checking open PRs after push / daily | [`ci/scripts/check_open_prs.py`](ci/scripts/check_open_prs.py), [`policies/commits-and-branches.md`](policies/commits-and-branches.md) |
| Writing a plan / design / review | [`templates/`](templates/) and [`prompts/`](prompts/) |
| Installing skills or subagents | [`inventory/catalog-skills-agents.md`](inventory/catalog-skills-agents.md) |
| Choosing an orchestration approach | [`inventory/harness-engineering.md`](inventory/harness-engineering.md) |

## Operating principles

1. **Menu, not mandate.** Inventories list options; choose the minimal useful set per project.
2. **Thin entry, deep docs.** Keep this file short; push detail into linked docs.
3. **Interview before scaffolding.** Ask the user goals/constraints before writing many files.
4. **Verify, don't guess.** Prefer running tools and reading files over assuming.
5. **Policy as code where it pays.** Encode durable rules as checks with clear remediation.
6. **Temporary stays temporary.** Put scratch plans/research in `.context/` (gitignored).
7. **Protect the template remote.** Before a new project's first push, repoint `origin`
   away from this template (see the bootstrap prompt, step 2).

## Repo map

- `prompts/` — reusable prompts (bootstrap, refactor, docs audit, subagent workflow, reviews).
- `templates/` — fill-in artifacts (briefs, plans, designs, ADRs, runbooks, releases, reviews, assessments).
- `policies/` — durable repo rules (file size/counts, plans/todos, changelogs, doc freshness, commits, security).
- `hooks/` — pre-commit config + policy-check scripts (file size, TODO limits, secrets, lint).
- `ci/` — CI selection guidance and example workflows.
- `inventory/` — curated indexes of tools, skills, MCP servers, references (install-on-demand).
- `plans/` — (when adopted) active implementation plans; archive completed ones under `plans/archive/`.
- `hooks/scripts/check_sensitive_data.py` — opt-in strict medical-data gate; scans every tracked file and requires exact human approval for opaque files.
- `inventory/medical-data-security.md` — strict guard setup and medical-data scanner menu.
- `.cursor/`, `.windsurf/` — editor rule sets (CodeGuard security rules).
- `.context/` — scratch only; never required reading, never committed.

## Conventions (changelog, plans, sizes)

| Topic | Where documented |
|---|---|
| Public vs developer changelogs + SemVer | [`policies/changelog-conventions.md`](policies/changelog-conventions.md) |
| Plans lifecycle, marking done, archiving, `to_do` caps | [`policies/plans-and-todos.md`](policies/plans-and-todos.md) |
| Source/doc line caps (soft **600** / hard **1000**) | [`policies/file-size-and-counts.md`](policies/file-size-and-counts.md) |
| Secret scanning + lint hooks | [`hooks/README.md`](hooks/README.md), [`policies/security-baseline.md`](policies/security-baseline.md) |
| GitHub Actions minutes/storage (estimate before expanding CI) | [`policies/github-actions-usage.md`](policies/github-actions-usage.md), [`ci/scripts/check_gha_usage.py`](ci/scripts/check_gha_usage.py) |
| Open PRs after push (advisory, not a hook) | [`policies/commits-and-branches.md`](policies/commits-and-branches.md), [`ci/scripts/check_open_prs.py`](ci/scripts/check_open_prs.py) |
| Strict PII/PHI controls, approval inventory, and agent behavior | [`prompts/strict-phi-agent-guidance.md`](prompts/strict-phi-agent-guidance.md), [`inventory/medical-data-security.md`](inventory/medical-data-security.md) |

**Notes_and_Ideas vs this template:** personal research dumps, private key dashboards, and
exploratory idea notes belong in a Notes_and_Ideas (or similar) repo. Index only durable,
reusable menus and conventions here.

## Agent compatibility

This file follows the [AGENTS.md](https://agents.md) convention and is read (directly or via
a thin pointer) by Claude Code, OpenAI Codex/GPT, Cursor, Gemini/Antigravity, Qwen, DeepSeek,
MiniMax, opencode, Windsurf, and GitHub Copilot. When adding tool-specific behavior, keep the
durable rule here and let the per-tool file point to it.
