# CLAUDE.md

This repository uses [`AGENTS.md`](AGENTS.md) as the single source of truth for agent
guidance. Read it first.

Claude Code specifics (keep tool-only notes here; durable rules stay in `AGENTS.md`):
- Skills, subagents, and slash commands to install on demand are cataloged in
  [`inventory/catalog-skills-agents.md`](inventory/catalog-skills-agents.md).
- Configure harness behavior (hooks, permissions) via `.claude/settings.json` when a project needs it.
- Put scratch work in `.context/` (gitignored).
