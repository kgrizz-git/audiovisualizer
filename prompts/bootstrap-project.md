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

Read [inventory/README.md](../inventory/README.md) first, then inspect topic files that match the project. Choose tools and skills deliberately. Do not install or configure everything by default.

Ask the user if there are other repos or sources to inspect for useful skills, prompts, conventions, build systems, or design patterns.

## 4. Study Agent-First Engineering References

Read these references and make a short project-specific plan to implement the applicable lessons from them:

- OpenAI Harness Engineering: https://openai.com/index/harness-engineering/
- OpenAI Symphony: https://github.com/openai/symphony
- OpenAI Codex subagents: https://developers.openai.com/codex/subagents

Apply the ideas selectively. Do not cargo-cult the examples; translate the useful patterns into this project's scale and domain:

- Keep repository knowledge legible to agents.
- Prefer a small agent entrypoint that maps to deeper docs instead of a giant instruction blob.
- Make local development, tests, logs, UI state, and validation outputs accessible to the agent.
- Encode important architecture, security, and quality rules as checks where practical.
- Use short-lived plans and versioned docs for decisions that future agents must see.
- Use subagents for bounded, parallel work, then merge findings into one coherent plan.

## 5. Make A Scaffold Plan Before Writing The Scaffold

Produce a plan that includes:

- Project purpose and target users.
- Recommended stack and alternatives considered.
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

If the project uses Python, recommend:

- `pyenv` for Python version management.
- A local virtual environment.
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
