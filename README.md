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

### Prompts
- [`prompts/bootstrap-project.md`](prompts/bootstrap-project.md) — main prompt for turning a fresh clone into a project-specific base
- [`prompts/`](prompts/) — reusable prompts: refactor assessment, docs audit, TODO audit, subagent workflow, bug/security/safety review

### Templates
- [`templates/`](templates/) — fill-in artifacts for: plan, design doc, ADR, bug review, security review, safety review, QI assessment, testing assessment, refactor assessment

### Policies
- [`policies/`](policies/) — durable repo rules: file size/counts, doc freshness, commits/branches, security baseline, garbage collection

### Hooks
- [`hooks/`](hooks/) — pre-commit configuration and Python policy-check scripts (file size, doc freshness)

### CI
- [`ci/`](ci/) — CI selection guidance and example GitHub Actions workflows (fast lane, security/SAST, CodeQL, Dependabot)

### Inventory
- [`inventory/`](inventory/) — curated menus of tools, skills, platforms, and references. Key topics:
  - Skills/agents catalog (Notes_and_Ideas collection, K-Dense scientific skills, official sources)
  - Security/quality tools and OWASP Top 10 mapping
  - RAG building blocks, search APIs, knowledge-graph tools
  - Cloud/infra (Cloudflare, Google, Modal, VPS), AI agent platforms (Ollama, vLLM, LangGraph)
  - Scientific/domain libraries (medical imaging, EM/FDTD simulation, financial modeling)
  - GitHub apps, harness engineering references, source repos to review

### Other
- [`VERSION`](VERSION) — SemVer version for this template

## Template Development Notes

Use `.context/` for temporary artifacts while developing this template, such as scratch plans, research notes, draft inventories, and evaluation checklists. In Conductor workspaces this directory is ignored by Git and should not become part of the reusable template.

Keep committed content small and durable. Prefer adding a focused inventory entry or reusable prompt over adding a complete framework scaffold that future projects may need to delete.
