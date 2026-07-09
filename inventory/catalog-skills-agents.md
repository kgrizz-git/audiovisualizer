# Skills & Agents Catalog (Install-On-Demand)

Last reviewed: 2026-07-09

An index of agent skills and subagent definitions available to install when a project
needs them. Nothing here is vendored into this template — this is a menu, not a
pre-install list.

**How to use:** Find the skill or agent that fits the task, follow the source link,
copy the folder into `.claude/skills/<name>/` or `.claude/agents/<name>.md`, then verify
it loads correctly in your IDE.

---

## Notes_and_Ideas collection (kgrizz-git)

Source: `kgrizz-git/Notes_and_Ideas` → `agents_and_skills/`

A personal collection of subagents and skills developed for scientific, engineering,
writing, and product workflows. Maintained alongside Cursor's `.claude/` directory; use
`rsync -a agents_and_skills/agents/ .claude/agents/` to install (see the
`agents_and_skills/README.md` for full sync instructions).

> **Trust level:** Personal/internal. Review before adopting; skip anything project-specific
> or idea-placeholder.

### Subagents (`agents_and_skills/agents/`)

| Agent | Purpose | When to install |
|---|---|---|
| `orchestrator` | Hub agent; reads `plans/orchestration-state.md`, delegates, approves git/cloud proposals, manages iteration guards | Any project using hub-and-spoke multi-agent workflow |
| `planner` | Writes phased `[ ]` checklist plans with task graphs and gates under `plans/` only | When you want a dedicated planning agent separate from coder |
| `coder` | Implements plans; updates plan checkboxes; proposes git branch/cloud batch via HANDOFF | Core engineering agent for most projects |
| `debugger` | Isolates bugs; does not fix production code speculatively; returns root-cause analysis | When you want bug investigation separated from fixes |
| `reviewer` | Spec-vs-implementation review; lint check; merge recommendation; plan checklist sync | Code and design review gate |
| `tester` | Runs tests; maintains `logs/test-ledger.md`; **does not** edit tests to force passing | Test execution + failure triage without silent fixes |
| `secops` | Security scans; timestamped reports in `assessments/`; may request cloud for heavy scans | Security audit gate |
| `ux` | UX/UI assessment; Playwright + screenshots; accessibility patterns; structured HANDOFF | Any UI-bearing project |
| `docreviewer` | Writes `logs/docs_log-*.md`; does not touch product source | Documentation review gate |
| `docwriter` | Edits documentation files; suggests docreviewer after | Dedicated doc writing |
| `researcher` | Research tasks with structured notes and bibliography suggestions; `readonly` mode | Literature or technical research tasks |
| `math-physics-deriver` | Line-by-line math/physics derivations with explicit notation, assumptions, and equation provenance | Scientific computing, physics, signal processing |
| `math-physics-challenger` | Adversarially reviews derivations; challenges assumptions; returns accept/revision verdicts | Paired with deriver in quality-gate workflow |
| `simulation-setup-runner` | Sets up and runs FDTD, FEM, Monte Carlo, radiation transport, and medical-physics simulations | Simulation-heavy projects |
| `simulation-verifier-interpreter` | V&V, uncertainty analysis, and interpretation for simulation outputs | Paired with setup-runner in quality-gate workflow |

### Auto-chain rule

`notes_and_ideas/.claude/rules/orchestration-auto-chain.md` — the hub-and-spoke
routing rule. After each subagent response the orchestrator reads `NEXT_TASK_TOOL:` /
`NEXT_TASK_TOOL_SECOND:` lines and dispatches the next agent. Install per-IDE:

| IDE | What to do |
|---|---|
| Cursor | Copy to `.cursor/rules/orchestration-auto-chain.mdc` (frontmatter: `alwaysApply: true`) |
| Claude Code | Append the minimal block to `CLAUDE.md` |
| VS Code Copilot | Append minimal block to `.github/copilot-instructions.md` |

### Skills (`agents_and_skills/skills/`)

#### Engineering workflow

| Skill | What it provides |
|---|---|
| `team-orchestration-delegation` | HANDOFF schema, git propose/approve, cloud packets, iteration guards, roster, parallelism, semver/changelog |
| `plans-folder-authoring` | Plan templates, task graph, gates, checklist conventions |
| `coder-implementation-standards` | Implementation quality rules, git/cloud proposals, plan checkbox protocol |
| `reviewer-spec-alignment` | Review checklist, merge recommendation, plan sync steps |
| `security-scanning-secops` | Semgrep, grype, secrets scan, workflow review, assessment file format |
| `test-ledger-runner` | Tester ledger under `logs/test-ledger.md`; no-edit-on-failure policy; cloud requests |
| `documentation-review-write-handoff` | Docreviewer vs docwriter vs coder routing |
| `ux-evaluation-web` | Playwright-first UX evaluation with structured output |
| `skill-creator` | Protocol for authoring new skill folders that follow Cursor's `SKILL.md` layout |
| `get-available-resources` | Queries the agent's available tools and context before starting complex tasks |

#### Scientific & simulation

| Skill | What it provides |
|---|---|
| `derivation-rigor-protocol` | Symbol definitions, assumptions, canonical starting equations, explicit intermediate steps |
| `derivation-challenge-review` | Skeptical review protocol; step validation; severity classification; adjudication gates |
| `simulation-software-setup-run` | Simulation tool selection, model/discretization controls, staged runs, reproducibility metadata |
| `simulation-validation-and-interpretation` | Convergence evidence, uncertainty decomposition, benchmark checks, decision-grade interpretation |
| `radiation-transport-simulation` | Monte Carlo + deterministic radiation transport workflows (EM/particle); setup, validation, UQ |
| `hep-montecarlo-workflows` | HEP event generation (Pythia, MadGraph); diagram-guided validation; reproducibility |
| `exploratory-data-analysis` | Data profiling, visualizations, summary stats; handles DICOM pixel arrays and scientific formats |
| `statistical-analysis` | Statistical test selection, power analysis, effect sizes, result interpretation |
| `scientific-visualization` | Plot generation standards for publications; matplotlib/seaborn/plotly; reproducibility |
| `scientific-writing` | Academic prose standards; section structure; uncertainty language; citation placeholder protocol |
| `scientific-slides` | Research slide deck structure; figure/narrative flow; audience calibration |
| `scientific-brainstorming` | Structured hypothesis generation; evidence ranking; assumption surfacing |
| `scientific-critical-thinking` | Adversarial evaluation of scientific claims and methods |
| `literature-review` | Structured literature search, evidence table, gap analysis |
| `paper-lookup` | Retrieves paper metadata, abstracts, citation info from semantic databases |
| `scholar-evaluation` | Evaluates source credibility, citation context, and field impact |
| `citation-management` | BibTeX/Zotero-compatible reference tracking and formatting |

#### Domain libraries

| Skill | What it provides |
|---|---|
| `pydicom` | DICOM read/write/anonymize; pixel extraction; transfer syntax handling; RT objects |
| `imaging-data-commons` | NCI IDC dataset query (BigQuery) and download workflow |
| `histolab` | Whole-slide image (WSI) analysis and tissue detection for pathology |
| `pathml` | Pathology ML preprocessing pipeline |
| `scanpy` | Single-cell RNA-seq analysis (Scanpy/AnnData ecosystem) |
| `scvelo` | RNA velocity analysis with scVelo |
| `neurokit2` | Physiological signal processing (ECG, EEG, EMG, EDA) |
| `neuropixels-analysis` | Neuropixels electrophysiology data processing |
| `optimize-for-gpu` | GPU acceleration for numpy/scipy/FDTD/PyTorch workflows |
| `pytorch-lightning` | PyTorch Lightning training loop setup, callbacks, logging |
| `scikit-learn` | Scikit-learn pipeline construction and evaluation |

#### Research & writing tools

| Skill | What it provides |
|---|---|
| `research-lookup` | Multi-source academic research query workflow (Semantic Scholar, arXiv, PubMed) |
| `markdown-mermaid-writing` | Markdown + Mermaid diagram authoring standards |
| `latex-posters` | LaTeX poster authoring for academic conferences |
| `pptx-posters` | PowerPoint/PPTX poster generation workflow |
| `pptx` | General PPTX deck creation and editing |
| `pdf` | PDF extraction, manipulation, and annotation |
| `xlsx` | Excel/XLSX read/write with openpyxl |
| `docx` | Word/DOCX document creation and editing |
| `venue-templates` | Academic venue-specific formatting templates |

#### Dev & product

| Skill | What it provides |
|---|---|
| `python-venv-dependencies` | Venv detection, `python -m` usage, dependency pinning hygiene |
| `frontend-design` | Frontend component implementation standards with accessibility |
| `canvas-design` | Canvas-based UI design guidance (Figma/Stitch/tldraw workflows) |
| `webapp-testing` | Web app test strategy with Playwright |
| `modal` | Modal (serverless GPU) function deployment and batch job patterns |
| `mcp-builder` | MCP server creation protocol for Claude/Cursor tool extensions |
| `theme-factory` | Design token and theming system setup |

---

## K-Dense-AI / claude-scientific-skills

Source: https://github.com/K-Dense-AI/claude-scientific-skills

A large library of `SKILL.md`-style packages covering scientific research, data analysis,
domain engineering, and academic writing — organized as Cursor-compatible skill folders.

> **Trust level:** Publicly maintained; MIT license. Review before vendoring; some skills
> may target specific toolchain versions.

**Installation options:**
- Vendor a subset: copy selected skill folders into `agents_and_skills/skills/<name>/`
- Submodule: `git submodule add https://github.com/K-Dense-AI/claude-scientific-skills`
  then symlink or copy chosen skills into `.claude/skills/`
- Sparse checkout: pull only the skill folders you need

Match Cursor's layout: each skill must be a directory with `SKILL.md` (YAML frontmatter
`name` + `description` required). Normalize if upstream uses a different structure.

Notable categories in the repo (browse the README for the full list):
- Scientific computing (numpy, scipy, pandas, xarray, JAX)
- Bioinformatics (BLAST, Biopython, AlphaFold, PyMOL)
- Chemistry (RDKit, OpenBabel, ASE, VASP)
- Physics simulation (LAMMPS, GROMACS, Quantum ESPRESSO)
- Data analysis and ML (sklearn, PyTorch, Hugging Face)
- Academic writing and LaTeX

---

## Obra Superpowers

Sources:
- https://github.com/obra/superpowers — main framework + core skills methodology
- https://github.com/obra/superpowers-skills — community-editable skills companion
- https://github.com/obra/superpowers-marketplace — plugin marketplace install path

Composable `SKILL.md` workflows for planning, TDD, debugging, subagent-driven development,
and two-stage code review. Install per host (Claude Code, Cursor, Codex, OpenCode, etc.);
evaluate skills individually before adopting into automated workflows.

> **Trust level:** Public; MIT; actively maintained. Prefer the core repo for methodology;
> pull community skills selectively from `superpowers-skills`.

---

## gstack (Garry Tan framework)

Source: https://github.com/garry-tan/gstack (verify current location)

Reusable agent workflow and tooling patterns. Covers project scaffolding conventions,
multi-agent coordination patterns, and prompt engineering principles suited to product
engineering workflows.

> **Trust level:** Public; verify before adopting conventions into shared repos.

---

## Official Anthropic / Claude Code

Source: https://docs.anthropic.com/en/docs/claude-code — official documentation only.

### Built-in slash commands (no install needed)
Claude Code ships with built-in commands accessible via `/help`. Key built-ins relevant
to repo harness work:

| Command | What it does |
|---|---|
| `/init` | Creates a CLAUDE.md from the current repo |
| `/clear` | Clears conversation context |
| `/compact` | Summarizes conversation to free context |
| `/memory` | Shows/edits project memory |
| `/cost` | Shows token usage |
| `/mcp` | Lists active MCP server connections |

### Official skill/agent patterns
Anthropic documents several agent skill patterns in the Claude Code docs:
- Hook-based automation (pre-tool, post-tool, notification, stop hooks)
- MCP server integration for custom tools
- Subagent spawning via the Agent tool (Explore, code-reviewer agent types)
- Session-persistent memory via CLAUDE.md and `.claude/` directory

No separately installable official "skill package" exists from Anthropic as of the
knowledge cutoff — all official guidance lives in the docs.

---

## Official OpenAI / Codex

Source: https://platform.openai.com/docs/codex — official documentation only.

### Codex subagent patterns
OpenAI's Codex (in agentic/API mode) supports:
- Tool-calling with function definitions
- Structured output for plan/code/review steps
- Subagent composition via multi-agent orchestration (see Symphony)

### Symphony (OpenAI)
Source: https://github.com/openai/symphony

OpenAI's orchestration framework for multi-agent workflows. Provides:
- Task graph execution
- Agent registration and routing
- Parallelism controls
- Observability hooks

Install via pip: `pip install symphony-ai` (verify on PyPI).

> **Trust level:** Official OpenAI repository; actively maintained.

---

## agentskills.io

Source: https://agentskills.io

Community registry of agent skills for various AI coding tools. Skills listed here
are community-contributed and vary in quality and maintenance status.

> **Trust level:** Community submissions; verify each skill's source, author, and
> last update before installing. Prefer skills with clear provenance and tests.

Browse the registry, inspect the `SKILL.md` of any candidate, then copy to
`.claude/skills/<name>/` if it meets project standards.

---

## skills.sh

Source: https://skills.sh

Another community catalog of agent skills and prompt packs, targeting Claude Code,
Cursor, and related tools.

> **Trust level:** Community-maintained. Same due diligence as agentskills.io.

---

## Cursor built-in agents

These are provided by Cursor and require no installation:

| Agent | What it does |
|---|---|
| Explore | Read-only search agent for code exploration |
| Bash | Runs shell commands in a subprocess |
| Browser | Web browsing with Playwright (Cursor Pro) |

Custom agents you define go in `.cursor/agents/` or `.claude/agents/` (Cursor reads both).

---

## VS Code / GitHub Copilot

Source: https://code.visualstudio.com/docs/copilot/overview

Copilot agents and instructions live in `.github/copilot-instructions.md` and
`.github/instructions/*.instructions.md`. No separate skill-package ecosystem exists;
project-level instructions are the primary customization mechanism.

---

## Selection checklist

Before installing any skill or agent:

- [ ] Source is from an official/verified provider or you've reviewed the code
- [ ] License permits use in your project type
- [ ] The skill is focused enough that agents can find and apply it reliably
- [ ] `SKILL.md` has valid YAML frontmatter (`name`, `description`)
- [ ] Description uses third-person language with concrete trigger phrases
- [ ] No hardcoded personal paths, credentials, or project-specific assumptions
- [ ] You've tested it in isolation before adding to automated chains
