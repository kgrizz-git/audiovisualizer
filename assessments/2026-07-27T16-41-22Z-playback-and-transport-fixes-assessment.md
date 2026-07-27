# Plan Assessment: Playback & Transport Fixes

Last reviewed: 2026-07-27T16:53:33Z (re-review of updated plan)
Date: 2026-07-27
Reviewer: opencode (agent)
Scope: [plans/2026-07-27-playback-and-transport-fixes.md](file:///Users/kevingrizzard/MyCode/AudioVisualizer/plans/2026-07-27-playback-and-transport-fixes.md)
Status: approved

## Executive Summary

The plan to fix two playback bugs and add 3D pan support is well-scoped, root-cause-driven, and consistent with the existing architecture. The diagnostic analysis is accurate (verified against `src/ui/app.ts:389-420` and `src/ui/app.ts:159-160`), and the proposed fixes are minimal and surgical. All three recommendations from the previous assessment have been incorporated into the updated plan. We approve the plan as-is.

## Detailed Technical Review

### 1. Play first-press bug — root cause and fix
The diagnostic is correct. In `src/ui/app.ts:389-420`, `startPlayback()` computes:
```
const completionTime = noteSourceStopTime(playbackEndTime(this.currentScore));
if (this.currentTime >= completionTime) this.currentTime = 0;
```
On first press, `currentTime === score.duration` (set after `applyScore` reads the score), but `completionTime = duration + release + pad`. The boundary check therefore fails, the audio scheduler is asked to play from the end of the score, no notes are scheduled, and the playhead pauses immediately. The second press succeeds because the `tick()` loop has advanced `currentTime` to `completionTime` in the interim.

The fix (compare `this.currentTime >= this.currentScore.duration`) is correct and matches the `tick()` boundary check at `src/ui/app.ts:516` for natural completion. Recommendation: keep both checks in sync — at `src/ui/app.ts:516` the tick resets on `currentTime >= completionTime`, so a one-second clip with long release will play out fully. That is desirable behavior, so the asymmetry between the two checks is intentional and the new fix is right.

### 2. AudioContext resume
The plan acknowledges this in Phase 1, item 1. Verified: `audioContext.resume()` is called downstream inside `SoundfontPlayer.start()` at `src/audio/soundfont/soundfontPlayer.ts:80`, so the first press after a fresh load is already handled. Recommend the plan mark this checklist item as "already present, no change required" rather than implying the fix is needed.

### 3. Scrub-during-playback fix — `wasPlayingBeforeScrub` flag
The current `input` listener at `src/ui/app.ts:160` is:
```
scrubber.addEventListener('input', () => { this.pause(); this.currentTime = ...; this.render(); });
```
This unconditionally pauses. The proposed fix (pause on `input`, resume on `change` when `wasPlayingBeforeScrub` was true) is the cleanest approach. Two minor notes:
- The `change` event on an `<input type="range">` fires on mouseup/change of value, which is exactly the desired resume point. Confirmed correct.
- A keyboard scrub (arrow keys on a focused range input) also fires `input` + `change`, so the same code path handles both interaction modes without special casing. Good.

### 4. 3D pan via OrbitControls
`OrbitControls` has `enablePan = true` by default, and right-click drag / two-finger swipe pan. The plan's claim that "enablePan is enabled by default" is accurate, but in `src/renderers/three/ThreeDRenderer.ts:93` the `OrbitControls` instance is created with explicit options — so the defaults are still in effect unless an `options` object overrides them. The plan correctly proposes setting `this.controls.enablePan = true` explicitly after construction for clarity and to guard against future constructor changes.

The zoom-tracking fix is the most subtle part:
- `OrbitControls` for an orthographic camera does mutate `camera.zoom` (verified: `OrthographicCamera.zoom` is a real property).
- Reading the cumulative `camera.zoom` on the `end` event, applying it to `viewport.zoom`, then resetting `camera.zoom = 1` and calling `frameCamera()` is the correct stabilization pattern. Recommend also clearing the cumulative `camera.zoom` once at the start of each gesture to avoid drift across multi-gesture sessions.

### 5. ThreeDRenderer test redesign
**Resolved.** The updated plan now specifies a configuration test using a mock WebGL context and canvas stub that asserts `controls.enablePan === true` after `mount()` (Phase 3, second-to-last item). The brittle full-pipeline test is preserved as a configuration-only check.

## Assessment of Phases

| Phase | Verdict | Notes |
|---|---|---|
| Phase 1: Play first-press | Approved | Boundary check change is correct; `AudioContext.resume()` is now correctly marked as already present (no change required) — reference to `src/audio/soundfont/soundfontPlayer.ts:80` |
| Phase 2: Resume after scrub | Approved | `wasPlayingBeforeScrub` pattern is clean; covers both mouse and keyboard scrub |
| Phase 3: 3D pan + zoom tracking | Approved | Both `start` and `end` event handlers present, fully eliminating gesture-onset drift |

## Risks Reassessment

- **AudioContext resume timing**: Closed by the existing architecture. The plan now correctly documents this — `resume()` is already called inside `SoundfontPlayer.start()` at `src/audio/soundfont/soundfontPlayer.ts:80`, so Phase 1 item 1 is "verify and document, no change required."
- **OrbitControls zoom drift**: Fully mitigated. The updated plan now includes both:
  - A `start` event handler that resets `camera.zoom = 1` to clear gesture-onset drift.
  - An `end` event handler that syncs `viewport.zoom` and resets `camera.zoom = 1`.
  Together these close the drift vector completely.

## Documentation & Housekeeping

- `DESIGN.md` should document the new pan controls (right-click drag, two-finger swipe) under the 3D interaction section. Plan covers this.
- `CHANGELOG.md` should receive a "Fixed" entry for both bugs and a "Changed" entry for the 3D pan behavior. Plan's completion checklist correctly notes user-facing CHANGELOG.

## Resolution of Prior Recommendations

| Recommendation | Status |
|---|---|
| Add `start`-event handler to reset `camera.zoom = 1` | Resolved — Phase 3, second checklist item |
| Mark `AudioContext.resume()` as already present | Resolved — Phase 1, first checklist item now references `soundfontPlayer.ts:80` and is marked "no change required" |
| Replace brittle WebGL test with config-only test | Resolved — Phase 3, last checklist item specifies mock WebGL/canvas stub |

## Conclusion

The plan is approved. All three recommendations from the initial assessment have been incorporated. The diagnostic analysis remains accurate, the proposed code changes are minimal and architecturally consistent, and the verification checklist is appropriately concrete. No further adjustments are required.
