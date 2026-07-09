# Search & Web APIs

Last reviewed: 2026-07-09

Free and low-cost search APIs for agent-driven web research, RAG pipelines, and
grounded generation. Ordered roughly by ease of use for agents.

**Credentials:** never commit API keys. Store them in a secrets manager or local env
(`.env`, gitignored).

---

## Web-to-markdown (no API key)

### Jina Reader
https://r.jina.ai

`GET https://r.jina.ai/<url>` → clean markdown. No key, no setup. The fastest way
to give an agent readable web content. Rate-limited but generous for agent use.

### Jina Search
https://s.jina.ai

`GET https://s.jina.ai/<query>` → web search results as clean markdown. No key.
Pairs with Jina Reader for a fully keyless agent research loop.

---

## Search APIs (require API key, free tiers available)

### Tavily
https://tavily.com

Search API purpose-built for LLM agents. Returns clean, structured results optimized
for grounded generation. Free tier: 1,000 searches/month. Best default choice for
agent-driven research loops.

### Exa
https://exa.ai

Neural search over a curated web index. Excellent for technical, academic, and
developer-oriented queries. Supports semantic similarity search (not just keyword).
Free tier available.

### Brave Search API
https://brave.com/search/api/

Independent search index (not Google/Bing). Strong privacy stance; useful for
unbiased results. Free tier: 2,000 queries/month.

### Perplexity Sonar API
https://docs.perplexity.ai

Search-grounded LLM completions. Returns answers with citations. Good for
"research and summarize" tasks where you want both retrieval and synthesis.

### SerpAPI
https://serpapi.com

Google/Bing/DuckDuckGo SERP scraping via structured API. Real Google results; paid
plans; free trial. Use when you specifically need Google result fidelity.

### You.com API
https://you.com/api

Multimodal search API with web, code, and AI answer modes. Developer-friendly.

---

## Academic & scientific search

### Semantic Scholar API
https://api.semanticscholar.org

Free, no key required. Searches 200M+ papers. Returns structured metadata, abstracts,
citations, and open-access PDF links. Best free option for academic paper retrieval.

### PubMed / NCBI APIs
https://www.ncbi.nlm.nih.gov/home/develop/api/

Free. Biomedical literature (MEDLINE). Use for medical, clinical, and life-science
research agents.

### arXiv API
https://info.arxiv.org/help/api/

Free. Preprints across physics, math, CS, quantitative biology, economics. No key.

### OpenAlex API
https://docs.openalex.org

Free, open, no key required. 250M+ scholarly works with full citation graph, author
affiliations, and open-access links. Good alternative to Semantic Scholar.

---

## Crawl / scrape for agent context

### Firecrawl
https://www.firecrawl.dev

Hosted crawl/scrape API that returns clean markdown or structured data for RAG and
agent research. Prefer Jina Reader for one-off URL→markdown with no key; use Firecrawl
when you need site-wide crawl, JS rendering, or structured extraction at scale.

---

## Open data & web archives

### Wikipedia API
https://www.mediawiki.org/wiki/API:Main_page

Free, no key. Structured access to Wikipedia content. Use for factual grounding on
well-known topics; combine with a web search for current events.

### Common Crawl
https://commoncrawl.org

Petabyte-scale web archive on S3 (free egress from us-east-1). Use for large-scale
web data extraction; not suitable for real-time agent queries.

---

## Selection guidance

| Use case | Recommendation |
|---|---|
| Agent web research (general) | Tavily (easiest) or Jina Search (keyless) |
| Technical / developer queries | Exa |
| Academic paper lookup | Semantic Scholar API (free, no key) |
| Medical / life science | PubMed API |
| Preprints (CS, ML, physics) | arXiv API |
| URL → clean text for RAG | Jina Reader (no key) |
| Site crawl / JS-heavy pages | Firecrawl |
| Google-fidelity results | SerpAPI (paid) |
| Independent index / privacy | Brave Search API |
