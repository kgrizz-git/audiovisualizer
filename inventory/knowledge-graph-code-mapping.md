# Knowledge Graph & Code Mapping Tools

Last reviewed: 2026-06-26

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

### GraphRAG (Microsoft)
https://github.com/microsoft/graphrag

General-purpose graph RAG framework. Builds community-structured knowledge graphs from
text corpora (including code docs/comments). Better for documentation and prose than
raw code structure; combine with a code-structure tool for full coverage.

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

## Selection guidance

| Need | Tool |
|---|---|
| Fast structural graph of any language codebase | tree-sitter + sift-kg |
| Compact repo map for LLM context | aider repomap |
| Cross-repo search at scale | Sourcegraph |
| Persistent queryable knowledge graph | Neo4j + GraphRAG |
| Quick Python import graph | pydeps |
| Classic symbol index (editors/agents) | universal-ctags |
| RAG over code + documentation | sift-kg + GraphRAG combination |
