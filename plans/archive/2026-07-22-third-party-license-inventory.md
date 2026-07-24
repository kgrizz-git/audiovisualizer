# Plan: Third-Party License Inventory

Last reviewed: 2026-07-22
Date: 2026-07-22
Author: Codex (initial implementation); Antigravity (review and gap analysis);
  Composer (plan hardening recommendations + Phase 2 execution, 2026-07-22)
Status: complete (completed on 2026-07-23)
Linked issue/PR: n/a

## Goal

Establish a maintained, human-readable catalog of all third-party dependencies (direct
and transitive) and their licenses so the project satisfies attribution obligations,
can quickly flag copyleft or unknown licenses, and has automated gates that keep the
inventory from going stale as dependencies change. The inventory also tracks when it
was last reviewed by a human: age is advisory at 30 days and only hard-fails at a
longer window (or sooner when unknown / strong-copyleft entries are present).

## Out of scope

- License-compatibility legal opinions — this is a catalog and classification tool, not
  a legal review.
- Automatic license-text bundling or SPDX SBOM generation (may revisit later).

## Approach

Use a **pinned** `license-checker` (via `npx package@version` or a `devDependency`) to
pull license metadata from npm, normalize SPDX / dual-license strings, group results by
license category (permissive / weak copyleft / strong copyleft / unknown), and write a
Markdown inventory file. A Python hook script manages generation and freshness checks.
`--check` is read-only and content-diff based; `--update` is the only writer. Pre-commit
and CI both run `--check`.

### Classification algorithm (prod vs transitive-dev)

Lockfile v3 + `license-checker` do not give a four-way split for free. Implement
explicitly:

1. Read `package.json` for direct `dependencies` vs `devDependencies` names.
2. Walk `package-lock.json` `packages` (lockfile v3). Treat a package as **dev** if its
   lock entry (or every path that reaches it from the root) is marked `"dev": true`;
   otherwise **production**.
3. A package is **direct** if its name is in `package.json` dependencies/devDependencies;
   otherwise **transitive**.
4. **Optional / platform packages** (e.g. `@resvg/resvg-js-darwin-arm64`,
   `optionalDependencies`): include them under the same prod/dev bucket as their parent,
   listed individually with versions (do not silently drop). Deduplicate by
   `name@version` if the same package appears under multiple lock keys.
5. Prefer `license-checker` output for license strings when available; fall back to
   lockfile/`package.json` `license` fields and then `node_modules` LICENSE files.

### Gate policy

| Condition | Severity |
|---|---|
| Inventory missing, or content differs from regenerated inventory (ignoring `Last human reviewed`) | **Hard fail** (`--check` exit 1) |
| New or existing **Unknown/Check** license entries | **Hard fail** until classified or allowlisted in policy |
| New or existing **strong copyleft** (GPL/AGPL family) in production (direct or transitive) | **Hard fail** (dev-only strong copyleft: warn in summary; document in policy) |
| Weak copyleft (e.g. MPL-2.0 on `@resvg/resvg-js`) | Allowed for known deps; catalog + policy note; human review still expected |
| `Last human reviewed` older than **30 days** | **Warn** (stderr); do not block |
| `Last human reviewed` older than **180 days** | **Hard fail** (aligned with doc-freshness soft window) |
| `Last human reviewed` older than **30 days** *and* inventory has Unknown or strong copyleft | **Hard fail** (shorten the soft window when risk is present) |

`--check` must **never** write the inventory file. Only `--update` and `--human-review`
mutate it.

### SPDX / dual-license normalization

- Accept SPDX expressions and arrays from `license-checker` (e.g. `MIT OR Apache-2.0`,
  `["MIT","Apache-2.0"]`, `GPL-3.0-only`, `GPL-3.0-or-later`).
- Normalize synonyms (`Apache 2.0` → `Apache-2.0`, bare `GPL` → treat as unknown unless
  versioned).
- Category rule for `A OR B`: classify as the **more restrictive** of A and B for gating
  (e.g. `MIT OR GPL-3.0` → strong copyleft for gate purposes), and show the full
  expression in the inventory line.
- `UNLICENSED` / missing → Unknown/Check (hard fail).

### Alternatives considered

| Option | Why not chosen |
|---|---|
| Dedicated SBOM tool (syft, cyclonedx) | Heavier setup, machine-readable only; Markdown is more useful for human review at this project scale |
| Inline `npm audit` only | Covers vulnerability scanning, not license classification |
| Manual maintenance | Not sustainable; will drift within weeks |
| Date/mtime-only freshness | Fragile (touch lockfile without dep change; same-day races); does not catch deleted inventory entries |
| Hard-fail human review every 30 days | Encourages rubber-stamping; conflicts with `policies/doc-freshness.md` cadence |

## Proposed file changes

```
hooks/scripts/check_license_inventory.py     — generate/check inventory (Phase 1 done; Phase 2 harden)
tests/hooks/test_check_license_inventory.py  — new: fixture tests for lockfile v3 + classification
tests/fixtures/license-inventory/            — new: sample lockfile v3 / package.json snippets
inventory/third-party-licenses.md            — auto-generated license catalog
.pre-commit-config.yaml                      — check-license-inventory hook (keep in sync with hooks/)
hooks/.pre-commit-config.yaml                — same hook entry (template copy)
LICENSE                                      — MIT for the project itself
package.json                                 — "license": "MIT"; pin license-checker (devDependency or documented npx @version)
hooks/README.md                              — document script, env thresholds, check vs update
policies/third-party-licenses.md             — new: policy, categories, MPL note, gate table
policies/doc-freshness.md                    — clarify auto-generated inventory exempt / dual markers
policies/README.md                           — link new policy
.github/workflows/ci.yml                     — app CI: validate + license --check (+ unit tests) + gitleaks
ci/examples/ci.yml                           — example only; documents a license step for consumers
README.md                                    — short "Third-party licenses" pointer to inventory/
CHANGELOG.dev.md                             — note inventory/policy/hook changes
AGENTS.md                                    — only if start-here / working rules need a pointer
```

## Phases & checklist

### Phase 1: Core tooling (completed by Codex agent)

- [x] Create `hooks/scripts/check_license_inventory.py` with `--check` and `--update` modes
- [x] Generate `inventory/third-party-licenses.md` with all 5 direct deps correctly classified
- [x] Wire `check-license-inventory` hook into `.pre-commit-config.yaml` with `always_run: true`
- [x] Create `LICENSE` (MIT) for the project
- [x] Add `"license": "MIT"` to `package.json`
- [x] Document the script in `hooks/README.md`
- [x] Verify `npm run validate` passes (15 tests, clean build)

### Phase 2: Harden the gate (completed 2026-07-22)

#### 2.1 Content-correct `--check` / `--update`

- [x] Make `--check` **read-only**: never create or overwrite `inventory/third-party-licenses.md`
- [x] Implement content comparison: regenerate inventory to a string; preserve committed
  `Last reviewed` / `Last human reviewed` dates when comparing; exit 1 on any other
  difference (including missing file)
- [x] Keep `--update` as the only full regenerator; preserve existing `Last human reviewed`
  when regenerating
- [x] Fix the generated **Generating & Updating** snippet to a single command:
  `python hooks/scripts/check_license_inventory.py --update`

#### 2.2 Transitive coverage, versions, classification

- [x] Expand collection beyond `--direct`; include the full tree
- [x] Structure inventory under four headings with category subsections
- [x] Add **version numbers** to each entry
- [x] Implement the prod/dev/direct/transitive algorithm; include optional platform packages
- [x] Implement SPDX / dual-license normalization and category rules

#### 2.3 Human review field (soft / hard cadence)

- [x] Add `Last human reviewed: YYYY-MM-DD` separate from auto `Last reviewed`
- [x] Add `--human-review` to stamp today's date without rewriting the dep catalog body
- [x] Enforce gate table: warn >30 days; hard fail >180 days; hard fail >30 days if
  Unknown or strong-copyleft present
- [x] Expose thresholds via env vars in `hooks/README.md`

#### 2.4 Lockfile v3 fallback + pin tooling

- [x] Fix fallback parser for lockfile v3 (`packages["node_modules/<pkg>"]`)
- [x] Prefer reading `license` from lockfile package entries when present
- [x] Pin `license-checker@25.0.1` via npx in the script (documented in hooks README)
- [x] Sync hook entry in both `.pre-commit-config.yaml` and `hooks/.pre-commit-config.yaml`

#### 2.5 Policy, CI, docs, tests

- [x] Create `policies/third-party-licenses.md`
- [x] Update `policies/doc-freshness.md` + `check_doc_freshness.py` exempt path + `policies/README.md`
- [x] Add CI steps in `.github/workflows/ci.yml` (and note in `ci/examples/ci.yml`)
- [x] Add README “Third-party licenses” section
- [x] Add fixture unit tests under `tests/hooks/`
- [x] Note changes in `CHANGELOG.dev.md` and `CHANGELOG.md` (README pointer)

### Phase 3: Polish (nice to have — lowest priority)

- [x] Add SPDX license URL links alongside each inventory entry
- [x] Consider a committed allowlist file for rare Unknown entries that have been
  manually verified (only if needed after transitive scan)

## Verification

- [x] Phase 1: `python hooks/scripts/check_license_inventory.py --check` exits 0 with
  `PASS` (confirmed 2026-07-22; behavior will change in Phase 2)
- [x] Phase 1: `npm run validate` passes (confirmed by Codex agent)
- [x] `--check` with a **missing** inventory exits 1 and does **not** create the file
- [x] `--check` after deleting an inventory entry (content drift) exits 1
- [x] `--human-review` stamp preserves body; `--check` passes when content matches
- [x] `--update` regenerates body, preserves `Last human reviewed`, fixed Generating snippet
- [x] `--human-review` flag stamps today's date into `Last human reviewed`
- [x] Transitive deps appear under the correct four-way heading structure with versions
- [x] Optional `@resvg/resvg-js-*` platform packages appear (not dropped)
- [x] Dual license `MIT OR GPL-3.0` (fixture) classifies as strong copyleft for gating
- [x] Strong copyleft in production → covered by fixture + gate logic
- [x] Human review 31 days old → warn, exit 0 (unless Unknown/strong copyleft present)
- [x] Human review 181 days old → exit 1
- [x] Fallback parser enumerates deps from lockfile v3 when `npx` is unavailable
  (`POLICY_LICENSE_SKIP_CHECKER=1` / fixture path)
- [x] Fixture tests pass; `npm run validate` still passes (15 vitest + build)
- [x] CI / `ci.yml` validate job includes `--check` + unittest after `npm ci`
- [x] Root and `hooks/` pre-commit configs both invoke the same check

## Open questions

- [x] Should transitive dependencies be included? **Yes** — include all transitive deps.
  `@resvg/resvg-js` (MPL-2.0) in particular may carry obligations through its transitive
  tree. (Decided 2026-07-22)
- [x] Who owns the periodic license review cadence? **No assigned owner** — track
  `Last human reviewed` in the inventory; warn after 30 days; hard-fail after 180 days
  (or after 30 days when Unknown / strong copyleft is present). (Revised 2026-07-22)
- [x] Should `--check` use mtime vs content diff? **Content diff** (preserve date lines
  from the committed file when regenerating for compare). (Decided 2026-07-22)
- [x] Should strong copyleft fail the gate? **Yes for production** (direct or transitive);
  catalog + warn for dev-only. (Decided 2026-07-22)
- [x] How to treat optional platform packages? **Include** under parent’s prod/dev bucket.
  (Decided 2026-07-22)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Stale inventory merged via push without pre-commit | medium | low | CI `--check` in `.github/workflows/ci.yml` + examples note |
| Content drift with date-only check | high (today) | medium | Content-diff `--check`; no auto-write on check |
| `license-checker` misidentifies a license | low | medium | Normalization + node_modules/lockfile fallback; Unknown hard-fails |
| Unpinned `npx license-checker` drifts | medium | medium | Pin version |
| New strong copyleft / unknown goes unreviewed | medium | high | Hard fail on those categories; transitive coverage; policy |
| Transitive tree noisy (~80 pkgs) + platform variants | medium | low | Four-way sections; versions; policy on optionals |
| Lockfile v3 fallback empty | high if npx missing | medium | v3 `packages` parser + fixture tests |
| 30-day hard human-review rubber-stamping | medium | low | Soft 30 / hard 180 (faster hard only with risk) |
| Doc-freshness fights auto `Last reviewed` | medium | low | Exempt or dual-marker rules in doc-freshness policy |
| `npx` unavailable in restricted CI | low | low | Lockfile v3 fallback; document `npm ci` when using checker path |
