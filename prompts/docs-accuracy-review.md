# Docs Accuracy Review Prompt

Review the documentation against the actual codebase. Prefer verified facts over guesses.

## Process

1. Inventory docs and code areas they describe.
2. Check commands, paths, APIs, configuration, environment variables, screenshots, and examples.
3. Identify missing docs for important workflows.
4. Identify stale, misleading, incomplete, or unverifiable docs.

## Output

Write a markdown report with:

- Docs reviewed.
- Confirmed accurate sections.
- Inaccuracies with file and line references.
- Missing or incomplete docs.
- Suggested patches.
- Questions for the user where behavior cannot be verified locally.
