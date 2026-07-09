# Harness Engineering & Agent Platform References

Last reviewed: 2026-07-09

Key articles, frameworks, and tools for building repos and systems that are legible,
testable, and maintainable by AI coding agents. Read these before designing agent
workflows for a new project.

---

## Orchestration tier decision guide

Choose the lightest orchestration that fits the project. Heavier tiers have real setup
and maintenance cost — only pay it when the complexity justifies it.

| Situation | Tier | Tool |
|---|---|---|
| Single agent, simple task, IDE workflow | `none` | Plain prompts + AGENTS.md |
| 3–10 agents, file-based handoffs, IDE (Cursor/Claude Code) | `hub-and-spoke` | Notes_and_Ideas pattern (see `catalog-skills-agents.md`) |
| Complex branching, cyclical plan→act→observe loops, local or API | `langgraph` | LangGraph + LangSmith |
| Production multi-agent API: structured routing, retry, observability | `symphony` | OpenAI Symphony or LangGraph + LangSmith at scale |

**Key rule:** Symphony is right for production APIs with structured delegation at scale.
It is not the right default for IDE-based agentic work where file-based handoffs and
the hub-and-spoke orchestrator pattern (hub reads `plans/orchestration-state.md`,
dispatches subagents, merges results) are lighter and fully sufficient.

Record the chosen tier in `.context/project-profile.md` under "Agent orchestration."
Revisit the choice when the number of active subagents exceeds 10, or when the project
needs durable state across process restarts.

---

## Essential reading

### Anthropic — Effective Harnesses for Long-Running Agents
https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents

Key lessons (5-bullet summary):
- Give agents a tight feedback loop: the agent must be able to run, observe, and correct
  without human intervention on each micro-step.
- Make the environment deterministic and inspectable: tests, logs, and tool outputs
  should be machine-readable, not just human-readable.
- Scope agent tasks narrowly; broad open-ended tasks produce worse outcomes than a
  sequence of narrowly scoped sub-tasks.
- Harness = scaffolding around the agent: task queue, context injection, output
  validation, retry logic, and escalation paths.
- Prefer reversible actions; design checkpoints before irreversible ones.

### OpenAI — Harness Engineering
https://openai.com/index/harness-engineering/

Key lessons:
- Repository knowledge must be legible to agents: good README, AGENTS.md, indexed docs.
- Small, focused agent entrypoints outperform large monolithic instruction blobs.
- Encode project taste as checks (lint, tests, policy scripts), not prose instructions.
- Agent-friendly repos have fast local run/test cycles agents can use as self-validation.
- Track agent performance over time; regressions in agent behavior are bugs.

### OpenAI — Codex Subagents
https://developers.openai.com/codex/subagents

Key lessons:
- Decompose work into bounded sub-tasks with clear inputs, outputs, and verification.
- Sub-agents should not share mutable state; use files or a message-passing interface.
- Give each sub-agent a narrow tool set — broad tool access degrades performance.
- Merge sub-agent outputs into one coherent plan before broad changes.

### Addy Osmani — Loop Engineering
https://addyosmani.com/blog/loop-engineering/

Also summarized on The New Stack:
https://thenewstack.io/loop-engineering/

Tight agent feedback loops: run → observe → correct without human intervention on each
micro-step. Complements Anthropic/OpenAI harness guidance above.

### Addy Osmani — Agent Harness Engineering
https://addyosmani.com/blog/agent-harness-engineering/

Agent = model + harness. Treat prompts, hooks, tools, sandboxes, and recovery paths as
first-class engineering: every agent mistake becomes a durable rule or gate (the ratchet).

### Addy Osmani — The Factory Model
https://addyosmani.com/blog/factory-model/

Shift from writing code to building the factory that builds software: fleets of agents,
precise specs, strong tests (red/green TDD), and verification as the bottleneck—not
generation.

### Addy Osmani — Long-running Agents
https://addyosmani.com/blog/long-running-agents/

Persistence across sessions/sandboxes: external state, handoffs, and self-verification so
agents keep progress over hours/days without context-window amnesia.

### Salesforce Engineering — Code Quality at Agent Speed (7 patterns)
https://engineering.salesforce.com/maintaining-code-quality-at-agent-speed-7-patterns-for-agentic-engineering/

Verification-first agentic SDLC: independent author/judge for tests, quality gates over
prompts, mutation testing, and engineering the full lifecycle (review/CI/release) so
confidence scales with generation speed.

### Agent Patterns
https://agentpatterns.ai/

Catalog of agent workflow patterns. Start with:
- https://agentpatterns.ai/workflows/ — reusable workflow shapes
- https://agentpatterns.ai/workflows/central-repo-shared-agent-standards/ — shared standards in a central repo (aligns with this template)
- https://agentpatterns.ai/code-review/agent-assisted-code-review/ — agent-assisted review patterns

---

## Frameworks & orchestration

### OpenAI Symphony
https://github.com/openai/symphony

Multi-agent orchestration framework from OpenAI. Provides structured delegation,
sub-agent lifecycle management, and result aggregation. Reference for designing
hub-and-spoke agent teams.

### LangGraph
https://github.com/langchain-ai/langgraph

Graph-based agent workflow framework (LangChain ecosystem). Good for stateful,
cyclical agent workflows (plan → act → observe → re-plan). Pairs with LangSmith
for observability.

### LangSmith
https://docs.langchain.com/langsmith/home

Observability and eval platform for LangChain / LangGraph agents. Trace, debug, and
evaluate agent runs. Use when you need visibility into multi-step agent chains.

### Conductor OSS
https://conductor-oss.org

Workflow orchestration engine (Netflix origin) for long-running, distributed tasks.
Not LLM-specific but well-suited for durable agent task queues with retry, timeout,
and human-in-the-loop patterns.

### Archon
https://github.com/coleam00/archon · https://archon.diy

Open-source **harness builder / command layer** for AI coding agents (MIT). Package
workflows as YAML DAGs (loops, gates, conditions); dispatch from terminal, Slack,
Telegram, GitHub comments, or web; each run gets an isolated git worktree for parallel
agents. Bring your own agent (Claude Code, Codex, …). Prefer when you want repeatable,
fleet-style dispatch without reinventing orchestration. Install sketch:
`curl -fsSL https://archon.diy/install | bash` (review the script before running).

### MCP (Model Context Protocol)
https://modelcontextprotocol.io

Standard protocol for exposing tools, resources, and context to LLM agents. Use when
building custom tool servers for agents; see `inventory/mcp-servers.md`.

---

## Cross-IDE session handoffs

When you switch between Cursor, Claude Code, Codex, etc., context usually dies. Prefer
**structured handoff artifacts** (markdown + MCP) over re-prompting. Discussion seed:
https://www.reddit.com/r/cursor/comments/1stt6i0/built_a_claude_code_cursor_handoff_system_today/

Concrete options to evaluate (menu, not mandate):

| Tool | Approach |
|---|---|
| [Passoff](https://github.com/TheMrGU/Ai-Agent-Context-Passoff) | MCP + slash commands (`/passoff`, `/passoff-load`); local SQLite; provenance across clients |
| [handoff](https://github.com/zhangluka/handoff) | Parse Claude Code session JSONL → inject `.cursor/rules/handoff-context.mdc` (no LLM) |
| [ai-sync](https://github.com/oreolion/ai-sync-plugin) | Shared `.ai-sync/HANDOFF.md` + adapters for Cursor/Claude/Codex/Windsurf/… |

This template’s hub-and-spoke pattern (`plans/orchestration-state.md` + HANDOFF blocks)
is the same idea in-repo — use a dedicated tool when you switch **IDEs** mid-task.

---

## Browser & web automation for agents

### Browser-use
https://github.com/browser-use/browser-use

Python library that gives LLM agents structured browser control (Playwright-based).
Use for agentic web tasks, form filling, scraping, and end-to-end UI testing.

### Skyvern
https://github.com/Skyvern-AI/skyvern

LLM + computer vision browser automation. More robust to DOM changes than selector-based
tools; targets workflows where the page structure is unpredictable.

### Azure AI Foundry — Browser Automation
https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/browser-automation

Browser automation within Azure AI Foundry agents. Reference if already using Azure.

---

## Unified LLM access

### OpenRouter
https://openrouter.ai

Unified API gateway across 100+ LLM providers (OpenAI, Anthropic, Google, Mistral,
open models). Single API key, pay-as-you-go, model fallback support. Useful for
experiments comparing models or for cost routing.

---

## Agent-skill standards & directories

### AGENTS.md convention
https://agents.md

Cross-tool standard for the `AGENTS.md` entrypoint file. Already implemented in this
template — see root `AGENTS.md`.

### agentskills.io
https://agentskills.io

Cross-IDE skill standard specification. Reference when writing `SKILL.md` files
compatible with Cursor, VS Code Copilot, Claude Code, and Kiro.

### skills.sh
https://skills.sh

Community directory of reusable `SKILL.md` definitions. Browse before writing a skill
from scratch — it may already exist.

### Claude Code skills docs
https://code.claude.com/docs/en/skills

Official Claude Code skill authoring reference.

### Cursor skills docs
https://cursor.com/docs/context/skills

Cursor-specific skill format and discovery docs.

### VS Code Copilot skills docs
https://code.visualstudio.com/docs/copilot/customization/agent-skills

VS Code Copilot agent skill format.

---

## Warp terminal agent platform

### Warp Agent Platform
https://docs.warp.dev/agent-platform

Agentic features in Warp terminal: agent mode, runbooks, and workflow automation.
Reference if your team uses Warp as the primary terminal.
