# Repo Harness Template

Last reviewed: 2026-07-13

A project seed for AI-assisted development — policies, hooks, CI examples, templates, and curated tool inventories baked in from day one.

**To start a new project:** clone this repo, open it in your AI coding environment, and feed the agent [`prompts/bootstrap-project.md`](prompts/bootstrap-project.md). The agent interviews you, captures a project profile, and scaffolds only what you need.

**Returning to an existing project:** run [`prompts/new-agent-session.md`](prompts/new-agent-session.md) at the start of each session.

---

## What's here and why

| Directory | What it is |
|---|---|
| [`prompts/`](prompts/) | Reusable agent prompts: bootstrap, session-start, maintenance, reviews, audits |
| [`templates/`](templates/) | Fill-in artifacts: briefs, plans, designs, ADRs, runbooks, release checklists, reviews, assessments |
| [`policies/`](policies/) | Durable repo rules: file size, plans/todos, changelogs, doc freshness, commits, security, GC |
| [`hooks/`](hooks/) | Pre-commit config + policy scripts (file size, TODO limits, secrets, lint) |
| [`ci/`](ci/) | CI selection guidance and example GitHub Actions workflows |
| [`inventory/`](inventory/) | Curated menus of tools, skills, platforms, libraries, and references — load what you need |
| [`plans/`](plans/) | Optional active plans + archive convention (see policies) |

Full contents: see [`inventory/README.md`](inventory/README.md) for the tool/skill menu and [`AGENTS.md`](AGENTS.md) for agent navigation.

Changelogs: user-facing [`CHANGELOG.md`](CHANGELOG.md); developer/internal [`CHANGELOG.dev.md`](CHANGELOG.dev.md) — see [`policies/changelog-conventions.md`](policies/changelog-conventions.md).

GitHub setup and sensitive-data controls: [`policies/github-repository-hygiene.md`](policies/github-repository-hygiene.md) scales default-branch rules, required checks, scanning, hooks, and PII/PHI/absolute-path gates to the project’s data classification.

## Template Development Notes

Use `.context/` for temporary artifacts while developing this template, such as scratch plans, research notes, draft inventories, and evaluation checklists. In Conductor workspaces this directory is ignored by Git and should not become part of the reusable template.

Keep committed content small and durable. Prefer adding a focused inventory entry or reusable prompt over adding a complete framework scaffold that future projects may need to delete. Personal API key pages and exploratory dumps belong in Notes_and_Ideas, not here.
