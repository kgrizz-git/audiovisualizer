# Plan: 3D Calligraphic Score Modes (Three.js)

Last reviewed: 2026-07-24
Date: 2026-07-24
Author: Claude
Status: Phase 1 complete (2026-07-24); Phases 2–3 pending
Linked issue/PR: n/a
Spec: [`plans/specs/2026-07-23-3d-time-slice-modes.md`](specs/2026-07-23-3d-time-slice-modes.md)

## Goal

Add a 3D visualization family where the existing `lines` and `circles` (note halos)
algorithms drive movement in the XY plane while musical time advances along the positive
Z axis. Notes become glowing calligraphic ribbons and floating discs threading through a
dark, atmospheric depth. Rendered with Three.js (WebGL) behind an isolated interface so
the existing Canvas 2D / SVG pipeline for all 2D modes is untouched. The result should be
immediately striking (bloom, a sweeping "now-plane" playhead, onset pulses) and stay
smooth on dense polyphonic scores (geometry batching, render-on-demand).

## Out of scope

- The Phase 2 piano-roll slab mode (`3d_piano_roll`) — sequenced after Phase 1 lands.
- The four deferred XY modes (chromagram column, voice ribbon, velocity spire, frozen
  frame stack) — tracked separately in `dev-docs/TO_DO.md`.
- SVG / plotter export of 3D geometry and CLI (`npm run render`) 3D output — deferred;
  Phase 1 ships PNG (and later WebM) raster capture only.
- Mid-score tempo/meter handling for Z (Z is a pure spatial scale of seconds, BPM-free).

## Approach

Introduce three new `Variation` values (`3d_lines`, `3d_note_halos` in Phase 1;
`3d_piano_roll` in Phase 2). A new pure mapper, `map3DGeometry()`, reuses the existing
interval/heading/cluster math to produce `RenderedGeometry3D` (segments + discs with
XYZ coordinates). A new renderer module, `ThreeDRenderer` implementing `I3DRenderer`,
owns a sibling WebGL `<canvas>` that is shown only when a 3D variation is active.
Three.js and its postprocessing extras are dynamically imported on first 3D activation so
2D-only sessions never download them.

Time maps to Z via a new `zScale` (px/sec) rule config field; XY comes straight from the
existing algorithms, so the calligraphic character is preserved and the 2D mapper is not
touched. Visual identity comes from emissive materials + `UnrealBloomPass`, `FogExp2`, a
graded background, and a translucent now-plane that separates past (full glow) from future
(dim) during playback. Performance comes from merging each voice into one buffer geometry,
instancing discs, capping pixel ratio, and rendering on-demand when idle.

### Alternatives considered

| Option | Why not chosen |
|---|---|
| Software isometric projection (pure TS, no dep) | Cannot sustain 60 fps for Phase 2/3 orbit + chase cam on dense scores; no world-space 3D line thickness. Three.js chosen (spec §3). |
| Extend `RenderedGeometry` in place with optional 3D fields | Muddies the 2D contract consumed by Canvas/SVG renderers; a discriminated union (`AnyRenderedGeometry`) keeps 2D paths clean. |
| Eagerly bundle Three.js | ~600 KB parsed on every load for a mode most sessions won't use; dynamic import defers the cost. |
| CSS 3D transforms | Doesn't scale past ~200 DOM nodes; no capture path (spec §3C in brainstorm). |

## Proposed file changes

```
src/core/types.ts               — add Variation values; RuleConfig.zScale; GeometrySegment3D,
                                   GeometryDisc3D, RenderedGeometry3D, ViewportTransform3D,
                                   DEFAULT_VIEWPORT_3D; AnyRenderedGeometry union + is3D discriminant.
src/core/mapper/map3d.ts        — new pure map3DGeometry(): reuse heading/cluster/interval
                                   helpers; emit XYZ segments (3d_lines) and discs (3d_note_halos).
src/core/mapper/index.ts        — route to map3DGeometry when variation is a 3D type.
src/renderers/three/I3DRenderer.ts     — renderer interface (mount/setGeometry/setViewport/
                                          stepPlayhead/capturePNG/dispose).
src/renderers/three/ThreeDRenderer.ts  — Three.js implementation: scene, ortho camera, merged
                                          line geometry, instanced discs, bloom composer, fog,
                                          now-plane, onset pulse, presets, render-on-demand loop.
src/renderers/three/presets.ts         — named camera presets (isometric/front/side/birds-eye).
src/ui/app.ts                   — lazy import + lifecycle of ThreeDRenderer; show/hide 3D canvas
                                   vs 2D canvas on variation change; zScale + bloom + preset controls;
                                   drive stepPlayhead from the playback clock; PNG export routing.
index.html                      — 3D canvas element; Section controls (variation options, zScale,
                                   bloom, camera preset dropdown/HUD).
src/ui/styles/main.css          — 3D canvas sizing/layering; 3D HUD badge.
src/core/legend/*               — legend strings for 3D axes (X/Y = path, Z = time).
tests/map3d.test.ts             — new mapper unit tests (deterministic XYZ, gap Z-advance, polyphony).
tests/viewport3d.test.ts        — DEFAULT_VIEWPORT_3D + preset azimuth/elevation math.
DESIGN.md, ARCHITECTURE.md, CHANGELOG.md — document the mode, contracts, dep, and feature.
package.json                    — add `three` (and `@types/three` dev).
```

## Phases & checklist

### Phase 0: Dependency & scaffolding

- [x] Add `three` + `@types/three`; confirm dynamic `import('three')` chunk-splits in the
      Vite build (2D bundle size unchanged). Verified: main chunk 89 KB, Three.js in a
      separate 509 KB lazy chunk loaded only on first 3D activation.
- [x] Add `src/renderers/three/` with `I3DRenderer` and a `ThreeDRenderer` that mounts a
      canvas, renders fog + graded background, and disposes cleanly.
- [x] Wire `app.ts` to swap between the 2D canvas and the 3D canvas on variation change,
      lazy-importing the renderer only on first 3D activation.

### Phase 1: 3D lines & note halos (core feature)

- [x] Types: `3d_lines` / `3d_note_halos` variations, `RuleConfig.zScale`,
      `GeometrySegment3D`, `GeometryDisc3D`, `RenderedGeometry3D`, `AnyRenderedGeometry`,
      `ViewportTransform3D`, `CameraPreset3D`, `is3DVariation()`, `isRenderedGeometry3D()`.
- [x] `map3DGeometry()`: reuses the 2D `lines`/`circles` mapper (all heading/cluster/interval
      logic), fits to canvas, then lifts XY to XYZ. **Deviation from spec:** Z is normalized
      to the canvas (`effectiveZScale()`: total depth ≈ width × `zScale`/100) rather than raw
      `onset × zScale` px/sec — raw px/sec made long scores an unviewable tunnel that hid the
      note halos entirely (found during verification). `zScale` is now a time-depth factor.
- [x] `ThreeDRenderer`: merged line geometry via `LineSegments2`/`LineMaterial` (vertex
      colors, velocity-scaled width), instanced discs (`InstancedMesh` fill + ring).
- [x] Bloom (`EffectComposer` + `UnrealBloomPass`), `FogExp2`, graded background,
      ACES tone mapping + sRGB, MSAA (`antialias: true`).
- [x] Now-plane playhead: sweeps at `t × zScale`; shown during playback/scrub, hidden at
      full-score view. **Deferred:** per-note past/future dimming (needs custom shader).
- [ ] Onset pulse on now-plane crossing — **deferred to Phase 2** (needs a per-instance
      shader; the sweeping now-plane is the Phase 1 temporal cue).
- [x] Fixed camera presets (isometric/front/side/birds-eye) via ortho camera + sidebar select.
- [x] `zScale` (Time depth) and bloom (Glow) sidebar controls; 3D-aware legend.
- [x] PNG export via `capturePNG()` (canvas `toBlob`, `preserveDrawingBuffer`).
- [x] Performance: cap pixel ratio ≤ 2; on-demand rendering (mutators render one frame;
      playback tick only moves the now-plane); `dispose()` releases GPU resources.
- [x] Tests: `map3d.test.ts` (deterministic XYZ, depth normalization, discs at onset,
      front-view matches fitted 2D, color/width passthrough). `viewport3d.test.ts` not
      written — preset azimuth/elevation are static table data covered by the full build.
- [x] Docs: DESIGN.md (mode + Z semantics + polish), ARCHITECTURE.md (new contracts, dep,
      renderer boundary), CHANGELOG.md (minor feature).

### Phase 2: Orbit + piano-roll slab

- [ ] `OrbitControls`; manual orbit suspends preset snap (mirrors 2D auto-zoom suspend).
- [ ] Serialize `ViewportTransform3D` {azimuth, elevation, zoom, pan} for reproducible framing.
- [ ] `3d_piano_roll` variation: pitch × voice × time boxes via `InstancedMesh`.
- [ ] Grounding grid + parallax particle field (deterministic seed).
- [ ] Optional: projected-line SVG export for 3D (evaluate feasibility).

### Phase 3: Cinematic cameras & 3D auto-follow

- [ ] Chase cam locked to playhead Z with configurable `chaseLead`.
- [ ] **3D auto-zoom / auto-pan** (toggle, like the 2D auto-zoom): during playback, frame
      the active-note bounding box over a symmetric time window and lerp the camera to keep
      it centered, easing back to the full-solid view during silence. Reuse the 2D windowing
      concept (`calculateActiveNotesBoundingBox` / `calculateWindowSeconds`) but compute a 3D
      box (include Z) and drive camera target + ortho scale instead of a 2D pan/zoom matrix.
      **Enforce a higher minimum time window than 2D** — a too-short 3D window whips the
      camera through depth and reads as nauseating; clamp to a larger floor (tune during
      implementation, e.g. ≥ 2–4 s or ≥ 1 bar). Manual orbit suspends it (mirrors 2D).
- [ ] Free camera (detached azimuth/elevation/roll/position controls).
- [ ] Idle turntable auto-rotate.
- [ ] Turntable / playback-pass WebM capture via `MediaRecorder`.

## Verification

- [ ] `npm run validate` passes (Vitest + strict TS + production build) at each phase.
- [ ] 2D-only production bundle size is unchanged (Three.js is a separate lazy chunk) —
      confirm in the Vite build output.
- [ ] `map3DGeometry()` is pure and deterministic: same score+config → identical XYZ
      (unit-tested), matching the mapper determinism rule in AGENTS.md.
- [ ] Manual: load the Bach prelude demo, switch to `3d_lines` and `3d_note_halos`, verify
      bloom + now-plane + onset pulses during playback, cycle camera presets, export PNG.
- [ ] Manual perf: dense score holds interactive frame rate during playback/orbit; idle
      CPU/GPU drops to ~zero (render-on-demand); no WebGL context/memory leak on repeated
      variation switching (check `renderer.info.memory`).

## Open questions

- [ ] `TubeGeometry` ribbons vs `LineSegments2` for Phase 1 lines — ribbons look richer but
      cost more vertices; decide during Phase 1 spike (default to `LineSegments2`, upgrade
      to tubes if perf allows).
- [ ] Orthographic (scale-invariant, cleaner for presets) vs perspective (better depth cue
      for orbit) camera — start orthographic Phase 1, revisit at Phase 2 orbit.
- [ ] One `3d_score` variation with a sub-encoding option vs one `Variation` per layout —
      current plan uses one variation per layout for UI simplicity.
- [ ] Should `zScale` be BPM-relative (bars-deep) instead of seconds-deep? Kept seconds for
      Phase 1 (BPM-free, matches `lengthScale`); revisit if musical depth reads better.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Three.js bloats the shipped bundle | med | med | Dynamic import; named tree-shaken imports; verify 2D bundle unchanged in Verification. |
| Dense scores drop frames during orbit/playback | med | high | Merge-per-voice geometry, instanced discs, cap pixel ratio, half-res bloom, quality toggle, render-on-demand. |
| WebGL GPU-memory leak on repeated switching | med | med | Enforce `dispose()`; assert `renderer.info.memory` stable in manual perf check. |
| Bloom + saturated hues clip to white | med | low | ACES tone mapping + sRGB; emissive-only bloom threshold; user bloom-strength control. |
| Z axis reads ambiguously ("which way is time?") | med | med | Now-plane past/future contrast, axis indicator, time-forward Front preset (spec readability §6). |
| Breaking the 2D `RenderedGeometry` contract | low | high | Discriminated `AnyRenderedGeometry` union; 2D renderers never see 3D geometry; existing tests stay green. |
| No SVG/plotter parity for 3D (breaks "preview = SVG export" invariant) | high | low | Explicitly out of scope for Phase 1; documented; PNG/WebM capture instead; SVG revisited Phase 2. |
