# Skills And Prompt Sources

Last reviewed: 2026-07-11

Review these sources when choosing agent skills, prompts, rules, or workflows for a new project. Prefer official and actively maintained sources where possible, and ask the user before importing large conventions from another repo.

## Core Sources

- Obra Superpowers (`obra/superpowers` + optional `obra/superpowers-skills`): planning, debugging, TDD, review, and agentic workflow patterns.
- genius-code-review: https://claudskills.com/skills/genius-code-review/SKILL.md — install-on-demand code-review skill; evaluate before adopting.
- GStack: reusable agent workflow and tooling patterns where applicable.
- KDense scientific skills: scientific, data, research, and domain-specific workflows where applicable.
- Official OpenAI skills, Codex workflows, subagents, and prompt patterns.
- Official Claude / Anthropic skills, agents, commands, and prompt patterns.
- Cursor rules, memories, commands, and agent workflows.

## Selection Criteria

- Does the skill match the project domain?
- Is it short enough for agents to use reliably?
- Does it point to deeper docs instead of embedding everything?
- Does it include verification steps?
- Does it help the agent use local tools rather than guessing?
- Is it easy to update as the project changes?

## Import Guidance

Do not blindly copy external skill systems. When useful, create a small local adapter or project-specific instruction file that points to the relevant source and explains how it applies.
