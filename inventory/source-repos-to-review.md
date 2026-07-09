# Source Repositories To Review

Last reviewed: 2026-07-09

Repos worth inspecting for reusable skills, prompts, conventions, tools, or architecture
ideas. This is a starting list — add entries as you discover new candidates.

---

## Curated starting list

| Repo | Why useful |
|---|---|
| `kgrizz-git/Notes_and_Ideas` | Personal collection: ~15 subagents, ~60 skills (scientific, engineering, writing, dev); orchestration auto-chain rule; harness patterns. Distilled into `inventory/catalog-skills-agents.md` |
| https://github.com/K-Dense-AI/claude-scientific-skills | Large library of `SKILL.md`-format scientific skills (bio, chem, physics, ML, writing). MIT license. See `inventory/catalog-skills-agents.md` |
| https://github.com/openai/symphony | OpenAI multi-agent orchestration framework. Task graphs, routing, parallelism, observability |
| https://github.com/juanceresa/sift-kg | Knowledge graph construction from codebases for LLM grounding. See `inventory/knowledge-graph-code-mapping.md` |
| https://github.com/obra/superpowers | Agentic skills framework + core methodology (planning, TDD, debugging, review) |
| https://github.com/obra/superpowers-skills | Community-editable Superpowers skills companion |
| https://github.com/garry-tan/gstack | Agentic workflow conventions and project scaffolding patterns |
| https://github.com/anthropics/mcp | Model Context Protocol reference implementation and server examples |

---

## User-added sources

Add entries here as they are identified:

```text
- <repo-url-or-path> — <why it may be useful>
```

---

## Review checklist

For each source repo:

- What reusable skills, prompts, rules, or scripts does it contain?
- Which conventions are project-specific and should not be copied?
- Are there useful CI, security, testing, docs, or release patterns?
- Are there licensing or attribution constraints?
- Is the repo actively maintained? (last commit, open issues, stars)
- What small adaptation, if any, should be added to this project?
