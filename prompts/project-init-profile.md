# Project Profile: Initialize

Run this prompt once, early in the project lifecycle — as part of `prompts/bootstrap-project.md`
or whenever the project shape needs to be captured. The output is written to
`.context/project-profile.md` (gitignored scratch space).

Future agents read that file at the start of every session via `prompts/new-agent-session.md`
to orient without re-deriving the project type from the codebase.

---

## Step 1: Interview the user

Ask conversationally — do not dump all questions at once. Group them into 2-3 exchanges.

**Project type** — pick the primary type and note any secondary:

| Type | What it means |
|---|---|
| `software` | Application, API, CLI, library, or service |
| `research` | Scientific computing, experiments, analysis, publications |
| `rag-knowledge` | RAG pipeline, document Q&A, embeddings, knowledge base |
| `data-pipeline` | ETL, data processing, analytics, dashboards |
| `design` | UI prototype, design system, visual tooling |
| `agentic` | Multi-agent system, orchestration framework, AI workflow |
| `mixed` | Combination — note which types |

**Languages and frameworks** — e.g., Python/FastAPI, TypeScript/React, Rust/Axum

**Deployment target** — e.g., local-only, cloud API, serverless, CLI, mobile, edge

**Scale and team:**
- `solo` — single developer
- `small-team` — 2–5 people
- `large-team` — 6+ people or open-source with public contributors

**Agent orchestration tier** — guide the user to an answer using the table in step 2

**Domain** (optional) — e.g., medical-imaging, em-simulation, financial-modeling, web-app, nlp

**Key constraints** — e.g., air-gapped, HIPAA, GDPR, no-GPU, open-source-only, budget limit

**Data classification** — `public`, `internal`, `confidential`, `regulated`, or `TBD`; state
whether real PII/PHI, customer exports, screenshots, logs, or other production data are
prohibited, and record any approved exception/handling design. This selects the hygiene tier
in [`policies/github-repository-hygiene.md`](../policies/github-repository-hygiene.md).

---

## Step 2: Determine orchestration tier and relevant inventory

### Orchestration tier

| Situation | Tier | Reasoning |
|---|---|---|
| Single agent, simple task, IDE workflow | `none` | No framework overhead justified |
| 3–10 agents, file-based handoffs, IDE workflow | `hub-and-spoke` | Notes_and_Ideas pattern (lighter, no server) |
| Complex branching, cyclical plan→act→observe, local or API | `langgraph` | Stateful graph handles cycles well |
| Production multi-agent API with routing, reliability, observability | `symphony` | Symphony or LangGraph + LangSmith |
| Not yet clear | `uncertain` | Revisit after first scaffold |

Do not default to Symphony for IDE-based work. Hub-and-spoke (from `catalog-skills-agents.md`)
covers most local multi-agent workflows without the infrastructure cost.

### Relevant inventory sections

| Project type | Primary inventory files to load |
|---|---|
| software | tools-index, python (if Python), security-quality, github-apps |
| research | scientific-domain, financial-modeling (if quant), search-apis, rag, knowledge-graph-code-mapping |
| rag-knowledge | rag, search-apis, knowledge-graph-code-mapping, cloud-and-infra |
| data-pipeline | python, cloud-and-infra, scientific-domain (if scientific data) |
| design | frontend-design-ux, cloud-and-infra |
| agentic | ai-agent-platforms, harness-engineering, catalog-skills-agents, rag |
| medical domain or regulated data classification | medical-data-security, security-quality, github-apps (only after data-flow approval) |
| any | security-quality (always), github-apps (if using GitHub CI) |

---

## Step 3: Write `.context/project-profile.md`

Use this template. Fill every field; mark unknown fields `TBD`.

```markdown
# Project Profile

Generated: YYYY-MM-DD
Template version: (read from VERSION)

## Identity

Project name: 
Purpose: (one sentence)
Primary type: software | research | rag-knowledge | data-pipeline | design | agentic | mixed
Secondary type (if mixed): 
Domain: 

## Stack

Languages: 
Primary frameworks: 
Runtime: (Python 3.x / Node 22 / etc.)
Deployment target: local | cloud-api | serverless | edge | cli | mobile | other
Package manager: uv | pip | poetry | npm | pnpm | cargo | other

## Scale & team

Team size: solo | small-team | large-team
Key constraints: (or none)
Data classification: public | internal | confidential | regulated | TBD
Repository data rule: (e.g., synthetic fixtures only; real PII/PHI prohibited)

## Agent orchestration

Tier: none | hub-and-spoke | langgraph | symphony | uncertain
Rationale: (one sentence)
Subagents in use: (list or none)
Skills installed: (list or none)

## Relevant inventory

<!-- Only load these files in future sessions for this project -->
- inventory/security-quality.md — always
- inventory/<file>.md — <why>

## Knowledge index

Code map tool: aider-repomap | sift-kg | none | TBD
Set up: yes | no | TBD
Last indexed: (date or never)

## Architecture notes

- 
- 

## Open questions

- 
```

---

## Step 4: Confirm and continue

1. Show the completed profile to the user. Adjust based on feedback.
2. If the repo has more than ~50 source files, or if the project type is `research`,
   `rag-knowledge`, or `agentic`, set up a code map now — see
   `inventory/knowledge-graph-code-mapping.md` for options (aider repomap, sift-kg).
   Record the choice in the profile under "Knowledge index."
3. If this is a bootstrap session, continue with step 3 of
   `prompts/bootstrap-project.md`. The profile drives which inventory files to read.
4. If this is a mid-project profile update, verify the profile matches the actual
   codebase structure before saving.
