# RAG Building Blocks

Last reviewed: 2026-07-09

Components for Retrieval-Augmented Generation pipelines: vector databases, frameworks,
embeddings, rerankers, and document parsers. Choose based on deployment model (local vs
cloud), scale, and language ecosystem.

---

## Vector databases

| Store | Best for | Self-hosted | Managed cloud |
|---|---|---|---|
| **pgvector** | Already on Postgres; simplest path | ✅ (Postgres) | ✅ (Supabase, Neon, RDS) |
| **Qdrant** | High performance, Rust core, filtering | ✅ Docker | ✅ Qdrant Cloud |
| **Chroma** | Local-first, Python-native, prototyping | ✅ | ❌ (local only) |
| **LanceDB** | Embedded, great for notebooks & agents | ✅ (embedded) | ✅ LanceDB Cloud |
| **Weaviate** | Semantic search + hybrid BM25+vector | ✅ Docker | ✅ WCS |
| **Milvus** | Large-scale production, Kubernetes | ✅ Docker/K8s | ✅ Zilliz |
| **Cloudflare Vectorize** | Serverless, edge, Workers AI stack | — | ✅ (CF Workers) |

Start with **pgvector** (no new infra) or **Chroma** (pure Python, zero config) for
prototypes. Graduate to Qdrant or LanceDB for production local deployments.

---

## RAG frameworks

### LlamaIndex
https://www.llamaindex.ai

Data connectors (100+ loaders), index types, query pipelines, and agent tooling.
Best for document Q&A, knowledge bases, and structured RAG workflows. Strong ecosystem.

### LangChain / LangGraph
https://python.langchain.com / https://github.com/langchain-ai/langgraph

Broad framework (chains, agents, tools, memory). LangGraph adds stateful graph-based
workflows. Use LangGraph for complex multi-step agentic RAG; LangChain chains for
simpler sequential pipelines. Pair with LangSmith for observability.

### Haystack
https://haystack.deepset.ai

Pipeline-based, production-focused. Strong on document processing, hybrid retrieval,
and evaluation. Good choice when you need structured pipelines you can test and version.

### MCP Adapters for LangChain
https://github.com/langchain-ai/langchain-mcp-adapters

Bridge between LangChain agents and MCP tool servers. Use when your agent needs to call
tools defined as MCP servers.

---

## Embeddings

| Model | Provider | Notes |
|---|---|---|
| `text-embedding-3-small` | OpenAI | Best cost/quality for English text; 1536 dim |
| `text-embedding-3-large` | OpenAI | Higher quality; 3072 dim |
| `voyage-3` / `voyage-3-lite` | Voyage (Anthropic-recommended) | Strong on code + technical text |
| `jina-embeddings-v3` | Jina | Free tier; multilingual; 8192 token context |
| `all-MiniLM-L6-v2` | sentence-transformers | Local, fast, lightweight; good baseline |
| `bge-m3` | BAAI / sentence-transformers | Multilingual, dense + sparse + colbert |
| `nomic-embed-text` | Nomic | Open weights; strong on long docs |

For **code-specific** embeddings: Voyage Code, or fine-tune on your codebase.

---

## Rerankers

Rerankers improve retrieval precision by scoring retrieved candidates against the query.
Apply after initial vector retrieval when recall is high but precision is low.

| Reranker | Provider | Notes |
|---|---|---|
| `rerank-english-v3.0` | Cohere | High quality; API-based |
| `jina-reranker-v2-base-multilingual` | Jina | Free tier; multilingual |
| `bge-reranker-v2-m3` | BAAI | Open weights; local; cross-lingual |
| `cross-encoder/ms-marco-MiniLM-L-6-v2` | sentence-transformers | Local; fast; strong on English |

---

## Document parsing & chunking

### Jina Reader
https://r.jina.ai

Free URL-to-clean-markdown API. `GET https://r.jina.ai/<url>` returns clean text.
No key needed. Essential for web-grounded RAG.

### unstructured
https://github.com/Unstructured-IO/unstructured

Parses PDF, DOCX, PPTX, HTML, images (OCR), email, and more into clean text chunks.
Broad format support; self-hosted or API. The go-to for messy document pipelines.

### docling (IBM)
https://github.com/DS4SD/docling

High-quality PDF and Office document parser; preserves layout, tables, and figures.
Better than unstructured for complex PDFs with tables and figures.

### LlamaParse
https://cloud.llamaindex.ai/parse

LlamaIndex's managed PDF parser. Handles complex layouts; integrates directly with
LlamaIndex pipelines.

### lift (Datalab)
https://github.com/datalab-to/lift

9B open-weights vision model: schema-constrained JSON extraction from PDFs/images.
Use when a project needs structured document fields (invoices, forms) rather than
plain text chunks for RAG. Apache-2.0; local (HF) or vLLM.

---

## Chunking strategies (brief)

| Strategy | When to use |
|---|---|
| Fixed-size with overlap | Baseline; works for most text |
| Sentence / paragraph | When semantic boundaries matter |
| Recursive character | LangChain default; good all-rounder |
| Document-structure-aware | Use unstructured/docling to split at headings, tables |
| Semantic chunking | Embed-and-cluster; expensive but high quality |
| Parent-child (small-to-big) | Retrieve small chunks, return parent for context |

---

## Evaluation

Before shipping RAG to users, evaluate retrieval and generation quality:

- **Ragas** — RAG-specific metrics (faithfulness, answer relevancy, context recall).
- **TruLens** — evaluation + tracing for LLM apps.
- **LangSmith** — trace + eval within the LangChain/LangGraph ecosystem.
