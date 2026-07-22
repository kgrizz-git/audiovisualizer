# Policy: Third-Party Licenses

Last reviewed: 2026-07-22
Enforced by: [`hooks/scripts/check_license_inventory.py`](../hooks/scripts/check_license_inventory.py)

## Why

Third-party npm packages (direct and transitive) carry license obligations. A maintained
catalog plus automated gates keep attribution accurate and surface copyleft / unknown
licenses before they merge.

This policy is a **catalog and classification gate**, not a legal opinion.

## Rules & defaults

| Rule | Default | Tier |
|---|---|---|
| Inventory committed at [`inventory/third-party-licenses.md`](../inventory/third-party-licenses.md) | required | hard gate |
| Inventory matches lockfile (content diff; `--check` is read-only) | required | hard gate |
| Unknown / unclassifiable licenses | fail until fixed or allowlisted | hard gate |
| Strong copyleft (GPL/AGPL family) in **production** (direct or transitive) | forbidden | hard gate |
| Strong copyleft in **development-only** | catalog + warn | advisory |
| Weak copyleft (e.g. MPL-2.0) | allowed when cataloged; human review expected | soft / review |
| `Last human reviewed` age | warn after 30 days; hard after 180 days | warn / hard |
| Human review >30 days **and** Unknown or strong copyleft present | fail | hard gate |

Threshold env vars (see [`hooks/README.md`](../hooks/README.md)):

- `POLICY_LICENSE_HUMAN_WARN_DAYS` (default `30`)
- `POLICY_LICENSE_HUMAN_HARD_DAYS` (default `180`)
- `POLICY_LICENSE_SKIP_CHECKER=1` — lockfile-only path (restricted CI)

## Categories

- **Permissive** — MIT, ISC, BSD-2/3-Clause, Apache-2.0, 0BSD, Unlicense, CC0-1.0, …
- **Weak copyleft** — MPL-2.0, LGPL family
- **Strong copyleft** — GPL / AGPL family
- **Unknown/Check** — missing, `UNLICENSED`, or unrecognized SPDX

Dual licenses (`A OR B`) are gated as the **more restrictive** of A and B.

## Optional / platform packages

Optional platform binaries (e.g. `@resvg/resvg-js-darwin-arm64`) are **included** in the
inventory under the same production/development bucket as their parent. They are not
dropped.

## Project note: MPL-2.0 (`@resvg/resvg-js`)

Using `@resvg/resvg-js` as a dependency is acceptable for this MIT-licensed app. **Modifying
its source files** triggers MPL-2.0 file-level disclosure obligations for those files.
Prefer upstream contributions or wrappers over forking/patching the package in-tree.

## Markers (auto vs human)

The inventory carries two dates:

- `Last reviewed:` — auto generation stamp from `--update` (not a human attestation)
- `Last human reviewed:` — stamped only by `--human-review` after a spot-check

Do not bump `Last human reviewed` without actually reviewing Unknown/copyleft rows.
This file is **exempt** from ordinary [`doc-freshness.md`](doc-freshness.md) marker rules;
the license inventory script owns its cadence.

## Updating

```bash
python hooks/scripts/check_license_inventory.py --update
python hooks/scripts/check_license_inventory.py --human-review
python hooks/scripts/check_license_inventory.py --check
```
