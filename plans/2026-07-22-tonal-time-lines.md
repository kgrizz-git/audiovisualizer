# Plan: Tonal Time Lines Display Mode

Last reviewed: 2026-07-22
Date: 2026-07-22
Author: Codex
Status: complete
Linked issue/PR: n/a

## Goal

Add a fourth display mode that makes musical time immediately legible: each sampled
instant becomes one full-width horizontal line, ordered from the top of the canvas to
the bottom. The line color represents the aggregate pitch color sounding at that time.

## Definition

This mode is named `tonal_time_lines`. “Tonality” here means a **pitch-class color
centroid**, not a detected key or chord label:

1. Divide score duration into one sample per output pixel row (or an explicit density
   control for large exports).
2. At each sample, include every note whose sounding interval overlaps that time bin.
3. Convert each included note to its existing mapped hue, including the voice hue offset.
4. Calculate a circular, velocity- and overlap-weighted mean of those hues. Circular
   averaging preserves the continuity of the rainbow hue loop.
5. Draw a full-width 1px horizontal band at that row using the resulting hue. Silence
   uses a low-contrast neutral line derived from the selected background, preserving the
   time axis without falsely assigning it a pitch.

The first row is time zero; the final row is score duration. The visual is deterministic
for a score, rule configuration, canvas size, and selected density.

## Out of scope

- Key, mode, chord, or harmonic-function detection.
- Audio-spectrum analysis or audio-file input.
- Interpolating unplayed pitches between note events.

## Approach

Add an explicit geometry band type rather than overloading note segments. The mapper
will calculate bands in pure TypeScript; Canvas and SVG will render the same bands.
This keeps exports, animation, fitting, legends, and tests consistent.

### Alternatives considered

| Option | Why not chosen |
|---|---|
| Arithmetic RGB/HSL average | Hue wraps at 0°/360° and produces incorrect mixed colors. |
| Infer a chord or key per row | Requires a separate, uncertain music-analysis model; not needed for a truthful first version. |
| One line per note onset | Omits sustained harmony and makes time density dependent on arrangement. |

## Proposed file changes

```text
src/core/types.ts                 — add tonal-time variation and geometry-band contract
src/core/mapper/scoreMapper.ts    — sample active notes and calculate circular hue centroids
src/renderers/canvas/...          — draw/reveal bands according to score time
src/renderers/svg/...             — serialize bands as horizontal vector lines
src/ui/app.ts, index.html         — expose display mode and optional density control
DESIGN.md                         — document semantics and silence treatment
tests/mapper.test.ts              — test active-note weighting, silence, and determinism
tests/svg.test.ts                 — test tonal-band SVG output
```

## Phases & checklist

### Phase 1: Domain model and mapper

- [x] Add `tonal_time_lines` and an immutable band geometry type.
- [x] Implement active-note overlap calculation and circular weighted hue mean.
- [x] Define a neutral, deterministic silence-band style.

### Phase 2: Render and interaction

- [x] Render bands in Canvas and SVG.
- [x] Synchronize progressive reveal to score time.
- [x] Add a display selector option and density control with safe defaults.

### Phase 3: Verification

- [x] Unit test single-note, chord, octave-equivalent, hue-wrap, and silence cases.
- [x] Verify full bands remain inside fitted preview and export bounds.
- [x] Run `npm run validate`.

## Open questions

- [ ] Should the initial density be fixed to one band per canvas pixel or capped for
  performance on exceptionally tall SVG exports? Owner: user/product decision.
- [ ] Should average background color use the same time-weighted hue centroid in this
  mode, rather than the current note-count average? Owner: implementation review.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Dense scores make sampling expensive | medium | medium | Sweep sorted intervals once; cap configurable band count. |
| “Tonality” suggests key detection | medium | medium | Label the UI and legend “average active pitch color.” |
| Silence appears as missing data | low | low | Render a subtle neutral band rather than omitting rows. |
