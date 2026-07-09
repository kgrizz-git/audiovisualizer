# Inventory

Last reviewed: 2026-07-09

A curated index of tools, skills, MCP servers, libraries, cloud services, and source
repositories that may help an AI agent scaffold or improve a project.

The inventory is **not a checklist** to install everything. Use it as a menu:

1. Read this file.
2. Open only topic files relevant to the project.
3. Ask the user about additional repos, tools, org standards, or constraints.
4. Choose a minimal useful set.
5. Explain why each selected item fits.

**Scope:** durable, reusable menus live here. Personal bookmarks, private API-key
dashboards, and exploratory research notes belong in a Notes_and_Ideas (or similar)
repo — not committed into this template.

---

## Topic files

### Skills & agents
- [catalog-skills-agents.md](catalog-skills-agents.md) — install-on-demand catalog of subagents and skills (Notes_and_Ideas, K-Dense / Pantheon, Obra, gstack, agentskills.io, official Claude/OpenAI patterns)
- [skills-index.md](skills-index.md) — selection criteria and import guidance for skills and prompts

### Tools & infrastructure
- [tools-index.md](tools-index.md) — general developer tools, testing, package management, research (incl. Pantheon), docs (Sphinx, Pandoc), ML dev
- [security-quality.md](security-quality.md) — security, linting, SAST, dependency audit, OWASP Top 10 mapping
- [mcp-servers.md](mcp-servers.md) — MCP and agent tool server candidates
- [extensions-software.md](extensions-software.md) — local apps, editor extensions, CLIs, and hosted services
- [github-apps.md](github-apps.md) — GitHub-connected apps (AI review, SAST, coverage, vulnerability scanning)

### Cloud & platforms
- [cloud-and-infra.md](cloud-and-infra.md) — Cloudflare, Google Cloud/Colab/AI Studio, serverless GPU (Modal, HF Spaces), VPS options
- [ai-agent-platforms.md](ai-agent-platforms.md) — orchestration (LangGraph, Symphony, Archon, Conductor), browser agents, local model runners, IDE platforms

### AI / ML building blocks
- [rag.md](rag.md) — vector databases, RAG frameworks, embeddings, rerankers, document parsers, chunking, evaluation
- [search-apis.md](search-apis.md) — free and paid web search APIs, academic search (Semantic Scholar, arXiv, PubMed), Jina Reader/Search
- [knowledge-graph-code-mapping.md](knowledge-graph-code-mapping.md) — code knowledge graphs (sift-kg, GraphRAG), AI code wikis (DeepWiki, CodeWiki, repowise), symbol parsing, LLM context maps

### Domain libraries
- [python.md](python.md) — Python project defaults, formatting, testing, type checking
- [scientific-domain.md](scientific-domain.md) — medical imaging (pydicom, SimpleITK), EM/FDTD simulation (meep, openEMS, gprMax), general scientific stack
- [financial-modeling.md](financial-modeling.md) — market data (yfinance, FRED), quant libraries (QuantLib, PyPortfolioOpt, empyrical), backtesting (backtrader, vectorbt), modeling patterns

### Design & frontend
- [frontend-design-ux.md](frontend-design-ux.md) — Claude Design, Google Stitch, Figma, Penpot, shadcn/ui, Radix UI, Open Props, Shopify Polaris, frontend tooling

### Harness engineering
- [harness-engineering.md](harness-engineering.md) — harness reading; Archon; cross-IDE handoffs; agent standards (agents.md, skills.sh)

### References
- [source-repos-to-review.md](source-repos-to-review.md) — repos worth inspecting for reusable skills, conventions, and tools
