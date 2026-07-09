# Hooks

Last reviewed: 2026-07-09

Pre-commit hooks and policy-check scripts. The `.pre-commit-config.yaml` in this
directory is an **example** — copy it to your project root to activate it.

## Quick start

```bash
pip install pre-commit
cp hooks/.pre-commit-config.yaml .pre-commit-config.yaml  # if not already at root
pre-commit install          # wire into git
pre-commit run --all-files  # first-run check
```

## Files

| File | Purpose |
|---|---|
| `.pre-commit-config.yaml` | Example config: policy checks + secrets + lint |
| `scripts/check_file_size.py` | Enforces [`policies/file-size-and-counts.md`](../policies/file-size-and-counts.md) (soft **600** / hard **1000** lines) |
| `scripts/check_doc_freshness.py` | Enforces [`policies/doc-freshness.md`](../policies/doc-freshness.md) |
| `scripts/check_todo_limits.py` | Enforces living backlog size ([`policies/plans-and-todos.md`](../policies/plans-and-todos.md); soft **150** / hard **300**) |
| `scripts/prune_backups.sh` | Optional: delete `backups/` dirs older than last N commits |

## Built-in secret detection and linting

The example config already includes (leave them on unless the project cannot use them):

| Hook | Role |
|---|---|
| **gitleaks** | Secret scanning (hard gate) |
| **detect-private-key** | Private key detect (pre-commit-hooks) |
| **ruff** + **ruff-format** | Python lint/format |
| **markdownlint** | Docs lint |
| **shellcheck** | Shell lint |
| Semgrep / Checkov | Commented optional SAST / IaC blocks |

See [`policies/security-baseline.md`](../policies/security-baseline.md) and
[`inventory/security-quality.md`](../inventory/security-quality.md).

## When to use pre-commit vs CI vs agent-side checks

| Check type | Best tier | Reasoning |
|---|---|---|
| Lint, format, file size, TODO size, secret scanning | **pre-commit** (local) | Fast, catches cheaply before push |
| SAST (Semgrep/CodeQL), dep audit, OWASP scan | **CI** | Slower; needs full context or network |
| Doc freshness, TODO comment audit, policy drift | **CI** or **agent** | Doesn't need to run on every commit |
| Security / architecture / refactor review | **agent prompt** / Codex Security plugin | Judgment-based; humans approve |
| Dependency updates | **Dependabot/Renovate** | Automated PR; not a hook |

Rule of thumb: anything that takes more than ~5 seconds or needs the internet belongs in CI,
not pre-commit.

## Tiers

- **Hard gate** — exits non-zero, blocks commit or CI.
- **Soft gate** — warns but does not block locally; may block in CI via `POLICY_WARN_AS_ERROR=1`.
- **Advisory** — output only, never blocks.

To promote a soft gate to a hard gate in CI, set the relevant env var
(e.g. `POLICY_WARN_AS_ERROR=1`) in the CI workflow.

## Configuring thresholds without editing scripts

The policy scripts read thresholds from environment variables:

```bash
# check_file_size.py
POLICY_SOFT_LINE_CAP=600        # warn above this (source files)
POLICY_HARD_LINE_CAP=1000       # block above this
POLICY_MAX_BYTES=512000         # non-source file size limit (500 KB)
POLICY_BINARY_HARD_BYTES=5242880 # binary hard limit (5 MB)
POLICY_DOC_SOFT_LINE_CAP=1000  # markdown soft cap
POLICY_WARN_AS_ERROR=0          # set to 1 to treat soft warnings as errors

# check_todo_limits.py
POLICY_TODO_SOFT_LINE_CAP=150
POLICY_TODO_HARD_LINE_CAP=300

# check_doc_freshness.py
POLICY_FRESHNESS_WARN_DAYS=180  # warn after this many days
POLICY_FRESHNESS_HARD_DAYS=365  # block after this many days

# prune_backups.sh
POLICY_BACKUP_KEEP_COMMITS=5
```

Set these in CI environment config or a project-level `.env.ci` (not committed).

## Adding a new policy check

1. Write the script in `hooks/scripts/` using the same exit-code convention (0=pass, 1=error).
2. Write the policy it enforces in `policies/`.
3. Add an entry in `.pre-commit-config.yaml` under the `local` repo block.
4. Document the threshold env vars here.

## Optional: prune local `backups/`

If agents copy files into a gitignored `backups/` folder before edits, enable the
commented `prune-backups` hook in `.pre-commit-config.yaml`, or run:

```bash
bash hooks/scripts/prune_backups.sh
```

It removes `backups/*` directories whose mtime is older than the author date of
`HEAD~N` (default N=5 via `POLICY_BACKUP_KEEP_COMMITS`).
