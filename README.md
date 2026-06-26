# Project Seed Template

Last reviewed: 2026-06-26

This repository is a minimal starter for creating future projects with help from an AI coding agent. It is not an application scaffold. Its main asset is a structured bootstrap prompt plus curated inventories of tools, skills, MCP servers, and reusable prompt patterns.

## Start A New Project

1. Clone or copy this template into a new local repo.
2. Open the cloned repo in your AI coding environment.
3. Feed the agent [prompts/bootstrap-project.md](prompts/bootstrap-project.md).
4. Let the agent interview you before it writes a large scaffold.
5. Before the first project commit or push, have the agent walk you through changing the Git remote so the new project does not push back to this template repository.

## What Is Included

- [prompts/bootstrap-project.md](prompts/bootstrap-project.md): the main prompt for turning a fresh clone into a project-specific base.
- [prompts/](prompts): reusable prompts for refactor reviews, docs audits, TODO audits, and subagent workflows.
- [inventory/](inventory): indexes of skills, tools, MCP servers, security tools, Python defaults, frontend/design resources, and AI agent platforms.
- [VERSION](VERSION): SemVer version for this template.

## Template Development Notes

Use `.context/` for temporary artifacts while developing this template, such as scratch plans, research notes, draft inventories, and evaluation checklists. In Conductor workspaces this directory is ignored by Git and should not become part of the reusable template.

Keep committed content small and durable. Prefer adding a focused inventory entry or reusable prompt over adding a complete framework scaffold that future projects may need to delete.
