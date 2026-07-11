# AI Agent Platforms & Workflow Frameworks

Last reviewed: 2026-07-11

Platforms, frameworks, and local model runners for building and hosting agentic AI
workflows. See also `inventory/harness-engineering.md` for repo-level harness articles
and `inventory/catalog-skills-agents.md` for installable skills/agents.

---

## Orchestration frameworks

### LangChain / LangGraph
https://python.langchain.com / https://github.com/langchain-ai/langgraph

LangChain provides chains, tools, memory, and retrieval components. LangGraph extends it
with stateful graph-based workflows suitable for long-running, multi-step agentic loops.
Use LangGraph when you need explicit state machines with conditional edges and human-in-
the-loop checkpoints. Pairs with LangSmith for observability.

### LangSmith
https://smith.langchain.com

Tracing, evaluation, and dataset management for LangChain/LangGraph applications.
Record every LLM call, tool invocation, and retrieval step; compare runs; create eval
datasets from production traces. Essential once a LangChain app moves beyond prototype.

### Symphony (OpenAI)
https://github.com/openai/symphony

OpenAI's multi-agent orchestration framework. Task graph execution, agent registration
and routing, parallelism controls, and observability hooks. Install: `pip install symphony-ai`.

### Conductor (Netflix OSS)
https://conductor-oss.org / https://github.com/conductor-oss/conductor

Workflow orchestration engine originally from Netflix. Supports distributed, long-running
workflows with retry, error handling, and state persistence. Not LLM-specific but a solid
durable workflow engine for agent task pipelines that need reliability guarantees.

### Archon
https://github.com/coleam00/archon · https://archon.diy

Open-source command layer / harness builder for coding agents: YAML workflow DAGs,
multi-channel dispatch (CLI, Slack, GitHub comments, …), isolated git worktrees per run,
BYO agent (Claude Code, Codex, …). See also `inventory/harness-engineering.md`.

### MCP (Model Context Protocol)
https://modelcontextprotocol.io / https://github.com/anthropics/mcp

Anthropic's open protocol for giving LLM agents access to tools, resources, and prompts
via standardized server connections. Claude Code, Cursor, and other IDEs support MCP
natively. See `inventory/mcp-servers.md` for server candidates.

---

## Browser & web automation

### Cloudflare Browser Run
https://developers.cloudflare.com/browser-rendering/

Managed browser automation on Cloudflare's network: remote Chrome, CDP, MCP-style agent
workflows, live view, crawling, and human-in-the-loop browser tasks. Use when local
Playwright is not enough or browser work should run close to edge infrastructure.

### browser-use
https://github.com/browser-use/browser-use

Python library for giving LLM agents control over a real browser (Playwright-backed).
Agents can navigate, click, fill forms, extract content, and handle multi-step web tasks.
Good for web scraping agents, form automation, and UI-driven testing.

```bash
pip install browser-use
playwright install chromium
```

### Skyvern
https://github.com/Skyvern-AI/skyvern

Browser automation via LLMs + computer vision. Uses screenshot analysis rather than DOM
selectors for fragile-site robustness. REST API + Python SDK. Better than browser-use
for complex visual UIs that break selector-based approaches.

### Azure AI Foundry
https://azure.microsoft.com/products/ai-foundry

Microsoft's managed platform for building, deploying, and monitoring AI agents. Provides
agent hosting, tool execution, memory, and integration with Azure services. Enterprise
focus; managed security and compliance.

---

## Unified LLM access

### OpenRouter
https://openrouter.ai

Unified API that routes to 100+ models (OpenAI, Anthropic, Google, Mistral, Meta, etc.)
via a single endpoint. OpenAI-compatible interface. Use when you want to swap models
without changing code, or compare model outputs programmatically.

```python
client = openai.OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
)
```

---

## Local model runners

Run open-weight models (Llama, Mistral, Qwen, Gemma, Phi, etc.) locally or on a VPS.
See `inventory/cloud-and-infra.md` for VPS options (Hetzner, Vultr, DigitalOcean).

### Ollama
https://ollama.com

The easiest path to local LLM inference. `ollama pull llama3.3` downloads and serves a
model; `ollama run llama3.3` opens a chat. REST API at `localhost:11434`; OpenAI-
compatible endpoint available. Supports macOS (Metal), Linux (CUDA), Windows.

```bash
ollama pull mistral
curl http://localhost:11434/api/generate -d '{"model":"mistral","prompt":"hello"}'
```

### llama.cpp
https://github.com/ggml-org/llama.cpp

Low-level C++ inference engine for GGUF-quantized models. Maximum control over
quantization, context size, and GPU layer offload. Use when Ollama's abstraction is
too opaque, or for embedding into custom servers. Python bindings via `llama-cpp-python`.

### LM Studio
https://lmstudio.ai

Desktop GUI for downloading and running open models locally. Built on llama.cpp.
Easy model discovery via Hugging Face; OpenAI-compatible local server. Good for
non-developer users or quick local experiments.

### MLX (Apple Silicon)
https://github.com/ml-explore/mlx / https://github.com/ml-explore/mlx-lm

Apple's ML framework optimized for Apple Silicon (M-series chips). `mlx-lm` provides
efficient inference for language models on macOS. Significantly faster than llama.cpp
on Apple Silicon for many models.

```bash
pip install mlx-lm
mlx_lm.generate --model mlx-community/Llama-3.2-3B-Instruct-4bit --prompt "hello"
```

### vLLM
https://github.com/vllm-project/vllm

High-throughput LLM serving with PagedAttention for GPU servers. OpenAI-compatible
REST API. Use when serving models to multiple concurrent users; much higher throughput
than llama.cpp for server workloads. Requires NVIDIA GPU (CUDA).

```bash
pip install vllm
vllm serve meta-llama/Llama-3.1-8B-Instruct --port 8000
```

---

## IDE and agent platforms

### Claude Code
https://docs.anthropic.com/en/docs/claude-code

Anthropic's CLI agent with CLAUDE.md project memory, MCP server support, hooks,
subagent spawning, and persistent sessions. The primary platform this template is
designed for. See `AGENTS.md` for project-specific guidance.

### Cursor
https://cursor.com

AI-native IDE built on VS Code. Supports `.cursor/rules/` (agent behavior), Cursor
subagents (`.claude/agents/*.md`), Cursor skills (`.claude/skills/*/SKILL.md`), and
background agent execution. Multi-file edits, codebase indexing, and tab completion.

### Windsurf
https://windsurf.ai

AI IDE by Codeium. Supports `.windsurf/rules/` for persistent agent guidance. "Cascade"
agent mode for autonomous multi-step tasks. Similar feature set to Cursor.

### opencode
https://opencode.ai

Terminal-based AI coding agent. AGENTS.md-compatible. Good alternative for
terminal-centric workflows where a full IDE is not needed.

When constraining agent filesystem access (e.g. block writes outside the repo):
- Config overview: https://opencode.ai/docs/config/
- Permissions: https://opencode.ai/docs/config/#permissions
- Local directories: https://opencode.ai/docs/references/#local-directories
- Agents: https://opencode.ai/docs/agents/
- Plugins: https://opencode.ai/docs/ecosystem#plugins

### Warp Agent Platform
https://www.warp.dev/agents

Warp terminal's AI agent features. Supports natural language command generation,
session-aware context, and agent-driven terminal workflows. Integrates with the
terminal environment rather than a code editor.

### GitHub Copilot (VS Code)
https://github.com/features/copilot

Copilot in VS Code / GitHub supports `.github/copilot-instructions.md` for project-
level instructions. Copilot Workspace handles autonomous multi-step tasks from issues.

---

## General guidance

Keep agent instructions short and navigable. Put durable project truth in versioned docs.
Promote recurring review comments or repeated failures into prompts, rules, or inventory
entries that future agents can reuse. Choose one orchestration framework per project; avoid
mixing LangGraph + Symphony + Conductor in the same codebase.
