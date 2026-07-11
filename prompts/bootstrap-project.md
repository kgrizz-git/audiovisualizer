# Bootstrap A New Project From This Template

You are an AI coding agent working inside a newly cloned project seed repository. Your job is to turn this minimal template into a well-structured starting point for the specific project the user wants to build.

Do not assume the project type. Start by interviewing the user, then propose a plan before creating a large scaffold.

## 1. Start With Discovery

Ask concise questions before choosing a stack or writing many files:

- What will this repo be for?
- Who will use it?
- What are the expected platforms, runtimes, languages, deployment targets, and integrations?
- Is this a library, app, website, CLI, service, research project, automation workflow, data project, design prototype, or something else?
- What matters most: speed, correctness, user experience, security, scientific rigor, maintainability, cost, portability, or learning?
- Are there existing repos, docs, style guides, prompts, agent skills, product specs, designs, or examples you should inspect?
- Should you use subagents or parallel workers for research, planning, review, or implementation?

Summarize the answers back to the user. List assumptions and open questions.

## 1.5. Capture The Project Profile

Run `prompts/project-init-profile.md` now. It asks follow-up questions (project type,
orchestration tier, domain, constraints) and writes `.context/project-profile.md`.

That file is the single fast-load summary every future agent session reads. Without it,
returning agents rediscover the project type from scratch on every session.

Use the profile's **Relevant inventory** section to decide which inventory files to read
in step 3 — do not load all 18 files by default.

## 2. Protect The Template Remote

Before the first project commit or push:

1. Inspect `git remote -v`.
2. Explain which remote points to this template, if any.
3. Tell the user this cloned project should push to a new remote, not back to the template repo.
4. Help the user create or identify a new remote repository for the actual project.
5. Update the remote, for example:

```sh
git remote set-url origin <new-project-remote-url>
```

Or, if preserving the template remote is useful:

```sh
git remote rename origin template
git remote add origin <new-project-remote-url>
```

6. Verify again with `git remote -v`.
7. Only push after the user confirms the new remote is correct.

## 3. Read The Template Inventories

Read [inventory/README.md](../inventory/README.md), then open **only** the topic files
listed in the project profile's "Relevant inventory" section. Choose tools and skills
deliberately. Do not load everything.

For each relevant area, produce a short adoption list:

- **Install/configure now** — tools, hooks, skills, services, or libraries needed for
  the first useful scaffold.
- **Evaluate later** — promising options that depend on future scale, data, users,
  deployment targets, or workflow maturity.
- **Skip for now** — options that are interesting but not justified by this project.

Record the choices and rationale in the scaffold plan or `.context/project-profile.md`
so future agents know why tools were or were not adopted.

Ask the user if there are other repos or sources to inspect for useful skills, prompts,
conventions, build systems, or design patterns — record them in
[inventory/source-repos-to-review.md](../inventory/source-repos-to-review.md).

**Code map:** if the project has more than ~50 source files, or the project type is
`research`, `rag-knowledge`, or `agentic`, set up a code map early — before writing
significant new code. Options: `aider --show-repo-map` (zero setup), sift-kg (deeper
graph), tree-sitter index. See [inventory/knowledge-graph-code-mapping.md](../inventory/knowledge-graph-code-mapping.md).
Record the chosen tool in the project profile under "Knowledge index."

## 4. Apply Agent-First Engineering Principles

Read `inventory/harness-engineering.md` for the full reference list. The actionable
principles for this project:

- Keep repository knowledge legible to agents — good AGENTS.md, indexed docs, code map.
- Small entrypoint → deep docs. Do not make AGENTS.md a monolith.
- Make local run/test/validate cycles fast and agent-accessible. Agents use feedback loops.
- Encode project taste as checks (lint, tests, policy scripts), not only prose.
- Use short-lived plans and versioned ADRs for decisions future agents must see.
- Use subagents for bounded parallel work, then merge into one coherent plan.
- Prefer reversible actions; design checkpoints before irreversible ones.

**Orchestration:** the project profile captures the orchestration tier. Match the choice
to actual complexity — see the decision table in `inventory/harness-engineering.md`.
Do not default to Symphony for an IDE-based workflow; hub-and-spoke costs far less.
Symphony is right for production multi-agent APIs that need structured routing and
observability at scale.

## 5. Make A Scaffold Plan Before Writing The Scaffold

Produce a plan that includes:

- Project purpose and target users.
- Recommended stack and alternatives considered.
- Tool/skill adoption list: install now, evaluate later, skip for now.
- Proposed file tree.
- Development environment setup.
- Local run commands.
- Testing strategy.
- Formatting, linting, type checking, and security checks.
- Documentation structure.
- CI and dependency update strategy.
- Release and versioning approach using SemVer when appropriate.
- Maintenance loop for improving prompts, skills, tools, inventories, docs, and architecture over time.

Ask for approval before making broad changes.

## 6. Environment Guidance

**For every project, recommend `direnv`** — it auto-loads `.envrc` on directory entry,
keeping secrets, env vars, and PATH changes project-scoped instead of global. One-time
setup (`brew install direnv` + shell hook), then `direnv allow` per project. Commit a
`.envrc.example`; gitignore `.envrc` if it holds secrets.

If the project uses Python, also recommend:

- `pyenv` for Python version management.
- A local virtual environment (use `layout python3` or `layout uv` in `.envrc` to
  auto-activate on directory entry — no manual `source` needed).
- A recorded Python version such as `.python-version`.
- A dependency manager appropriate to the project.
- Formatting, linting, type checking, tests, and security audit tools.

For every ecosystem, prefer boring, well-supported tools unless the project requirements justify something newer or more specialized.

## 7. Implementation Rules

- Keep the first scaffold minimal but complete enough to run, test, and extend.
- Add only files that support the chosen project.
- Avoid copying every inventory item into the project.
- Document why major choices were made.
- Use SemVer for the project once releases matter.
- Add future improvement hooks: TODOs, docs indexes, ADRs, or prompt templates only where they will actually help.
- Validate the scaffold with real commands before declaring it done.

## 8. Final Handoff

When the initial scaffold is complete, report:

- What was created.
- How to run and test it.
- What remote is configured.
- What checks passed.
- What decisions are still open.
- The next 3 practical steps.

Tell the user:
- Future agent sessions should start with `prompts/new-agent-session.md`.
- Periodic repo health checks use `prompts/maintenance-loop.md` (weekly or monthly).
- The project profile lives at `.context/project-profile.md`; update it when the stack
  or orchestration tier changes significantly.
