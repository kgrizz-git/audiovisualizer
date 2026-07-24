# Plan: Bump Vite and Vitest to secure versions

Last reviewed: 2026-07-23
Date: 2026-07-23
Author: Antigravity
Status: complete
Linked issue/PR: n/a

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `vite` and `vitest` dependencies to resolve dev-tooling security vulnerabilities (including the critical Vitest UI server and high Vite dev-server path traversal advisories) while verifying all application, CLI, SoundFont player, and test suite functionalities are preserved intact.

**Approach:** Upgrade `vite` to `^8.1.5` and `vitest` to `^4.1.10` directly in the project's devDependencies, regenerate `package-lock.json`, and run validation suites to verify no breaking API changes disrupt the codebase.

**Tech Stack:** Node.js, npm, Vite, Vitest, TypeScript.

### Alternatives considered

| Option | Why not chosen |
|---|---|
| Stay on Vite 5.x / Vitest 1.x and fix sub-dependencies via overrides | Vite 5.x/Vitest 1.x rely on older core structures. Upgrading to the latest major stable releases (Vite v8, Vitest v4) resolves the vulnerabilities cleanly and aligns the project with current tools. |
| Upgrade to Vite v6 / Vitest v3 | Vite v8 is the current tagged `latest` version on npm and uses Rolldown, providing better performance and future-proofing. It is preferred to upgrade directly to the latest stable release. |

## Global Constraints

- Keep the MIDI parser and score-to-geometry mapper deterministic and side-effect free.
- Run `npm run validate` before handoff.
- Verify CLI rendering, offline SoundFont bundling, and web interface playback.

## Proposed file changes

```
package.json      — Bump devDependencies for vite and vitest
package-lock.json — Regenerated on npm install
```

---

### Task 1: Pre-Upgrade Baseline Check

Verify the current state of tests, build, and CLI output prior to making dependency changes.

**Files:**
- Test: `tests/` (run existing tests)

- [ ] **Step 1: Run the validation suite**

  Run: `npm run validate`
  Expected: PASS. 17 test files and 104 tests pass successfully, and the production build completes.

- [ ] **Step 2: Verify offline CLI renderer**

  Run: `npm run render -- --input public/demo-midi/bach_prelude_c.mid --output tmp/test-bach.svg`
  Expected: Command outputs `Wrote tmp/test-bach.svg` and exits with code 0.

- [ ] **Step 3: Verify SoundFont bundling tool**

  Run: `npm run bundle:soundfonts:verify`
  Expected: Outputs `ok` status for all 22 default soundbank presets.

---

### Task 2: Perform Dependency Upgrade

Modify `package.json` and install the latest versions of `vite` and `vitest`.

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install packages**

  Run: `npm install --save-dev vite@latest vitest@latest`
  Expected: Installation succeeds, updating `vite` to `^8.1.5` and `vitest` to `^4.1.10`.

- [ ] **Step 2: Verify package.json changes**

  Verify that the devDependencies section in `package.json` contains:
  ```json
  "vite": "^8.1.5",
  "vitest": "^4.1.10"
  ```

---

### Task 3: Post-Upgrade Validation & Verification

Run the entire test suite, build process, CLI, SoundFont utility, and launch the dev server to verify all app features are intact.

**Files:**
- Test: `tests/`
- Test: `package.json` scripts

- [ ] **Step 1: Run package validation**

  Run: `npm run validate`
  Expected: Both tests (`vitest run`) and build (`tsc && vite build`) execute and pass successfully.

- [ ] **Step 2: Run CLI render test**

  Run: `npm run render -- --input public/demo-midi/bach_prelude_c.mid --output tmp/test-bach-post.svg`
  Expected: Command outputs `Wrote tmp/test-bach-post.svg` and exits with code 0.

- [ ] **Step 3: Run SoundFont bundle check**

  Run: `npm run bundle:soundfonts:verify`
  Expected: Outputs `ok` status for all 22 soundbanks.

- [ ] **Step 4: Run security audit**

  Run: `npm audit`
  Expected: Dev-tooling advisories for `vite` and `vitest` are successfully cleared.

- [ ] **Step 5: Verify dev server launch**

  Run: `npm run dev`
  Expected: Dev server starts up on port 3000, opens a browser tab, and visualizer page loads without error.

## Verification

How will we know this is done and correct?

- [ ] The `vite` version is bumped to `^8.1.5` and `vitest` to `^4.1.10` in `package.json`.
- [ ] `npm run validate` completes successfully without compilation or runtime test failures.
- [ ] `npm audit` reports 0 high/critical vulnerabilities for `vite` and `vitest` dependencies.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Vite 8 breaking config changes | low | med | Simple config in `vite.config.ts` means low risk. If issues arise, adapt config parameters or downgrade to Vite 6.x. |
| Vitest 4 breaking API changes | low | low | Unit tests rely on standard assertions (`describe`, `it`, `expect`). Any minor type or import issues will be fixed immediately. |
