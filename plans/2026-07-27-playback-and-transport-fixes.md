# Plan: Playback & Transport Fixes

NEEDS REVIEW
Last reviewed: 2026-07-27
Date: 2026-07-27
Author: opencode
Status: draft
Linked issue/PR: n/a

## Goal

Fix two playback bugs: (1) the play button fails to start playback on first press, and (2) playback stops when the user scrubs the timeline forward or backward during playback. Additionally, add pan support to the 3D camera to match the existing 2D pan interaction.

## Out of scope

- Audio output changes (SoundFont, oscillator, scheduling).
- New visual layouts or visual property changes.
- Export functionality changes.

## Approach

The play-first-press bug is a boundary check issue in `startPlayback()`. When a MIDI file is loaded, `currentTime` is set to `score.duration`. The check to reset `currentTime` to 0 is `this.currentTime >= completionTime`, where `completionTime` is `score.duration + release + pad`. On the first press, `currentTime` is `score.duration` which is less than `completionTime`, so the playhead starts at the end, schedules no notes, and pauses. The second press succeeds because `currentTime` has advanced to `completionTime`. The fix is to check `currentTime` against `duration` instead.

The scrub bug occurs because the scrub handler unconditionally pauses playback. If we keep it playing, audio desync and playhead fighting will occur. The fix is to capture whether playback was active when scrubbing starts (via a `wasPlayingBeforeScrub` flag), pause playback on the `input` event, update the position, and resume playback on the `change` (mouseup/drag end) event.

For 3D panning, `enablePan` is enabled by default in `OrbitControls`. The issue is zoom tracking: `OrbitControls` modifies `camera.zoom` for orthographic cameras, which is ignored by viewport zoom. Instead of scaling every frame (which drifts), we will register a handler on `OrbitControls` `'end'` event, read the new zoom level from `camera.zoom`, scale `viewport.zoom = viewport.zoom * camera.zoom`, reset `camera.zoom = 1`, and call `frameCamera()` to normalize. Panning will be always-enabled (no modifier key needed).

### Alternatives considered

| Option | Why not chosen |
|---|---|
| Rewrite transport from scratch | Too heavy for targeted bug fixes; existing architecture is sound |
| Add pan via custom pointer events | `OrbitControls` already has built-in pan; no reason to reimplement |
| Keep tick loop running during scrub | Causes erratic playhead jittering and audio scheduler desync; pausing during drag and resuming on change is much cleaner |

## Proposed file changes

```
src/ui/app.ts                         — fix togglePlay first-press init; preserve isPlaying during scrub
src/renderers/three/ThreeDRenderer.ts — enable OrbitControls pan (enablePan = true, key binding)
tests/playbackScheduler.test.ts       — add first-press and scrub-during-play tests
tests/ThreeDRenderer.test.ts          — add pan-enabled assertion
DESIGN.md                             — document pan controls in 3D interaction section
```

## Phases & checklist

### Task 1: Fix play first-press bug

- [x] Verify that `audioContext.resume()` is already called downstream inside `SoundfontPlayer.start()` at `src/audio/soundfont/soundfontPlayer.ts:80` (already present, no change required).
- [x] Modify the reset check in `startPlayback()` in `src/ui/app.ts` to reset if `this.currentTime >= this.currentScore.duration` (instead of comparing against `completionTime`).
- [x] Ensure the first play press correctly starts audio and advances the playhead from 0.
- [x] Add integration test: verifying first play press starts audio and resets playhead when it's at the end.

### Task 2: Resume playback after scrub

- [ ] Add `wasPlayingBeforeScrub: boolean` state in `src/ui/app.ts`.
- [ ] In the scrubber `input` listener: if playing, set `wasPlayingBeforeScrub = true` and call `this.pause()`. Update `currentTime` and render frame.
- [ ] Add a `change` listener on the scrubber. If `wasPlayingBeforeScrub` is true, call `this.startPlayback()` and reset `wasPlayingBeforeScrub = false`.
- [ ] Add integration test: scrub during playback pauses playhead, and mouseup/release resumes it at the correct position.

### Task 3: Enable 3D pan & fix zoom tracking

- [ ] In `ThreeDRenderer.ts` `mount()`, set `this.controls.enablePan = true` on the `OrbitControls` instance.
- [ ] In `ThreeDRenderer.ts` `mount()`, add a listener to the `OrbitControls` `'start'` event: reset `this.camera.zoom = 1` to clear any gesture-onset drift.
- [ ] In the `OrbitControls` `'end'` event listener (in `ThreeDRenderer.ts` `mount()`), update zoom tracking: update `viewport.zoom = viewport.zoom * camera.zoom`, then reset `camera.zoom = 1` and call `frameCamera()`.
- [ ] Update `DESIGN.md` in the 3D variations description to document pan controls (right-click drag, shift+left-drag, or two-finger swipe).
- [ ] In `tests/ThreeDRenderer.test.ts`, write a configuration test using a mock WebGL context and canvas stub to assert that `controls.enablePan === true` after `mount()`.

## Verification

- [ ] First play press starts audio and visual playhead advances
- [ ] Verify `audioContext.resume()` is called in the play button handler
- [ ] Test first play press with a fresh page load (verifying resumption of suspended AudioContext)
- [ ] Scrubbing during playback updates the playhead position and playback continues upon release
- [ ] Test scrub with mouse drag (input → change sequence) AND keyboard scrub (arrow keys during playback)
- [ ] Scrubbing while paused seeks to the new position without auto-starting
- [ ] 3D view responds to pan gestures (two-finger drag or right-click drag)
- [ ] Existing zoom and rotate still work in 3D
- [ ] Verify 3D zoom does not drift after repeated pan/zoom cycles
- [ ] `npm run validate` passes (type-check, tests, production build)

## Completion checklist

When all phases and verification are done:

- [ ] Update plan `Status:` to `complete` with completion date
- [ ] Move plan to `plans/archive/`
- [ ] Add entry to `CHANGELOG.md` (user-facing) or `CHANGELOG.dev.md` (internal)
- [ ] Remove the completed items from `dev-docs/TO_DO.md` (do not just check them off)

## Open questions

- None. (Resolved: Panning is always-enabled, matching OrbitControls defaults).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| AudioContext resume timing varies across browsers | medium | medium | Call resume() early in the event handler, before scheduling; test in Chrome + Safari |
| Zoom calculation conflicts with OrbitControls internal scale | high | medium | Use `controls.addEventListener('end', ...)` to sync zoom on drag end, resetting `camera.zoom = 1` to prevent exponential drift |
