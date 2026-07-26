# Plan: Randomize visual mode and initial loaded bundled MIDI at launch

Last reviewed: 2026-07-26
Date: 2026-07-26
Author: devin
Status: draft
Linked issue/PR: n/a

## Goal

Enhance the first-launch experience by randomly selecting both a visual mode and a bundled MIDI file, showcasing the variety of visualization modes and demo scores available in the application. This provides users with immediate visual variety and encourages exploration of different modes and scores.

## Out of scope

- Randomizing any other configuration parameters (origin mode, color schemes, etc.)
- Changing the user's manual selection after launch
- Persisting random selections across sessions
- Modifying the demo MIDI file selection dropdown behavior

## Approach

Add randomization logic in the app constructor that:
1. Selects a random visual mode from the available `Variation` types
2. Selects a random MIDI file from the bundled demo files in `public/demo-midi/`
3. Applies these selections during initialization before the first render

This approach is preferred over alternatives because:
- It's simple and maintainable
- It doesn't require user configuration or persistence
- It happens once at launch, avoiding confusion during active use
- It showcases the full range of capabilities immediately

### Alternatives considered

| Option | Why not chosen |
|---|---|
| User-configurable randomization settings | Adds complexity for a simple enhancement; users can manually select modes/files |
| Weighted randomization favoring certain modes | No clear usage data to justify weighting; uniform sampling is fairer |
| Randomization on every page load | Would be jarring for users refreshing the page; launch-only is better UX |
| Server-side randomization | Unnecessary client-side logic; keeps implementation simple and local |

## Proposed file changes

```
src/ui/app.ts — Add randomization helper functions and call them in constructor to select random initial visual mode and demo MIDI file
src/core/types.ts — Potentially export the Variation array for easier randomization (if not already accessible)
```

## Phases & checklist

### Phase 1: Add randomization utilities

- [ ] Create helper function to get all available visual modes from the Variation type
- [ ] Create helper function to get all bundled demo MIDI file paths and titles
- [ ] Create helper function to select random item from an array
- [ ] Add unit tests for randomization utilities

### Phase 2: Integrate randomization into app initialization

- [ ] Modify app constructor to call randomization before initial render
- [ ] Apply randomly selected visual mode to `currentConfig.variation`
- [ ] Load randomly selected demo MIDI file instead of hardcoded default
- [ ] Ensure 3D renderer is properly initialized if a 3D mode is selected
- [ ] Test that all visual modes can be selected and render correctly
- [ ] Test that all demo MIDI files can be loaded and render correctly

### Phase 3: Verification and edge cases

- [ ] Verify randomization works on fresh page loads
- [ ] Verify manual mode/file selection still works after randomization
- [ ] Verify the dropdown selectors reflect the randomized initial state
- [ ] Test edge cases: single-item arrays, empty arrays (shouldn't happen but defensive)
- [ ] Ensure no performance impact on launch time

## Verification

How will we know this is done and correct?

- [ ] Manual testing: Refresh page 10+ times and observe different initial modes and MIDI files
- [ ] All visual modes render correctly when selected as initial mode
- [ ] All demo MIDI files load successfully when selected as initial file
- [ ] Manual selection overrides work as expected after launch
- [ ] No console errors or warnings related to randomization
- [ ] Launch time performance is not noticeably degraded
- [ ] Unit tests pass for randomization utilities

## Completion checklist

When all phases and verification are done:

- [ ] Update plan `Status:` to `complete` with completion date
- [ ] Move plan to `plans/archive/`
- [ ] Add entry to `CHANGELOG.md` (user-facing) or `CHANGELOG.dev.md` (internal)
- [ ] Remove the completed item from `dev-docs/TO_DO.md` (do not just check it off)

## Open questions

- [ ] Should 3D modes be weighted differently given they require Three.js initialization? (decide during implementation based on performance testing)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 3D mode randomization causes slower initial load on lower-end devices | medium | medium | Monitor performance; consider excluding 3D modes from randomization if problematic |
| User confusion when initial state changes on refresh | low | low | Document behavior; users can still manually select preferred mode/file |
| Random selection of same mode/file repeatedly | low | low | True randomness allows this; it's expected behavior and not a bug |
