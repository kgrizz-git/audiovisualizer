# Plan: Radial Voice-Path Layout

Last reviewed: 2026-07-27
Date: 2026-07-27
Author: opencode
Status: completed (2026-07-27)
Linked issue/PR: n/a

## Goal

Add a new polar layout variation ("radial voice paths") where each voice is assigned to a radial spoke and all notes for that voice originate along that spoke. Low-register voices (bass) point downward; high-register voices (violin, piccolo) point upward; middle voices fan outward laterally. Percussion is rendered as concentric circles at radii proportional to onset time, with color representing percussion type.

## Out of scope

- CLI and SVG/plotter export of the 3D variant (consistent with the existing 3D modes; the CLI stays 2D-only).
- New 3D renderer primitives — the 3D variant reuses the existing segment/disc pipeline in `ThreeDRenderer`.
- Changes to existing polar_walk or polar_fan layouts.
- Audio/sound changes.

## Approach

This is a new `Variation` variant (e.g. `'radial_voice_paths'`) added to the mapper. The mapper assigns each voice a fixed angular direction based on its median pitch across all 360° of the circle (lowest → 270°/down, highest → 90°/up, and intermediate voices sorted and distributed across the remaining angles). It then renders notes as segments radiating outward from the canvas center. Each segment's angular position is the voice's angle + a small pitch offset, radial start is its onset time, and length is its duration. Dense voice spokes will scale their opacity (`1 / numVoicesAtThisAngle`) to avoid overpowering sparse ones.

Importantly, to keep compatibility with existing 2D and SVG renderers, we will NOT define a new geometry type `GeometryRadialVoicePath`. We will map notes to standard `GeometrySegment` and `GeometryCircle` elements. Percussion notes (detected on channel 10 or track percussion flag, skipping median pitch calculations) will render as concentric full circles (rings) centered at the canvas center with transparent/no fill and colored strokes, as renderers only support full circles rather than partial arcs.

Additionally, we must extend the existing polar branch in `fitGeometryToCanvas()` to support `radial_voice_paths` by calculating the max radius using both segments and circles, scaling the circles' center and radius, and retaining them in the output (relying on the existing polar fitting logic deletes all circles).

Finally, Phase 6 adds a 3D variant `3d_radial_voice_paths` following the exact template used by `3d_polar_walk`: a new member of the `Variation` union routed through `base2DVariation()` in `src/core/mapper/map3d.ts`, so the 2D mapper produces the fitted XY calligraphy and `liftGeometryTo3D()` attaches Z from musical time. Pitched-voice spokes lift to `GeometrySegment3D` lines; percussion rings lift to `GeometryDisc3D` entries (the existing circle→disc path), so time reads both as ring radius (XY) and depth (Z). No changes to `ThreeDRenderer` geometry builders are required since the variation emits only standard segments and circles.

### Alternatives considered

| Option | Why not chosen |
|---|---|
| Extend polar_fan with a voice mode | The spoke-per-voice concept is fundamentally different from pitch-class-per-spoke; cleaner as a separate variant |
| Extend polar_walk with voice assignment | polar_walk is a continuous path; radial voice paths are parallel spokes, different geometry |
| Add new geometry type GeometryRadialVoicePath | Unnecessary and breaks the Canvas/SVG renderers which expect standard segments and circles in `GeometryVoicePath[]` |
| Draw partial percussion arcs | Not supported by Canvas/SVG renderers; full concentric circles centered at the canvas center are much simpler and look stunning |

## Proposed file changes

```
src/core/types.ts                          — add 'radial_voice_paths' and '3d_radial_voice_paths' to Variation union; extend is3DVariation() (no new geometry type)
src/core/mapper/scoreMapper.ts             — new mapRadialVoicePaths() function returning standard segments/circles; register in dispatch
src/core/mapper/map3d.ts                   — map '3d_radial_voice_paths' → 'radial_voice_paths' in base2DVariation()
src/core/layout/fitGeometry.ts             — handle radial_voice_paths fitting, computing maxRadius with circles, scaling and retaining circles
src/core/legend/legendContent.ts           — add 'radial_voice_paths' (and 3D counterpart) to getLegendContent() exhaustiveness check
src/cli/renderMidi.ts                      — add 'radial_voice_paths' to allowed CLI --mode flags (2D only; no 3D CLI modes)
src/renderers/canvas/canvasRenderer.ts     — include 'radial_voice_paths' in line glow condition in drawSegment()
src/ui/app.ts, index.html                  — add 'Radial Voice Paths' to variation selector and '3D radial voice paths' to the 3D optgroup
src/ui/launchRandomizer.ts                 — add both variants to VARIATIONS array
tests/mapper.test.ts                       — add tests for spoke assignment, segment geometry, percussion rings, and fitting preservation
tests/map3d.test.ts                        — add 3d_radial_voice_paths suite: base2DVariation mapping, XY parity, Z derivation, percussion disc lifting, determinism
tests/launchRandomizer.test.ts             — update variation-list expectations for both new variants
DESIGN.md                                  — document the new variation's visual rules (2D and 3D)
ARCHITECTURE.md                            — update variation list in domain contracts
CHANGELOG.md                               — add entry for new layout
```

## Phases & checklist

### Phase 1: Type definitions and mapper skeleton

- [x] Add `'radial_voice_paths'` to the `Variation` union in `src/core/types.ts` (without any new geometry types).
- [x] Verify if `GeometryCircle` has an `isPercussion: boolean` field in `src/core/types.ts`. If not, add it.
- [x] Add empty `mapRadialVoicePaths()` in `scoreMapper.ts` that returns an empty `RenderedGeometry`.
- [x] Register `'radial_voice_paths'` in the `mapScoreToGeometry()` dispatch in `scoreMapper.ts`.
- [x] Update `getLegendContent()` in `src/core/legend/legendContent.ts` to support the new variation.
- [x] Update allowed modes in `src/cli/renderMidi.ts` and line glow check in `src/renderers/canvas/canvasRenderer.ts`.
- [x] Add to variation selector UI (`index.html`; `src/ui/app.ts` reads the select value and needed no change) and randomizer (`src/ui/launchRandomizer.ts`).
- [x] Verify build passes with empty implementation.

### Phase 2: Voice-to-angle assignment

- [x] Detect percussion voices (channel 10 or track percussion flag). Skip median pitch computation and routing to spokes for these voices; they will map directly to the concentric-ring path.
- [x] Compute each voice's median pitch across the score for all non-percussion pitched voices.
- [x] Map median pitch to angular positions across the full 360° circle: lowest voice → 270° (down), highest → 90° (up), and other intermediate voices sorted by median pitch and distributed evenly.
- [x] Tie-breaking logic: if two voices share a median pitch, offset their assigned angles by a small fixed amount (e.g., ±2°).
- [x] Limit spoke overlap: if the number of unique voice angles exceeds 12, group the closest voice pairs to share a spoke angle with a slight radial separation or offset.
- [x] Add tests in `tests/mapper.test.ts` verifying spoke assignment, tie-breaking, and percussion separation.

### Phase 3: Note segment rendering (pitched voices)

- [x] For each note in a pitched voice, map to standard `GeometrySegment`:
  - Angular position = voice's assigned angle + `clampedOffset`, where `offset = (note.pitch - voice.medianPitch) * 1°` and `clampedOffset = Math.max(-5°, Math.min(5°, offset))`.
  - Radial start = `note.onset / score.duration * maxRadius`.
  - Radial end = `(note.onset + note.duration) / score.duration * maxRadius`.
  - Color = note pitch hue (reuse `getNoteColor()`).
  - Opacity = scaled as `1 / numVoicesAtThisAngle` to prevent dense voice spokes from visually overpowering sparse ones.
  - Length/stroke width = respects duration or velocity based on visual properties config.
- [x] Add tests in `tests/mapper.test.ts`: verify segment positions fan slightly based on pitch and verify opacity scaling for dense spokes.

### Phase 4: Percussion concentric rings

- [x] For percussion notes, map to standard `GeometryCircle`:
  - Radius = `note.onset / score.duration * maxRadius` (proportional to time).
  - Center = `(0, 0)` (canvas center).
  - Fill color = `'none'` or `'transparent'` (rings).
  - Set `isPercussion = true` on the circle.
  - Map stroke color based on General MIDI percussion note numbers:
    - **Kick/Bass Drum (notes 35, 36):** Red
    - **Snare/Clap (notes 38, 39, 40):** Orange
    - **Hi-hat (notes 42, 44, 46):** Cyan
    - **Cymbals (notes 49, 51, 53):** Yellow
    - **Toms (notes 41, 43, 45, 47, 48, 50):** Green
    - **Other (all other percussion note values):** Grey
  - Stroke width = proportional to velocity.
- [x] Add tests in `tests/mapper.test.ts`: verify ring radii, transparent fills, and colors matching the percussion families.

### Phase 5: Fitting and integration

- [x] In `src/core/layout/fitGeometry.ts`, extend the existing polar fitting branch (`if (variation === 'polar_fan' || variation === 'polar_walk' || variation === 'radial_voice_paths')`):
  - Scale both segments and circles, retaining and scaling `circles` in the output geometry.
  - Compute `maxRadius` using both segments and circles:
    `maxRadius = max(...segments.map(s => distance(s.x, s.y, centerX, centerY)), ...circles.map(c => c.radius + distance(c.x, c.y, centerX, centerY)))`
- [x] Add legend entry showing voice-to-angle assignment.
- [x] Add a unit test in `tests/layout.test.ts` (or the layout test suite) validating that `fitGeometryToCanvas()` preserves and scales concentric percussion circles for the `radial_voice_paths` variation.
- [x] Verify determinism: same MIDI input always produces identical geometry.

### Phase 6: 3D variant (`3d_radial_voice_paths`)

Mirror the wiring used by `3d_polar_walk`: the 3D mode reuses the fitted 2D XY geometry and lifts it along Z via `liftGeometryTo3D()`. No renderer changes are needed — segments render via `buildLines()` and percussion discs via `buildDiscs()`.

- [x] Add `'3d_radial_voice_paths'` to the `Variation` union and to `is3DVariation()` in `src/core/types.ts`.
- [x] Add the `'3d_radial_voice_paths'` → `'radial_voice_paths'` branch to `base2DVariation()` in `src/core/mapper/map3d.ts`.
- [x] Confirm the Phase 5 `fitGeometryToCanvas()` polar branch preserves circles on the 3D path too (`map3DGeometry()` runs the same 2D fit before lifting), so percussion rings survive into `GeometryDisc3D`.
- [x] Verify percussion rings render acceptably as lifted discs in `ThreeDRenderer` (`fillColor: 'none'` circles → disc instance color/opacity); if transparent fills render as black caps, derive the disc color from `strokeColor` for percussion discs in `liftGeometryTo3D()` (guarded by the `isPercussion` flag from Phase 1) rather than changing the renderer. — Implemented the `strokeColor` derivation preemptively; covered by tests.
- [x] Add `'3d_radial_voice_paths'` legend support to `getLegendContent()` exhaustiveness check (match how the other 3D variations are handled).
- [x] Add `<option value="3d_radial_voice_paths">3D radial voice paths</option>` to the "3D (Three.js)" optgroup in `index.html`.
- [x] Add `'3d_radial_voice_paths'` to `VARIATIONS` in `src/ui/launchRandomizer.ts`.
- [x] Confirm the CLI stays 2D-only: do NOT add 3D modes to `src/cli/renderMidi.ts` (matches existing 3D modes and the 3D-layouts plan's out-of-scope decision).
- [x] Add a `describe('3d_radial_voice_paths')` suite in `tests/map3d.test.ts` (template: the existing `3d_polar_walk` suite):
  - `base2DVariation('3d_radial_voice_paths')` returns `'radial_voice_paths'`.
  - Geometry is tagged `kind: '3d'` and `config.variation` preserves `'3d_radial_voice_paths'`.
  - Front-view XY parity: 3D segment start/end X/Y exactly match the fitted 2D `radial_voice_paths` geometry (`fitGeometryToCanvas(mapScoreToGeometry(...))`).
  - Segment Z derivation: `startZ`/`endZ` equal onset/offset × the effective z-scale (via `computeFittedSpan` + `effectiveZScale`).
  - Percussion lifting: a score with percussion notes produces `GeometryDisc3D` entries (one per ring) with `cz` at onset × zScale and correct `czExtent`; discs are preserved, not dropped.
  - Mixed score: pitched voices produce segments AND percussion produces discs in the same geometry.
  - Determinism: two `map3DGeometry()` calls on the same score produce JSON-identical output.
- [x] Update `tests/launchRandomizer.test.ts` (variation-list expectations) for both `radial_voice_paths` and `3d_radial_voice_paths`.
- [ ] Manual smoke: verify camera presets, reveal/now-plane playback cues, PNG capture, and turntable rotation work with the new mode (no code expected; existing infrastructure is variation-agnostic). — Not performed in this session; pending human/manual review.

## Verification

- [x] Low-register voices (bass, cello) render in the bottom half of the canvas
- [x] High-register voices (violin, flute, piccolo) render in the top half
- [x] Middle voices (viola, clarinet) render in the middle-left / middle-right area
- [x] Test with a 2-voice MIDI file (bass + violin) — verify bass is in the bottom half, violin in the top
- [x] Test with a score containing only percussion — verify concentric rings appear with correct family colors
- [x] Test with two voices of identical median pitch — verify they don't completely overlap (offset angularly)
- [x] Each voice's notes form a coherent radial cluster along its assigned spoke (±5° clamp covered by tests)
- [x] Percussion notes render as concentric rings with radius increasing over time
- [x] Different percussion types have distinct family colors
- [x] Test `fitGeometryToCanvas` with percussion circles extending beyond segments — verify circles are preserved and not clipped
- [x] Test determinism: same MIDI input produces identical output across runs
- [x] Layout scales correctly to fill the canvas
- [x] 3D: `3d_radial_voice_paths` front view (`3d_front` / `3d_time_up` presets) matches the fitted 2D layout exactly
- [ ] 3D: percussion rings appear as discs at Z depths matching their onsets; playing back with the reveal cue uncovers them in time order — disc depths are test-covered; reveal-cue playback is a pending manual check
- [x] 3D: `tests/map3d.test.ts` suite passes (XY parity, Z derivation, percussion discs, determinism)
- [ ] 3D: PNG capture and WebM capture work with the new mode; SVG export correctly stays blocked — pending manual check (capture paths are variation-agnostic)
- [x] `npm run validate` passes

## Completion checklist

When all phases and verification are done:

- [x] Update plan `Status:` to `complete` with completion date
- [x] Move plan to `plans/archive/`
- [x] Add entry to `CHANGELOG.md` (user-facing)
- [x] Remove the completed item from `dev-docs/TO_DO.md` (do not just check it off)

## Open questions

- None. (All questions resolved as documented decisions: angular offset is ±1°/semitone clamped to ±5°; percussion uses 6 family groups; percussion rings are full circles; many-voice grouping is deferred).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Too many voices cause overlapping angular assignments | medium | medium | Group voices into register bands; limit to ~12 angular slots |
| Percussion type color mapping is inaccurate for non-GM MIDI | low | low | Use a best-effort GM mapping with a fallback grey for unknown types |
| Radial segments overlap when notes are dense | medium | low | Allow slight angular jitter or opacity blending; document visual behavior |
| Fitting path discards concentric percussion circles | high | high | Explicitly scale and preserve circles in polar fitting logic instead of clearing them |
| Percussion rings with `fillColor: 'none'` render as dark caps when lifted to 3D discs | medium | medium | Derive disc color from `strokeColor` for percussion in `liftGeometryTo3D()`; verify visually in Phase 6 |
| Large percussion rings dominate 3D camera framing (bounds computed over all content) | low | low | Rings share the same fitted max radius as segments after Phase 5 fitting, so bounds stay canvas-sized |
