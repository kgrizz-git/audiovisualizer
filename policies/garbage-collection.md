# Policy: Garbage Collection

Last reviewed: 2026-06-26

## Why

Repos accumulate dead weight: orphaned files, unused imports, stale TODOs, commented-out
code, unused deps, and lingering branches. Left unchecked this raises agent confusion,
slows reviews, and creates latent security surface. Periodic GC keeps repos legible.

## What counts as garbage

| Category | Examples | Typical tool |
|---|---|---|
| Dead code | Unused functions, classes, variables | `vulture` (Python), `ts-prune` / `knip` (TS) |
| Unused imports | `import os` never referenced | `ruff` (`F401`), `autoflake` |
| Commented-out code | Blocks of `# old_fn(...)` | Code review / agent prompt |
| Stale TODOs | `TODO: fix before release` with no linked issue | `todo-plan-audit` prompt |
| Orphaned files | Files with no inbound references | `unimported` (JS), manual audit, agent |
| Unused dependencies | In `requirements.txt` / `package.json` but never imported | `deptry`, `depcheck` |
| Stale branches | Merged or abandoned branches ≥ 30 days old | `git branch --merged` + PR prune |
| Leaked temp files | `*.log`, `*.tmp`, `scratch.py` committed | `.gitignore` + audit |
| Outdated lock entries | Lockfile diverged from manifests | `pip-compile`, `npm ci` / `pnpm install` |
| Stale issue/PR refs | Code comments citing closed issues | Agent doc-accuracy review |

## Cadence

| Activity | Recommended frequency |
|---|---|
| Unused imports / ruff `F401` | Every commit (pre-commit hook) |
| Dead code scan (`vulture`) | Sprint or milestone |
| TODO audit | Sprint or milestone (use `prompts/todo-plan-audit.md`) |
| Stale branch prune | Monthly |
| Full dependency audit | Monthly or on dep changes |
| Orphaned file audit | Major version boundary |

## Tools

### Python

```bash
# Unused imports — already caught by ruff F401 in pre-commit
ruff check --select F401 .

# Dead code
pip install vulture
vulture . --min-confidence 80

# Unused dependencies
pip install deptry
deptry .

# Remove unused imports automatically
pip install autoflake
autoflake --remove-all-unused-imports --in-place --recursive .
```

### JavaScript / TypeScript

```bash
# Dead exports
npx ts-prune          # or: npx knip (broader: files, deps, exports)

# Unused dependencies
npx depcheck
```

### Git branches

```bash
# List merged branches (safe to delete)
git branch --merged main | grep -v '^\*\|main\|develop'

# Delete them
git branch --merged main | grep -v '^\*\|main\|develop' | xargs git branch -d

# Prune remote-tracking references
git remote prune origin
```

### TODOs and stale plans

Use the [`prompts/todo-plan-audit.md`](../prompts/todo-plan-audit.md) prompt. Ask an
agent to scan for `TODO`, `FIXME`, `HACK`, `XXX`, `later`, `follow up`, open plan
checklists, and unchecked tasks. Have it categorize: stale, quick win, blocked, or active.

## Integration

- Wire `ruff --select F401` and `vulture` in CI (not pre-commit — too slow for every commit).
- Run a full GC pass via agent before major version bumps.
- Add a GC reminder to the milestone/release template.
- After a GC pass, log what was removed so reviewers can verify nothing important was dropped.

## What NOT to collect

- Intentionally dead code preserved for future use should be extracted to a branch,
  not kept in main as commented-out blocks.
- Code that is "dead" in tests but live in production is not garbage.
- Entries in `inventory/` that are not currently installed are intentional — they are a
  menu, not a dependency list. Do not remove them.
