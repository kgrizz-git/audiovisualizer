# Knowledge Graph & Code Mapping Tools

Last reviewed: 2026-07-11

Tools for building structural maps of codebases, understanding cross-file relationships,
and creating knowledge graphs that agents and humans can query. Useful for large repos,
onboarding, and RAG over code.

---

## Code knowledge graphs

### sift-kg
https://github.com/juanceresa/sift-kg

Builds a navigable knowledge graph of a codebase using static analysis. Extracts
entities (functions, classes, modules, calls) and their relationships into a graph
structure. Good starting point for code-grounded RAG or agent context injection.

### Graphify + NetworkX
https://www.marktechpost.com/2026/06/24/using-graphify-and-networkx-to-map-python-codebase-structure-with-god-nodes-communities-and-architecture-visualizations/

Offline Python/SQL structure extraction (tree-sitter via Graphify; PyPI package often
`graphifyy`) into `graph.json`, then NetworkX for god-node centrality, Louvain
communities, shortest paths, and Matplotlib/Pyvis visualizations. Prefer when you want
local architecture maps without an LLM backend.

### Understand Anything
https://github.com/yoheinakajima/understand-anything

Interactive codebase/wiki knowledge graph with guided tours, diff impact exploration,
and chat over mapped repositories. Use when humans need a browsable graph UI rather than
only static diagrams or generated Markdown docs.

### GraphRAG (Microsoft)
https://github.com/microsoft/graphrag

General-purpose graph RAG framework. Builds community-structured knowledge graphs from
text corpora (including code docs/comments). Better for documentation and prose than
raw code structure; combine with a code-structure tool for full coverage.

### GraphRAG Workbench
https://github.com/ChristopherLyon/graphrag-workbench

Interactive 3D visualization of Microsoft GraphRAG outputs (entities, relationships,
communities). Use after a GraphRAG run when humans need to explore the graph visually.

### Neo4j + LLM patterns
https://neo4j.com/developer/graph-rag/

Graph database + LLM integration patterns (GraphRAG, text-to-cypher). Use when you
need persistent, queryable knowledge graphs that outlive a single agent session.

---

## Code parsing & symbol extraction

### tree-sitter
https://tree-sitter.github.io/tree-sitter/

Fast, incremental, error-tolerant parser for 100+ languages. The parsing backbone
behind most modern code intelligence tools. Use directly when you need language-aware
AST traversal; most higher-level tools use it internally.

### ctags / universal-ctags
https://ctags.io

Classic cross-language symbol indexer. Generates tag files (function/class/variable
locations) consumable by editors and agents. Simple, fast, works offline.

### Sourcegraph + SCIP
https://sourcegraph.com / https://github.com/sourcegraph/scip

Sourcegraph provides cross-repo code search and navigation at scale. SCIP (Stack-based
Code Intelligence Protocol) is their precise code intelligence format (go-to-def,
find-refs). Use Sourcegraph when you need cross-repo symbol resolution that ctags can't
handle.

---

## Code-map tools for LLM context

### aider repomap
https://aider.chat/docs/repomap.html

Generates a compact, ranked "map" of a repo's symbols for LLM context injection.
Uses tree-sitter; ranks by importance (call frequency, cross-file references). Useful
standalone for producing summaries of large repos for agent priming.

### pydeps
https://github.com/thebjorn/pydeps

Python module dependency graph visualizer. Generates SVG/PNG dependency graphs.
Good for understanding import coupling in Python codebases.

### code2flow
https://github.com/scottrogowski/code2flow

Generates call-flow graphs for Python, JS, Ruby, PHP. Quick visual of which functions
call which; useful for onboarding and identifying coupling.

---

## AI-generated code wikis & repo documentation

LLM-generated, navigable documentation over a whole repository (architecture pages,
diagrams, chat). Distinct from structural graphs above: these optimize for human/agent
*reading* and Q&A, not necessarily blast-radius graphs. Prefer self-hosted options for
private/proprietary code; SaaS is fine for public or non-sensitive repos.

### Category survey — Ry Walker
https://rywalker.com/research/code-intelligence-tools

Comparative research on code-intelligence tools for AI agents (local graphs, semantic
search, context packing, MCP). Good starting map of the category before picking a wiki
or graph product.

### Google Code Wiki
https://codewiki.google/

Gemini-generated interactive wiki for repositories (featured public repos; private-repo
connect advertised as coming soon). Auto-updates with merges; section deep-dives,
diagrams, and codebase chat. Hosted Google product — check data-handling before private
code.

### DeepWiki (SaaS)
https://deepwiki.com/

Hosted AI wiki + chat over GitHub repos (Devin / Cognition indexing). Fast zero-config
onboarding for public or non-sensitive code. Code leaves your infra for processing —
usually a non-starter for regulated private repos.

### deepwiki-open (OSS)
https://github.com/AsyncFuncAI/deepwiki-open

Open-source DeepWiki-style generator for GitHub/GitLab/Bitbucket: structure analysis,
docs, diagrams, navigable wiki. Also shipped as Grok Wiki (https://grok-wiki.com/).
MIT. Prefer when you want DeepWiki UX without the closed SaaS.

### RepoWiki
https://github.com/he-yufeng/RepoWiki

Open-source DeepWiki alternative: generate wiki docs for a codebase from the terminal
or browser. PyPI: https://pypi.org/project/repowiki/ (MIT). Lightweight local option.

### CodeWiki (FSoft-AI4Code)
https://github.com/FSoft-AI4Code/CodeWiki

Open-source framework for holistic, architecture-aware repo documentation (ACL 2026 /
arXiv). Hierarchical decomposition + multi-agent generation; Mermaid diagrams; CLI
(`codewiki generate`); multi-language; optional MCP. Strong when you need research-grade,
structured docs you can regenerate in CI. Site: https://fsoft-ai4code.github.io/CodeWiki/

### repowise
https://github.com/repowise-dev/repowise

Self-hosted codebase intelligence (AGPL): LLM docs, git hotspots/ownership, dependency
graphs, dead-code signals, MCP tools for agents. Comparison vs DeepWiki SaaS:
https://www.repowise.dev/blog/comparisons/repowise-vs-deepwiki — use when privacy + agent
MCP matter more than zero-config SaaS.

---

## Selection guidance

| Need | Tool |
|---|---|
| Fast structural graph of any language codebase | tree-sitter + sift-kg |
| Offline Python structure + god nodes / communities | Graphify + NetworkX |
| Interactive codebase knowledge graph UI | Understand Anything |
| Compact repo map for LLM context | aider repomap |
| Cross-repo search at scale | Sourcegraph |
| Persistent queryable knowledge graph | Neo4j + GraphRAG |
| Explore GraphRAG output visually | GraphRAG Workbench |
| Quick Python import graph | pydeps |
| Classic symbol index (editors/agents) | universal-ctags |
| RAG over code + documentation | sift-kg + GraphRAG combination |
| Survey of agent code-intelligence tools | Ry Walker research |
| Hosted wiki for public/non-sensitive repos | DeepWiki or Google Code Wiki |
| Self-hosted DeepWiki-style wiki | deepwiki-open or RepoWiki |
| Architecture-aware generated docs + CLI/CI | CodeWiki (FSoft) |
| Self-hosted wiki + git intelligence + MCP | repowise |
