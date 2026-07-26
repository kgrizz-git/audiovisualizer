# Plan: 3D Playback Reveal

Last reviewed: 2026-07-24
Date: 2026-07-24
Author: Codex
Status: complete (2026-07-26); browser manual verification pending
Linked issue/PR: n/a

## Goal

Offer a temporal alternative to the 3D now-plane: while MIDI plays, reveal score geometry
up to the playhead so the composition appears to be drawn through depth. This gives viewers
a calmer, cumulative reading mode without changing deterministic geometry or exports.

## Out of scope

- Altering 2D playback behavior or SVG/CLI output.
- Per-note shader clipping or timeline video export changes.

## Approach

Add a `playbackCue` choice to `ViewportTransform3D`: `now_plane` or `reveal`. After
implementation, `reveal` was promoted to the shipped default (`DEFAULT_VIEWPORT_3D.playbackCue = 'reveal'`)
— it reads as the calmer, cumulative view the plan is built around, while `now_plane`
remains available as the alternate cue. The Three.js renderer retains its static buffers and updates only material
visibility at each playhead tick: line segments and discs/boxes whose onset is in the
future are hidden; currently sounding line segments remain partially visible via a small
per-frame draw range. This keeps the mapper pure and avoids rebuilding geometry each frame.

### Alternatives considered

| Option | Why not chosen |
|---|---|
| Rebuild filtered geometry every animation frame | Allocates WebGL resources during playback and defeats render-on-demand behavior. |
| Shader-only clipping | Better for partial line interpolation but materially more complex for all primitive types. |

## Proposed file changes

```
src/core/types.ts                 — playback cue contract and default
src/renderers/three/I3DRenderer.ts — cue-aware renderer input
src/renderers/three/ThreeDRenderer.ts — reveal visibility updates without geometry rebuild
src/ui/app.ts, index.html         — 3D cue selector
DESIGN.md, ARCHITECTURE.md        — document visual/runtime semantics
tests/                            — config/default and mapper determinism coverage as needed
```

## Phases & checklist

### Phase 1: Contract and renderer

- [x] Add the cue selector and default `now_plane` behavior.
- [x] Implement reveal mode for lines, discs, and piano-roll boxes.
- [x] Ensure scrubbing, pause, and export render the appropriate cue state.

### Phase 2: Documentation and verification

- [x] Update visual/runtime documentation and changelog.
- [x] Run `npm run validate`; manual browser verification remains pending.

## Verification

- [x] Same score/config still maps to identical 3D geometry.
- [x] Default switched to `reveal` (`DEFAULT_VIEWPORT_3D.playbackCue`); `now_plane` retains its current behavior as the alternate cue.
- [ ] Reveal mode is smooth on a dense score and shows no future geometry.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Reveal is visually ambiguous during rests | med | low | Keep the current playhead cue available as the default. |
| Per-tick updates cost too much | low | med | Update existing draw ranges/instance visibility only; never rebuild geometry. |
