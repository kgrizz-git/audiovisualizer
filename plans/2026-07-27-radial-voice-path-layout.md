# Plan: Radial Voice-Path Layout

NEEDS REVIEW
Last reviewed: 2026-07-27
Date: 2026-07-27
Author: opencode
Status: draft
Linked issue/PR: n/a

## Goal

Add a new polar layout variation ("radial voice paths") where each voice is assigned to a radial spoke and all notes for that voice originate along that spoke. Low-register voices (bass) point downward; high-register voices (violin, piccolo) point upward; middle voices fan outward laterally. Percussion is rendered as concentric circles at radii proportional to onset time, with color representing percussion type.

## Out of scope

- 3D version of this layout (can be a follow-up; 2D first).
- Changes to existing polar_walk or polar_fan layouts.
- Audio/sound changes.

## Approach

This is a new `Variation` variant (e.g. `'radial_voice_paths'`) added to the mapper. The mapper assigns each voice a fixed angular direction based on its median pitch across all 360° of the circle (lowest → 270°/down, highest → 90°/up, and intermediate voices sorted and distributed across the remaining angles). It then renders notes as segments radiating outward from the canvas center. Each segment's angular position is the voice's angle + a small pitch offset, radial start is its onset time, and length is its duration. Dense voice spokes will scale their opacity (`1 / numVoicesAtThisAngle`) to avoid overpowering sparse ones.

Importantly, to keep compatibility with existing 2D and SVG renderers, we will NOT define a new geometry type `GeometryRadialVoicePath`. We will map notes to standard `GeometrySegment` and `GeometryCircle` elements. Percussion notes (detected on channel 10 or track percussion flag, skipping median pitch calculations) will render as concentric full circles (rings) centered at the canvas center with transparent/no fill and colored strokes, as renderers only support full circles rather than partial arcs.

Additionally, we must extend the existing polar branch in `fitGeometryToCanvas()` to support `radial_voice_paths` by calculating the max radius using both segments and circles, scaling the circles' center and radius, and retaining them in the output (relying on the existing polar fitting logic deletes all circles).

### Alternatives considered

| Option | Why not chosen |
|---|---|
| Extend polar_fan with a voice mode | The spoke-per-voice concept is fundamentally different from pitch-class-per-spoke; cleaner as a separate variant |
| Extend polar_walk with voice assignment | polar_walk is a continuous path; radial voice paths are parallel spokes, different geometry |
| Add new geometry type GeometryRadialVoicePath | Unnecessary and breaks the Canvas/SVG renderers which expect standard segments and circles in `GeometryVoicePath[]` |
| Draw partial percussion arcs | Not supported by Canvas/SVG renderers; full concentric circles centered at the canvas center are much simpler and look stunning |

## Proposed file changes

```
src/core/types.ts                          — add 'radial_voice_paths' to Variation union (no new geometry type)
src/core/mapper/scoreMapper.ts             — new mapRadialVoicePaths() function returning standard segments/circles; register in dispatch
src/core/layout/fitGeometry.ts             — handle radial_voice_paths fitting, computing maxRadius with circles, scaling and retaining circles
src/core/legend/legendContent.ts           — add 'radial_voice_paths' to getLegendContent() exhaustiveness check
src/cli/renderMidi.ts                      — add 'radial_voice_paths' to allowed CLI --mode flags
src/renderers/canvas/canvasRenderer.ts     — include 'radial_voice_paths' in line glow condition in drawSegment()
src/ui/app.ts, index.html                  — add 'Radial Voice Paths' to variation selector
src/ui/launchRandomizer.ts                 — add to VARIATIONS array
tests/mapper.test.ts                       — add tests for spoke assignment, segment geometry, percussion rings, and fitting preservation
DESIGN.md                                  — document the new variation's visual rules
ARCHITECTURE.md                            — update variation list in domain contracts
CHANGELOG.md                               — add entry for new layout
```

## Phases & checklist

### Phase 1: Type definitions and mapper skeleton

- [ ] Add `'radial_voice_paths'` to the `Variation` union in `src/core/types.ts` (without any new geometry types).
- [ ] Verify if `GeometryCircle` has an `isPercussion: boolean` field in `src/core/types.ts`. If not, add it.
- [ ] Add empty `mapRadialVoicePaths()` in `scoreMapper.ts` that returns an empty `RenderedGeometry`.
- [ ] Register `'radial_voice_paths'` in the `mapScoreToGeometry()` dispatch in `scoreMapper.ts`.
- [ ] Update `getLegendContent()` in `src/core/legend/legendContent.ts` to support the new variation.
- [ ] Update allowed modes in `src/cli/renderMidi.ts` and line glow check in `src/renderers/canvas/canvasRenderer.ts`.
- [ ] Add to variation selector UI (`index.html` and `src/ui/app.ts`) and randomizer (`src/ui/launchRandomizer.ts`).
- [ ] Verify build passes with empty implementation.

### Phase 2: Voice-to-angle assignment

- [ ] Detect percussion voices (channel 10 or track percussion flag). Skip median pitch computation and routing to spokes for these voices; they will map directly to the concentric-ring path.
- [ ] Compute each voice's median pitch across the score for all non-percussion pitched voices.
- [ ] Map median pitch to angular positions across the full 360° circle: lowest voice → 270° (down), highest → 90° (up), and other intermediate voices sorted by median pitch and distributed evenly.
- [ ] Tie-breaking logic: if two voices share a median pitch, offset their assigned angles by a small fixed amount (e.g., ±2°).
- [ ] Limit spoke overlap: if the number of unique voice angles exceeds 12, group the closest voice pairs to share a spoke angle with a slight radial separation or offset.
- [ ] Add tests in `tests/mapper.test.ts` verifying spoke assignment, tie-breaking, and percussion separation.

### Phase 3: Note segment rendering (pitched voices)

- [ ] For each note in a pitched voice, map to standard `GeometrySegment`:
  - Angular position = voice's assigned angle + `clampedOffset`, where `offset = (note.pitch - voice.medianPitch) * 1°` and `clampedOffset = Math.max(-5°, Math.min(5°, offset))`.
  - Radial start = `note.onset / score.duration * maxRadius`.
  - Radial end = `(note.onset + note.duration) / score.duration * maxRadius`.
  - Color = note pitch hue (reuse `getNoteColor()`).
  - Opacity = scaled as `1 / numVoicesAtThisAngle` to prevent dense voice spokes from visually overpowering sparse ones.
  - Length/stroke width = respects duration or velocity based on visual properties config.
- [ ] Add tests in `tests/mapper.test.ts`: verify segment positions fan slightly based on pitch and verify opacity scaling for dense spokes.

### Phase 4: Percussion concentric rings

- [ ] For percussion notes, map to standard `GeometryCircle`:
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
- [ ] Add tests in `tests/mapper.test.ts`: verify ring radii, transparent fills, and colors matching the percussion families.

### Phase 5: Fitting and integration

- [ ] In `src/core/layout/fitGeometry.ts`, extend the existing polar fitting branch (`if (variation === 'polar_fan' || variation === 'polar_walk' || variation === 'radial_voice_paths')`):
  - Scale both segments and circles, retaining and scaling `circles` in the output geometry.
  - Compute `maxRadius` using both segments and circles:
    `maxRadius = max(...segments.map(s => distance(s.x, s.y, centerX, centerY)), ...circles.map(c => c.radius + distance(c.x, c.y, centerX, centerY)))`
- [ ] Wire up to the 3D mapper (`map3d.ts`) with `base2DVariation()` mapping.
- [ ] Add legend entry showing voice-to-angle assignment.
- [ ] Add a unit test in `tests/layout.test.ts` (or the layout test suite) validating that `fitGeometryToCanvas()` preserves and scales concentric percussion circles for the `radial_voice_paths` variation.
- [ ] Verify determinism: same MIDI input always produces identical geometry.

## Verification

- [ ] Low-register voices (bass, cello) render in the bottom half of the canvas
- [ ] High-register voices (violin, flute, piccolo) render in the top half
- [ ] Middle voices (viola, clarinet) render in the middle-left / middle-right area
- [ ] Test with a 2-voice MIDI file (bass + violin) — verify bass is in the bottom half, violin in the top
- [ ] Test with a score containing only percussion — verify concentric rings appear with correct family colors
- [ ] Test with two voices of identical median pitch — verify they don't completely overlap (offset angularly)
- [ ] Each voice's notes form a coherent radial cluster along its assigned spoke
- [ ] Percussion notes render as concentric rings with radius increasing over time
- [ ] Different percussion types have distinct family colors
- [ ] Test `fitGeometryToCanvas` with percussion circles extending beyond segments — verify circles are preserved and not clipped
- [ ] Test determinism: same MIDI input produces identical output across runs
- [ ] Layout scales correctly to fill the canvas
- [ ] `npm run validate` passes

## Completion checklist

When all phases and verification are done:

- [ ] Update plan `Status:` to `complete` with completion date
- [ ] Move plan to `plans/archive/`
- [ ] Add entry to `CHANGELOG.md` (user-facing)
- [ ] Remove the completed item from `dev-docs/TO_DO.md` (do not just check it off)

## Open questions

- None. (All questions resolved as documented decisions: angular offset is ±1°/semitone clamped to ±5°; percussion uses 6 family groups; percussion rings are full circles; many-voice grouping is deferred).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Too many voices cause overlapping angular assignments | medium | medium | Group voices into register bands; limit to ~12 angular slots |
| Percussion type color mapping is inaccurate for non-GM MIDI | low | low | Use a best-effort GM mapping with a fallback grey for unknown types |
| Radial segments overlap when notes are dense | medium | low | Allow slight angular jitter or opacity blending; document visual behavior |
| Fitting path discards concentric percussion circles | high | high | Explicitly scale and preserve circles in polar fitting logic instead of clearing them |
