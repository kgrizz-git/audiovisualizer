# Repo Harness Template

Last reviewed: 2026-06-26

A project seed for AI-assisted development — policies, hooks, CI examples, templates, and curated tool inventories baked in from day one.

**To start a new project:** clone this repo, open it in your AI coding environment, and feed the agent [`prompts/bootstrap-project.md`](prompts/bootstrap-project.md). The agent interviews you, captures a project profile, and scaffolds only what you need.

**Returning to an existing project:** run [`prompts/new-agent-session.md`](prompts/new-agent-session.md) at the start of each session.

---

## What's here and why

| Directory | What it is |
|---|---|
| [`prompts/`](prompts/) | Reusable agent prompts: bootstrap, session-start, maintenance, reviews, audits |
| [`templates/`](templates/) | Fill-in artifacts: plan, design doc, ADR, bug/security/safety review, assessments |
| [`policies/`](policies/) | Durable repo rules: file size, doc freshness, commits, security baseline, garbage collection |
| [`hooks/`](hooks/) | Pre-commit config + Python policy-check scripts (enforces the policies above) |
| [`ci/`](ci/) | CI selection guidance and example GitHub Actions workflows |
| [`inventory/`](inventory/) | Curated menus of tools, skills, platforms, libraries, and references — load what you need |

Full contents: see [`inventory/README.md`](inventory/README.md) for the tool/skill menu and [`AGENTS.md`](AGENTS.md) for agent navigation.

## Template Development Notes

Use `.context/` for temporary artifacts while developing this template, such as scratch plans, research notes, draft inventories, and evaluation checklists. In Conductor workspaces this directory is ignored by Git and should not become part of the reusable template.

Keep committed content small and durable. Prefer adding a focused inventory entry or reusable prompt over adding a complete framework scaffold that future projects may need to delete.
