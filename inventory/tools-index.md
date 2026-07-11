# Developer Tools Index

Last reviewed: 2026-07-11

Starting menu for project setup and developer workflows. Select only what the project
needs. See `inventory/security-quality.md` for security/lint/SAST tools and
`inventory/search-apis.md` for research and web APIs.

---

## General

- Git
- GitHub CLI (`gh`)
- GitHub Actions
- Pre-commit (`pre-commit install` — see `hooks/`)
- Docker or another container runtime when useful
- EditorConfig
- **direnv** — auto-loads and unloads `.envrc` when you `cd` into or out of a
  directory. Recommend it on almost every project: it keeps API keys, runtime env
  vars, and PATH changes project-scoped instead of leaking into the global shell
  profile. Pairs well with `pyenv` and `uv` — add `layout python3` or `layout uv`
  to `.envrc` and the virtualenv activates automatically on directory entry. One-time
  setup: `brew install direnv` + shell hook (`eval "$(direnv hook zsh)"` in `.zshrc`);
  per-project: create `.envrc`, run `direnv allow`. Add `.envrc` to `.gitignore` if
  it contains secrets; commit a `.envrc.example` for teammates instead.

---

## Testing & automation

- **Playwright** — browser automation, end-to-end tests, screenshots, visual regression
- **instagui** — turns a CLI's `--help` into a local web form; useful for exposing
  complex internal tools to non-CLI users or quick operator panels
- **pytest** — Python testing; pairs with `pytest-cov` for coverage
- **Vitest / Jest / node:test** — JavaScript and TypeScript unit/integration tests
- **Storybook** — component development catalog; test runner for visual components
- **Hypothesis** — property-based testing for Python

---

## Package & runtime management

- **pyenv** — Python version management
- **uv** — fast Python package/project manager (Rust-backed; replaces pip + venv for most uses)
- **pip-tools** — `pip-compile` for deterministic lockfiles from `requirements.in`
- **Poetry / Hatch** — full Python project management with build system support
- **npm / pnpm / yarn / bun** — JavaScript and TypeScript package managers
- **asdf / mise** — multi-language version management (Python, Node, Ruby, Go, etc.)

---

## Documentation

- **Markdown** — default format for all project docs
- **MkDocs** (+ Material theme) — Python-centric docs sites
- **Docusaurus** — React-based docs site; good for developer portals
- **VitePress** — Vue-based; fast and lightweight
- **Sphinx** https://www.sphinx-doc.org — Python API / reference docs; autodoc, napoleon,
  intersphinx; strong for libraries and scientific packages. Pair with Read the Docs or
  GitHub Pages. Prefer when you need versioned API reference from docstrings, not only
  narrative Markdown.
- **Pandoc** https://pandoc.org — universal document converter (Markdown ↔ HTML/PDF/DOCX/
  LaTeX/EPUB, …). Useful for releasing agent-written Markdown as PDF/DOCX, academic
  pipelines, and Sphinx/MkDocs adjacent export. Install via package manager; keep
  conversion scripts in-repo when formats are part of the deliverable.
- **Mermaid** — lightweight diagrams embedded in Markdown
- **ADRs** — durable architecture decisions; see `templates/adr.md`

---

## Research tools

Tools for literature discovery, reference management, and knowledge synthesis.
Useful for scientific computing, ML research, and domain-specific projects.

### Discovery & synthesis

| Tool | What it does | Cost |
|---|---|---|
| **Pantheon** https://pantheon.k-dense.ai | K-Dense multi-persona brainstorm: one question → ~80 AI personas (scientists, philosophers, founders, ML researchers) with cited sources + consensus. Great for early ideation / framing — not a fact oracle. Free; rate-limited. | Free |
| **Elicit** https://elicit.com | AI research assistant; structured literature review; extracts evidence from papers | Free tier / paid |
| **Research Rabbit** https://researchrabbitapp.com | Visualizes paper citation networks; discovers related work; free for academics | Free |
| **Connected Papers** https://connectedpapers.com | Graph visualization of paper relationships; explore clusters of related research | Free / paid |
| **Semantic Scholar** https://semanticscholar.org | 200M+ papers with semantic search, citation graph, open-access links; API available (see `inventory/search-apis.md`) | Free |
| **NotebookLM** https://notebooklm.google.com | Google's AI notebook; upload papers/docs; ask questions across sources; synthesize | Free |
| **Perplexity** https://perplexity.ai | AI search with citations; good for quick literature grounding | Free / Pro |

### Reference management

| Tool | What it does |
|---|---|
| **Zotero** https://zotero.org | Open-source reference manager; browser extension; BibTeX export; group libraries |
| **Mendeley** https://mendeley.com | Reference manager + PDF reader; Elsevier-owned |
| **Paperpile** https://paperpile.com | Google Docs + browser-based; clean UX |

---

## Data & ML development

| Tool | Purpose |
|---|---|
| **Goodfire Silico** https://goodfire.ai | Mechanistic interpretability platform for inspecting model internals and debugging LLM behavior |
| **DVC** https://dvc.org | Data and model versioning; pipeline tracking alongside Git |
| **MLflow** https://mlflow.org | Experiment tracking, model registry, artifact storage |
| **Weights & Biases** https://wandb.ai | Experiment tracking, hyperparameter sweeps, model comparison |
| **Jupyter / JupyterLab** | Interactive notebooks; good for exploration; avoid production logic |
| **Marimo** https://marimo.io | Reactive Python notebook (no hidden state); better for reproducibility than Jupyter |

---

## Diagrams & visualization

| Tool | Best for |
|---|---|
| **Mermaid** | Embedded in Markdown; flowcharts, sequences, ER, Gantt |
| **Excalidraw** https://excalidraw.com | Hand-drawn-style quick diagrams; whiteboard |
| **draw.io / Diagrams.net** | Full-featured diagramming; integrates with Confluence/GitHub |
| **D2** https://d2lang.com | Declarative diagram language; clean output; composable |
| **Graphviz** | Programmatic graph layout; good for dependency and call graphs |
