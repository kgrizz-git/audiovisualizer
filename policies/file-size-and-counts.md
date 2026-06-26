# Policy: File Size & Counts ("file life counts")

Last reviewed: 2026-06-26
Enforced by: [`hooks/scripts/check_file_size.py`](../hooks/scripts/check_file_size.py)

## Why

Large files and overstuffed directories are where complexity hides and where agents lose
context. Caps keep modules legible, reviewable, and easy for an agent to load whole.

## Rules & defaults

Defaults are deliberately generous; tighten per project. Configure in one place
(`hooks/scripts/check_file_size.py` constants, or a `[tool.repo-policy]` block if adopted).

| Rule | Default | Tier |
|---|---|---|
| Max lines per source file | 400 (soft), 800 (hard) | soft→hard gate |
| Max lines per function/method | 80 | advisory |
| Max bytes per committed file (non-binary) | 500 KB | hard gate |
| Max files per directory (excl. generated) | 40 | advisory |
| Disallow committing large binaries | > 5 MB | hard gate (use Git LFS / release assets) |
| Doc (`.md`) max lines | 1000 | advisory (split into linked docs) |

### Exemptions

- Generated code, lockfiles, vendored deps, migrations, fixtures, and `notes_and_ideas/`
  style imports are exempt. Mark exempt paths in the checker's ignore list.
- A file may exceed a soft cap with a one-line justification comment:
  `# policy:file-size allow=600 reason=<why>`.

## Remediation when a check fails

1. Split by responsibility (one module → several focused modules).
2. Extract long functions; push helpers down.
3. Move large data/fixtures out of source (LFS, release assets, or `data/`).
4. For docs, split into topic files and link them from an index.

## Rationale notes

These are taste defaults, not science. The 400-line soft cap is a common legibility
threshold; the point is a *consistent, visible* limit with an easy override, not the exact number.
