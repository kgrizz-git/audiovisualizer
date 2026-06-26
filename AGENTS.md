# AGENTS.md

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
| Looking for a tool / library / service | [`inventory/README.md`](inventory/README.md) (a menu, not a checklist) |
| Adding/enforcing repo rules | [`policies/README.md`](policies/README.md) |
| Wiring local checks | [`hooks/README.md`](hooks/README.md) |
| Setting up CI | [`ci/README.md`](ci/README.md) |
| Writing a plan / design / review | [`templates/`](templates/) and [`prompts/`](prompts/) |
| Installing skills or subagents | [`inventory/catalog-skills-agents.md`](inventory/catalog-skills-agents.md) |

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
- `templates/` — fill-in artifacts (plan, design, ADR, bug/security/safety review, assessments).
- `policies/` — durable repo rules (file size/counts, doc freshness, commits, security baseline).
- `hooks/` — pre-commit config + policy-check scripts.
- `ci/` — CI selection guidance and example workflows.
- `inventory/` — curated indexes of tools, skills, MCP servers, references (install-on-demand).
- `.cursor/`, `.windsurf/` — editor rule sets (CodeGuard security rules).
- `.context/` — scratch only; never required reading, never committed.

## Conventions

- **Commits/branches:** see [`policies/commits-and-branches.md`](policies/commits-and-branches.md).
- **Doc freshness:** durable docs carry a `Last reviewed: YYYY-MM-DD` marker; see
  [`policies/doc-freshness.md`](policies/doc-freshness.md).
- **File size limits:** see [`policies/file-size-and-counts.md`](policies/file-size-and-counts.md).
- **SemVer:** the template itself is versioned in [`VERSION`](VERSION).

## Agent compatibility

This file follows the [AGENTS.md](https://agents.md) convention and is read (directly or via
a thin pointer) by Claude Code, OpenAI Codex/GPT, Cursor, Gemini/Antigravity, Qwen, DeepSeek,
MiniMax, opencode, Windsurf, and GitHub Copilot. When adding tool-specific behavior, keep the
durable rule here and let the per-tool file point to it.
