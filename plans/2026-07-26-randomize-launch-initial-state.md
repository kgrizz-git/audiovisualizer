# Plan: Randomize visual mode and initial loaded bundled MIDI at launch

Last reviewed: 2026-07-26
Date: 2026-07-26
Author: devin
Status: draft
Linked issue/PR: n/a

## Goal

Enhance the first-launch experience by randomly selecting both a visual mode and a bundled MIDI file, showcasing the variety of visualization modes and demo scores available in the application. This provides users with immediate visual variety and encourages exploration of different modes and scores.

**Scope note**: This is UI-layer randomization only. It does not modify the MIDI parser, score-to-geometry mapper, or renderers, and thus does not require `DESIGN.md` updates or determinism-regression tests in `src/core`/renderers per `AGENTS.md` rules 1-3.

## Out of scope

- Randomizing any other configuration parameters (origin mode, color schemes, etc.)
- Changing the user's manual selection after launch
- Persisting random selections across sessions
- Modifying the demo MIDI file selection dropdown behavior beyond initial value sync

## Approach

Add randomization logic in the app constructor that:
1. Selects a random visual mode from a new `VARIATIONS` const array (to be created in `src/core/types.ts`)
2. Selects a random MIDI file from a new `DEMO_CATALOG` const array (to be created in `src/ui/demoCatalog.ts`, extracting from `index.html` options)
3. Applies these selections during initialization before the first render
4. Syncs dropdown UI elements to reflect the randomized state
5. Ensures proper canvas visibility via `updateCanvasMode()` when 3D modes are selected

**Launch vs. refresh semantics**: The page will re-randomize on every refresh/load. This is intentional for a single-page app with no router—each load is a "launch." If session stickiness is desired later, it can be added via `sessionStorage`, but that is out of scope for this plan.

This approach is preferred over alternatives because:
- It's simple and maintainable
- It doesn't require user configuration or persistence
- It happens once at page load, avoiding confusion during active use
- It showcases the full range of capabilities immediately

### Alternatives considered

| Option | Why not chosen |
|---|---|
| User-configurable randomization settings | Adds complexity for a simple enhancement; users can manually select modes/files |
| Weighted randomization favoring certain modes | No clear usage data to justify weighting; uniform sampling is fairer |
| Session-sticky randomization (same random choice across refreshes) | Would require `sessionStorage` complexity; re-randomization on refresh is acceptable for a demo showcase |
| Server-side randomization | Unnecessary client-side logic; keeps implementation simple and local |

## Proposed file changes

```
src/ui/launchRandomizer.ts — New module for randomization utilities (keeps app.ts under file-size waiver)
src/ui/demoCatalog.ts — New module extracting demo MIDI catalog from index.html options (single source of truth)
src/ui/app.ts — Call randomization in constructor, sync dropdowns, call updateCanvasMode()
src/core/types.ts — Export VARIATIONS const array
index.html — Generate demo-midi-select options from demoCatalog.ts (or keep as-is and read from DOM)
```

## Phases & checklist

### Phase 1: Add randomization utilities and data structures

- [ ] Create `src/core/types.ts`: Export `VARIATIONS: readonly Variation[]` const array with all 8 variants
- [ ] Create `src/ui/demoCatalog.ts`: Extract demo MIDI catalog from `index.html` options (lines 19-34) into `DEMO_CATALOG` const array
- [ ] Create `src/ui/launchRandomizer.ts`: Add `pickRandom<T>(arr: readonly T[], rand: () => number): T` helper with injectable random function
- [ ] Add Vitest unit tests for `pickRandom` with deterministic mock random function
- [ ] Decide whether to generate `<select>` options from `DEMO_CATALOG` in `app.ts` or read from DOM at runtime

### Phase 2: Integrate randomization into app initialization

- [ ] Modify app constructor to call randomization before initial render (after `bindEvents()`, before `updateScoreUi()`)
- [ ] Apply randomly selected visual mode to `currentConfig.variation`
- [ ] Call `updateCanvasMode()` after setting variation to ensure correct canvas visibility (2D vs 3D)
- [ ] Pass randomly selected demo MIDI URL to `loadUrl()` instead of `DEFAULT_DEMO_URL`
- [ ] Set `variation-select.value` to randomized variation so dropdown reflects state
- [ ] Set `demo-midi-select.value` to randomized URL so dropdown reflects state
- [ ] Document behavior: if random MIDI fetch fails, stay on generative study (current behavior) vs fallback to default
- [ ] Test that all visual modes can be selected and render correctly
- [ ] Test that all demo MIDI files can be loaded and render correctly

### Phase 3: Verification and edge cases

- [ ] Verify randomization works on fresh page loads (manual refresh testing)
- [ ] Verify manual mode/file selection still works after randomization
- [ ] Verify the dropdown selectors reflect the randomized initial state
- [ ] Test edge cases: single-item arrays, empty arrays (defensive programming)
- [ ] Measure 3D cold-start performance: add <250ms budget for first paint when 3D mode is selected on mid-tier hardware
- [ ] Add fallback path: if Three.js dynamic import or WebGL context creation fails, drop to `lines` mode
- [ ] Decide whether to exclude `3d_*` modes from initial randomization pending performance data (document decision)

## Verification

How will we know this is done and correct?

- [ ] Manual testing: Refresh page 10+ times and observe different initial modes and MIDI files
- [ ] All visual modes render correctly when selected as initial mode
- [ ] All demo MIDI files load successfully when selected as initial file
- [ ] Manual selection overrides work as expected after launch
- [ ] No console errors or warnings related to randomization
- [ ] Launch time performance: 3D cold-start <250ms added to first paint on mid-tier hardware (or 3D modes excluded from randomization)
- [ ] Unit tests pass for randomization utilities (Vitest with deterministic mock random)
- [ ] Dropdowns are correctly synced to randomized values on load
- [ ] Canvas visibility is correct (2D hidden when 3D mode selected, vice versa)

## Completion checklist

When all phases and verification are done:

- [ ] Update plan `Status:` to `complete` with completion date
- [ ] Move plan to `plans/archive/`
- [ ] Add entry to `CHANGELOG.md` (user-facing) or `CHANGELOG.dev.md` (internal)
- [ ] Remove the completed item from `dev-docs/TO_DO.md` (do not just check it off)

## Open questions

- [ ] Resolved in Phase 3: Decide whether to exclude `3d_*` modes from initial randomization based on performance data, or include them with a <250ms cold-start budget and fallback to `lines` on failure.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 3D mode randomization causes slower initial load due to Three.js dynamic import and WebGL context creation | medium | medium | Measure cold-start performance; if >250ms on mid-tier hardware, exclude 3D modes from initial randomization or add fallback to `lines` mode |
| User confusion when initial state changes on refresh | low | low | Document behavior; users can still manually select preferred mode/file. Re-randomization on refresh is intentional for a SPA demo showcase. |
| Random selection of same mode/file repeatedly | low | low | True randomness allows this; it's expected behavior and not a bug |
| Dropdown UI desync from internal state if randomization doesn't set `.value` | low | medium | Explicitly set `variation-select.value` and `demo-midi-select.value` in constructor (addressed in Phase 2) |
| 3D canvas hidden when 3D mode selected (updateCanvasMode not called) | low | medium | Explicitly call `updateCanvasMode()` after setting variation (addressed in Phase 2) |
| app.ts exceeds file-size waiver (currently 804 lines, limit 850) | low | low | Place randomization helpers in new `src/ui/launchRandomizer.ts` module (addressed in Phase 1) |
