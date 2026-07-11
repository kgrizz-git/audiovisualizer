# Python Project Inventory

Last reviewed: 2026-07-11

If the target project uses Python, recommend a local setup that is reproducible and easy for agents to inspect.

## Baseline Recommendations

- Use `pyenv` to install and pin a Python version.
- Add `.python-version`.
- Create a local virtual environment.
- Record setup commands in `README.md`.
- Choose one dependency workflow and document it.

## Common Tool Choices

- `uv` for fast dependency and virtual environment workflows.
- `pytest` for tests.
- `ruff` for linting and formatting.
- `basedpyright` or `pyright` for type checking.
- `pip-audit` for dependency vulnerability checks.
- `pre-commit` for local checks when useful.

## Questions To Ask

- Is this a library, app, CLI, service, notebook project, data pipeline, or research repo?
- Does it need packaging and publishing?
- Does it need notebooks?
- Does it need GPU, scientific, geospatial, or compiled dependencies?
- Which Python versions must be supported?
