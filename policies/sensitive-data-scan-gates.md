# Policy: Sensitive-Data Scan Gates (protected ignores, forbidden paths, scan contracts)

Last reviewed: 2026-07-16
Enforced by: [`hooks/`](../hooks/) local gates + push ruleset + required CI.

## Why

The strict guard ([`check_sensitive_data.py`](../hooks/scripts/check_sensitive_data.py)) inspects
file *content* on every commit. This policy adds three cheaper structural gates that protect the
controls themselves and force heavy scanners to actually run. Adopt them when the project's data
classification is `regulated` (or `confidential` with real customer data). They complement, and do
not replace, [`github-repository-hygiene.md`](github-repository-hygiene.md),
[`sensitive-data-runtime-leaks.md`](sensitive-data-runtime-leaks.md), and
[`prompts/strict-phi-agent-guidance.md`](../prompts/strict-phi-agent-guidance.md).

## The three gates

| Gate | Script | Config (repo root) | What it blocks |
|---|---|---|---|
| Protected ignores | `check_gitignore_protected.py` | `.gitignore-protected` | Removal of a required `.gitignore` rule (a data/export/log dir getting silently un-ignored). |
| Forbidden paths | `check_forbidden_paths.py` | `.forbidden-paths` | Any tracked file under a directory/glob that must never be committed (catches `git add -f` and files added before a `.gitignore` rule existed). |
| Scan contract | `check_scan_contract.py` | `.scan-contract.json` + `.scan-ledger.json` | A commit where a required heavy scanner has not been re-run since the files it covers changed. |

All three fail closed: a present-but-unreadable config blocks. If a config file is absent, that
gate is simply inactive, so they are safe to leave wired in `.pre-commit-config.yaml` for any repo.

### 1. Protected ignores

`.gitignore-protected` lists patterns (one per line) that MUST remain in `.gitignore`. The hook
does a whole-line match, so a protected `data/` is not satisfied by `mydata/`. This turns "keep
these dirs ignored" from a soft convention into a gate: the single most dangerous one-line change
on a PHI repo is deleting the ignore rule that was keeping a data directory out of history.

### 2. Forbidden paths

`.forbidden-paths` lists gitignore-style globs that must never be **tracked**. A `.gitignore` rule
only prevents *accidental* staging; it is silent for force-added files, files committed before the
rule existed, or negated matches. This hook asserts the invariant positively against the Git index.
Pair it with a matching `.gitignore` rule (convenience) and a push ruleset (server-side backstop).

### 3. Scan contract (ledger)

Some scanners are too slow or too environment-specific to run on every commit: Microsoft Presidio
(text and image), local OCR, [dicom-phi-scan](https://github.com/elijahrockers/dicom-phi-scan),
[phi-scan](https://pypi.org/project/phi-scan/), [HoundDog](https://docs.hounddog.ai/) local
CLI/Docker, or a self-hosted **SonarQube Community Edition** scan. Instead of running them in the
hook, the contract records the Git blob state of the files each scanner covers and blocks when that
state changes without a fresh recording.

- `.scan-contract.json` declares each scanner: `id`, `description`, covered `paths` (globs), and the
  `record_command` a human/CI runs after actually scanning. Committed and CODEOWNER-owned.
- `.scan-ledger.json` records, per scanner, the covered-file state hash at the last recording.
  Committed so the gate is shared, not machine-local.

```sh
# after actually running a scanner against the current tree:
python3 hooks/scripts/check_scan_contract.py record presidio-text --by "<reviewer>" --note "<ref>"
python3 hooks/scripts/check_scan_contract.py status   # per-scanner up-to-date / stale view
```

**Trust boundary:** recording only updates the ledger; it trusts that whoever runs `record` ran the
scanner. Close that gap in CI by running the scanner and `record` in the same job (or by having CI
run the scanner directly), then requiring the CI check. The local hook's job is to guarantee the
scan is *re-run when covered files change* and to make "it was scanned" auditable — not to prove the
scan happened. See [`inventory/medical-data-security.md`](../inventory/medical-data-security.md) for
each tool's setup and local-only cautions.

## Adopting

1. `cp hooks/gitignore-protected.example .gitignore-protected` and edit to your protected rules.
2. `cp hooks/forbidden-paths.example .forbidden-paths` and edit to your never-track globs.
3. If heavy scanners apply: `cp hooks/scan-contract.json.example .scan-contract.json`, keep only the
   scanners you adopt, run each once, and `record` it to create `.scan-ledger.json`.
4. Uncomment the three blocks in [`hooks/.pre-commit-config.yaml`](../hooks/.pre-commit-config.yaml),
   run `pre-commit install`, and confirm a deliberately synthetic violation is blocked.
5. Add the same checks to CI as required jobs, and protect `.gitignore`, `.gitignore-protected`,
   `.forbidden-paths`, `.scan-contract.json`, and `.scan-ledger.json` with `CODEOWNERS`.
6. Record the adopted gates and any accepted risks in an ADR ([`templates/adr.md`](../templates/adr.md)).

## Enforcement tiers

- Protected ignores / forbidden paths — **hard gate** (fast, deterministic).
- Scan contract — **hard gate** for `regulated`; start as a **soft gate** while tuning coverage globs.

Do not weaken a gate to unblock a commit. Restore the ignore rule, untrack the forbidden file, or
run the missing scan and `record` it.
