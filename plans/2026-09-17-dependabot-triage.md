# Plan: Dependabot Update Triage

Date: 2026-09-17
Author: Kiro
Status: in-progress
Linked issue/PR: https://github.com/kgrizz-git/audiovisualizer/pull/15, https://github.com/kgrizz-git/audiovisualizer/pull/16

## Goal

Safely resolve the current Dependabot queue without merging red or stale updates,
while preserving a tracked path for deferred major upgrades. This plan covers the
live snapshot of PRs #7–#14 as of 2026-09-17; refresh it before any execution.

## Out of scope

- Changing application behavior or renderer code except where a reviewed dependency
  upgrade requires a compatibility fix.
- Raising the CI Node runtime or adopting Vitest 5, TypeScript 7, or Three r186 in
  this maintenance pass.
- Adding Dependabot ignore rules without explicit maintainer approval.

## Approach

Use maintainer-owned PRs for coherent, validated update batches rather than merging
several bot PRs sequentially. Green Dependabot checks are evidence, not a substitute
for validating the final maintainer-owned diff. Keep deferred major work visible in
the active backlog; do not suppress it silently.

### Current triage snapshot

| PRs | Verdict | Follow-up |
|---|---|---|
| #7–#10: Actions v7 | Candidate for one maintainer-owned CI PR | Update all four, validate, add one developer-changelog entry, then close bot PRs. |
| #11: grouped npm minors | Split; not safe as-is | Exclude `three` and `@types/three`; validate the remaining four package updates in a dedicated PR. |
| #12–#13: Vitest 5 pair | Defer as one upgrade | Both individual PRs fail exact peer matching. A later combined upgrade also needs Node >=22.12 or Node 24. |
| #14: TypeScript 7 | Defer | It fails because `typescript-eslint@8.65.0` peers TypeScript `<6.1.0`; upgrade the compatible lint stack together later. |

### Alternatives considered

| Option | Why not chosen |
|---|---|
| Merge the four green Actions bot PRs one at a time | Requires repeated approval/rebase cycles and a separate changelog PR. |
| Merge #11 as generated | CI is red from the Three/OrbitControls test-double incompatibility. |
| Add broad or version-range Dependabot ignores now | `ignore` can affect security updates and needs an explicit, time-bounded maintainer decision. |
| Leave the analysis only in `tmp/` | Deferred work and safety decisions would not be durable or visible to future maintainers. |

## Proposed file changes

```
.github/workflows/ci.yml                 — Actions-only maintenance PR, if approved
package.json and package-lock.json       — split npm-minor PR and later coordinated major upgrades
inventory/third-party-licenses.md        — regenerate whenever an npm lockfile changes
tests/ThreeDRenderer.test.ts             — update only if required to support a reviewed Three upgrade
dev-docs/TO_DO.md                        — track this triage and deferred major work
CHANGELOG.dev.md                         — record merged developer-only maintenance
.github/dependabot.yml                   — change only with explicit approval and documented security trade-off
```

## Phases & checklist

### Phase 1: Refresh and classify

- [x] Re-list open Dependabot PRs, inspect each diff and Validate result, and update
  this snapshot if it has changed.
- [x] Check Dependabot alerts separately from version-update PRs; prioritize an
  active security remediation over this ordering.
- [x] Confirm the active ruleset, required approvals, and current default-branch
  head before opening any maintainer-owned PR.

Verified 2026-09-18: the snapshot is unchanged; `main` remains
`c0e8f6fb3176ef777d4d4c8d68e5041359c64371`, no Dependabot alerts are open,
and `KGmain1` remains active with code-owner and unattributed-change approval
requirements.

### Phase 2: Actions maintenance

- [x] Create one maintainer-owned PR that upgrades checkout, setup-node,
  setup-python, and upload-artifact to the reviewed versions from #7–#10.
- [x] Run the applicable CI workflow and `npm run validate`; confirm the coverage
  artifact still uploads.
- [x] Add one concise `CHANGELOG.dev.md` entry, obtain the required approval, merge,
  and then close #7–#10 with a pointer to the maintainer PR.

Verified 2026-09-18: PR #15 merged as `b3e55aec6d20d37fd16ebb713f4ac0546835857d`;
CI run `35383316356` succeeded and uploaded non-expired `coverage-lcov` (11,333
bytes); #7–#10 are closed with supersession pointers. The GitHub review API lists
no human `APPROVED` event; the maintainer explicitly accepted the merge on
2026-09-18, so the composite checklist item is complete.

### Phase 3: Split the npm-minor group

- [x] Create a separate PR for only Vite, ESLint, typescript-eslint, and esbuild from
  #11; do not describe this as safe until its own validation is green.
- [x] Regenerate the license inventory after the lockfile update and review any new
  license classifications; do not update the human-review marker without a real
  human review.
- [x] Run `npm run validate`, the license inventory check, and CI; add the
  developer-changelog entry before requesting merge.
- [x] Close #11 only after the replacement PR has superseded or intentionally
  deferred every update in its diff.

Verified 2026-09-18: PR #16 merged as `31828ff0a6df13adbc3cbcb89f5139f4ed46fadb`;
CI run `35387408499` succeeded and uploaded non-expired `coverage-lcov` (11,337
bytes); #11 is closed with a supersession pointer. The approved direct updates were
Vite, ESLint, typescript-eslint, and esbuild; Three.js and `@types/three` remain
deferred.

### Phase 4: Track and decide deferred majors

- [ ] Add concise, linked backlog tasks before closing #12–#14: coordinated
  Vitest/coverage-v8 5 + Node runtime upgrade; Three/`@types/three` compatibility
  upgrade; and TypeScript 7 + compatible typescript-eslint upgrade.
- [ ] For the Vitest task, re-check supported Node engines and breaking changes at
  execution time; upgrade the exact-peered packages together.
- [ ] For the Three task, reproduce the r186 OrbitControls test failure and fix the
  canvas test double before considering a renderer change.
- [ ] Close the red single-package major PRs with links to their durable backlog task.
- [ ] If recurring noise warrants a Dependabot grouping or ignore rule, obtain
  explicit approval first and document its exact scope, security effect, owner, and
  revisit date. Prefer grouping coordinated packages over a broad ignore.

## Verification

- [ ] Documentation-only PR passes `git diff --check` and the repository's relevant
  policy checks.
- [ ] Each maintainer-owned dependency PR passes `npm run validate` and GitHub CI on
  its final head.
- [ ] Every npm lockfile change has a matching current license inventory and a clean
  `python hooks/scripts/check_license_inventory.py --check` result.
- [ ] No bot PR is merged or closed without a recorded replacement, durable backlog
  task, or maintainer decision.

## Completion checklist

When all phases and verification are done:

- [ ] Update plan `Status:` to `complete` with completion date
- [ ] Move plan to `plans/archive/`
- [ ] Add entry to `CHANGELOG.dev.md` (internal)
- [ ] Remove the completed item from `dev-docs/TO_DO.md` (do not just check it off)

## Open questions

- [ ] Should coordinated major updates be grouped in Dependabot rather than ignored?
- [ ] What Node LTS target should the eventual Vitest 5 task use: 22.12+ or 24?

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Stale bot-PR evidence | med | med | Refresh checks and diffs immediately before each action. |
| Suppressed security remediation | low | high | No ignore rule without explicit approval, scope, and review date. |
| Lockfile/license drift | med | med | Regenerate and check inventory in the same npm-update PR. |
| Major-toolchain incompatibility | high | med | Keep coordinated majors separate and test on their intended Node runtime. |
