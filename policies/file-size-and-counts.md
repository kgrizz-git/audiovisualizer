# Policy: File Size & Counts ("file life counts")

Last reviewed: 2026-08-27
Enforced by: [`hooks/scripts/check_file_size.py`](../hooks/scripts/check_file_size.py)

## Why

Large files and overstuffed directories are where complexity hides and where agents lose
context. Caps keep modules legible, reviewable, and easy for an agent to load whole.

## Rules & defaults

Defaults are deliberately generous; tighten per project. Configure via environment
variables (see [`hooks/README.md`](../hooks/README.md)) or the script defaults.

| Rule | Default | Tier |
|---|---|---|
| Max lines per source file | **600** (soft warn), **800** (hard) | soft→hard gate |
| Max lines per function/method | 60 (soft), 100 (hard) | advisory → soft gate |
| Max cyclomatic complexity per function | 10 (soft), 15 (hard) | hard gate (ESLint error at 15) |
| Max bytes per committed file (non-binary) | 500 KB | hard gate |
| Max files per directory (excl. generated) | 40 | advisory |
| Disallow committing large binaries | > 5 MB | hard gate (use Git LFS / release assets) |
| Doc (`.md`) max lines | 1000 | advisory (split into linked docs) |
| Living `to_do` / `TODO.md` backlog | 150 (soft), 300 (hard) | see [`plans-and-todos.md`](plans-and-todos.md) |

### Exemptions

- Generated code, lockfiles, vendored deps, migrations, fixtures, and `notes_and_ideas/`
  style imports are exempt. Mark exempt paths in the checker's ignore list.
- A file may exceed a soft cap with a one-line justification comment:
  `# policy:file-size allow=600 reason=<why>`.
- **Agents must not add or raise an `allow=` exemption without explicit human
  approval.** Prefer splitting or shrinking the file. If the hard gate blocks a
  commit, stop and ask rather than self-authorizing an override (see
  [`AGENTS.md`](../AGENTS.md) working rule 7).

## Function size & complexity

Cyclomatic complexity is enforced as an ESLint **error** at the hard cap (15); function
length stays a warning (see `eslint.config.js`). Pre-existing offenders are grandfathered
with an inline `eslint-disable-next-line complexity -- grandfathered (<n>)` comment and
should be refactored when next touched. Python tooling below applies to hook scripts.

**Python — check with radon or ruff:**

```bash
# Cyclomatic complexity (A=1-5, B=6-10, C=11-15, D=16-20, E=21-25, F=26+)
pip install radon
radon cc . --min C --show-complexity   # flag C-and-above

# Function length: ruff rule C901 (complexity) + PLR0912/PLR0915 (branches/statements)
ruff check --select C901,PLR0912,PLR0915 .
```

We do **not** use lizard: this is a TypeScript-only codebase where ESLint already gates
complexity in lint/CI, and lizard would add a Python dependency to the JS toolchain for
no extra coverage.

**JavaScript / TypeScript — ESLint:**

```json
"complexity": ["error", 15],
"max-lines-per-function": ["warn", {"max": 80}]
```

**Rationale:** functions over 60 lines usually have more than one responsibility. High
cyclomatic complexity (>10) correlates with defect density and is hard to test. Treat
these as signals to extract helpers, not mandatory refactors on day one.

## Remediation when a check fails

1. Split by responsibility (one module → several focused modules).
2. Extract long functions; push helpers down.
3. Move large data/fixtures out of source (LFS, release assets, or `data/`).
4. For docs, split into topic files and link them from an index.
5. Only after human approval: add `# policy:file-size allow=<n> reason=<why>` near
   the top of the file (scanned within the first 12 lines).

## Rationale notes

These are taste defaults, not science. The **600-line soft warn** is a practical
legibility threshold for agent-loaded modules; the point is a *consistent, visible*
limit with an easy override, not the exact number. Older projects may keep soft=400
via `POLICY_SOFT_LINE_CAP=400`.
