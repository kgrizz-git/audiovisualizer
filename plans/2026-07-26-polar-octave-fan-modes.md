# Plan: Polar Octave-Fan Display Modes

Last reviewed: 2026-07-26
Date: 2026-07-26
Author: opencode
Status: draft
Linked issue/PR: n/a
Spec: [`plans/specs/2026-07-26-polar-octave-fan-modes.md`](specs/2026-07-26-polar-octave-fan-modes.md)
Review: [`tmp/2026-07-26T1133-polar-octave-fan-modes-assessment.md`](../tmp/2026-07-26T1133-polar-octave-fan-modes-assessment.md) — six revisions integrated below. Independent assessment findings also integrated: silent-failure guard, symmetric-bounds fitter, test fixture guidance, legend switch-case format, CLI end-to-end verification.

## Goal

Add a 2D `polar_fan` variation and its 3D sibling `3d_polar_fan` where each note becomes
a straight segment radiating from the canvas center, rotated by its pitch class (an octave
spans 360°, so 30° per semitone and 12 fixed spokes) and extended by its duration (Euclidean
length = `note.duration × lengthScale`). Chords fan as multiple spokes at once; voices all
share the origin and radiate outward instead of walking forward. This gives the studio a
complementary "rose" reading of a score where tonal centers and octave equivalence are
immediately visible — a desideratum raised in dev conversation that the interval-plus-
heading family cannot surface.

## Out of scope

- `circles` (note-halo) analog of polar fan. The polar encoding is line-segment-shaped by
  construction; a "rings" variant is a separate future spec.
- `3d_polar_fan_spheres` variant — no 2D `circles` analog to lift.
- Octave-as-radius encoding (`octaveFanRing`). Spec §1.2 / open question 4.4 deferred this
  to a separate spec.
- CLI 3D SVG/plotter export — follows the existing 3D deferred-export policy (PNG/WebM only).
- Changing the 2D `lines`/`circles` mapper internals. `polar_fan` is a *new* branch in
  `mapScoreToGeometry`, not a refactor of the interval path.

## Approach

The polar mapper is implemented as a **new branch inside `mapScoreToGeometry`** rather
than as a separate file: it shares existing `getNoteColor`, `getVisualPitch`, per-voice
stroke width, and `quantizeNote` plumbing, so adding it elsewhere would duplicate code.
The branch produces segments only (no circles) per voice, all originating at the canvas
center. The `chordLayout: 'polyphony'` fast path (`mapPolyphonicLineSegments`) is bypassed
for `polar_fan` — the interval math it uses has no analog here.

3D `3d_polar_fan` follows the same lift pattern as `3d_lines` and
`3d_note_halos`/`3d_note_spheres`: run the new 2D branch via a `base2DVariation()` mapping,
fit XY to the canvas, then lift through depth along Z by note onset via the existing
`liftGeometryTo3D()`. No new 3D-specific mapper function is needed — unlike `3d_piano_roll`,
this mode has a 2D XY counterpart, so `liftGeometryTo3D` carries Z correctly with no extra
code.

### Alternatives considered

| Option | Why not chosen |
|---|---|
| Separate mapper file `src/core/mapper/polarFan.ts` | Duplicates `getNoteColor`/`quantizeNote`/stroke-width plumbing; a new branch in `scoreMapper.ts:137` (next to the existing `vertical_tone` and `tonal_time_lines` branches) reuses shared helpers and keeps switching in one place. |
| Reuse `mapPolyphonicLineSegments` with interval turn disabled | That helper is built around an advancing cursor and interval-based headings; the polar rule (constant center origin, pitch-class angle) is fundamentally different and trying to bolt it on would harm the interval path's clean contract. |
| Compute angles from absolute MIDI mod 360° | Creates a slowly rotating sweep rather than 12 fixed spokes; loses the "octave-equivalence rose" reading the spec is designed to surface. Spec §1.1 locked pitch-class modular; we keep that. |

## Proposed file changes

```
src/core/types.ts                  — add 'polar_fan' | '3d_polar_fan' to Variation;
                                     extend is3DVariation() to include '3d_polar_fan'.
src/core/mapper/scoreMapper.ts     — new 'polar_fan' branch inside mapScoreToGeometry:
                                     per-voice segments radiating from the canvas center
                                     {width/2, height/2}, angle = transposedPitchClass × 30°
                                     (via getVisualPitch(note, config) % 12 so transpose is
                                     honored — raw note.pitchClass is the MIDI source value
                                     and would desync spoke angle from note color), length =
                                     max(minSegmentLength, duration × lengthScale). One
                                     GeometrySegment per note (no attack/body/release
                                     subdivision; that concept lives only in the audio
                                     envelope engine). chordLayout polyphony fast path is
                                     bypassed for this variation (interval math does not
                                     apply). The 'gap' role is never produced for this
                                     variation (cursor never moves between notes), so
                                     voices stay spoke-only with no inter-note connectors.
                                     Add a defensive `else` clause at the end of the
                                     variation chain to throw on unhandled variations.
src/core/layout/fitGeometry.ts     — add a polar_fan-specific branch in fitGeometryToCanvas
                                     that computes bounds symmetrically around the origin
                                     (width/2, height/2) so the fitter does not shift the
                                     origin. This preserves the "voices start at the center
                                     and move out" contract from the user briefing.
src/core/mapper/map3d.ts           — base2DVariation(): route '3d_polar_fan' → 'polar_fan'
                                     via an explicit if-branch (clearer than extending the
                                     existing ternary). No new map3DPolarFan() —
                                     liftGeometryTo3D() already converts 2D segments to 3D
                                     with Z = onset × zScale and Z extent = duration × zScale
                                     (matches spec §1).
src/core/legend/legendContent.ts   — new 'polar_fan' and '3d_polar_fan' cases describing
                                     the spoke mapping, length rule, shared-origin voices,
                                     and (for 3D) Z = onset.
src/renderers/canvas/              — extend the line-glow predicate at canvasRenderer.ts:101
  canvasRenderer.ts                  from `variation === 'lines'` to
                                     `variation === 'lines' || variation === 'polar_fan'`
                                     so the 2D spokes share the line family's neon identity.
src/cli/renderMidi.ts              — add 'polar_fan' to the allowed --mode enum array
                                     (renderMidi.ts:67) and the --help text. 3D variations
                                     stay excluded (CLI is 2D/SVG only); polar_fan is a 2D
                                     SVG-exportable mode and must be reachable from CLI.
index.html                         — add two <option> entries to the variation-select
                                     dropdown, one in the top 2D group and one in the
                                     optgroup 3D (Three.js), mirroring the 3d_lines entry.
tests/mapper.test.ts               — new 'polar_fan' cases asserting the spoke contract:
                                     C4 single note → segment from {w/2,h/2} to
                                     {w/2 + L, h/2} (θ=0, L=duration×lengthScale);
                                     C-major triad (C4/E4/G4 simultaneous) → 3 segments at
                                     0°/120°/210° (C=0°, E=4×30°=120°, G=7×30°=210°);
                                     shared origin; transpose shifted by ±2 semitones
                                     rotates spokes by ±60° (no color/angle desync);
                                     identical input → identical output across runs.
tests/map3d.test.ts                — extend with '3d_polar_fan' cases asserting XY parity
                                     with polar_fan and Z extent = duration × zScale.
DESIGN.md                          — document the polar_fan / 3d_polar_fan visual rule as a
                                     new variation entry (radians of pitch class, length =
                                     duration, shared-origin voices, 3D Z = onset).
ARCHITECTURE.md                    — note the new branches in the scoreMapper and
                                     map3DGeometry contracts; add the variation to the
                                     is3DVariation/base2DVariation routing table.
CHANGELOG.md                       — 'Added' entry under Unreleased for two new user-facing
                                     variations. SemVer: MINOR.
```

## Phases & checklist

### Phase 1: 2D `polar_fan` mapper

- [ ] Extend `Variation` with `'polar_fan'` in `src/core/types.ts:1`. Leave
      `is3DVariation()` untouched in this phase (3D comes in Phase 3).
- [ ] Add a new `else if (config.variation === 'polar_fan')` branch inside the
      `notes.forEach` callback in `src/core/mapper/scoreMapper.ts`, after the `vertical_tone`
      branch (which ends at line 248). The branch goes between the closing brace of
      `vertical_tone` and the `prevNote = note` statement. Each note:
      - Compute the **transposed** pitch class via the existing helper:
        `const visualPitch = getVisualPitch(note, config);` (already applies
        `transposeSemitones`, scoreMapper.ts:48-50) then
        `const transposedPitchClass = visualPitch % 12;` and
        `const angle = (transposedPitchClass * 30 * Math.PI) / 180;`.
        Raw `note.pitchClass` is the *un-transposed* MIDI source value and must NOT be
        used directly, or the spoke would desync from `getNoteColor` (which sources hue
        from `getVisualPitch`) whenever `transposeSemitones !== 0` (review finding #1).
        Note: `getVisualPitch` clamps the result to 0..127, so extreme transposition
        values are bounded (e.g., pitch 120 + transpose 20 = clamped to 127, pitchClass 7).
      - Compute `length = Math.max(config.minSegmentLength, note.duration * config.lengthScale)`.
        Same formula as the existing `lines`/`circles` branch (scoreMapper.ts:181).
      - Compute `origin = { x: targetWidth / 2, y: targetHeight / 2 }`. Recompute per track
        so nothing leaks; do **not** call `getInitialCursor` — `originMode` is not consulted
        for this variation (spec §1.2).
      - Build one `GeometrySegment` per note:
        `{ start: origin, end: { x: origin.x + cos(angle)*length,
        y: origin.y + sin(angle)*length }, color: getNoteColor(note, config), width:
        strokeWidthBase + (note.velocity/127)*strokeWidthScale, opacity: 0.9, note }`.
        Mirrors the geometry of the `lines` branch (scoreMapper.ts:196-203). Do **not**
        subdivide into attack/body/release segments — `GeometrySegment.role` is typed
        `'note' | 'gap'` (types.ts:86); the three-role concept lives only in the audio
        envelope engine and does not exist in the visual geometry layer (review finding
        #4). Leave `role` undefined (implied `'note'`).
      - Skip `gapPolicy` handling entirely — do not call `addGapSegment` or
        `advanceCursorForGap`. No `'gap'`-role segments are emitted.
      - Skip `applyIntervalTurn`. There is no heading to maintain between notes.
      - The `chordLayout === 'polyphony'` fast path (`mapPolyphonicLineSegments`) is
        automatically bypassed because `polar_fan !== 'lines'` — the code structure at
        scoreMapper.ts:173 routes non-`lines` variations into the `else` block containing
        the `notes.forEach` loop. No explicit guard is needed.
- [ ] Add a defensive `else` clause immediately after the `vertical_tone` block closes
      (line 248) and before `prevNote = note` (line 250) in `scoreMapper.ts`. The clause
      throws an error for unhandled variations:
      ```typescript
      } else {
        throw new Error(`Unhandled variation: ${config.variation}`);
      }
      ```
      This catches silent failures if a future variation is added but the branch is missing
      or misspelled (e.g., `'polar-fan'` instead of `'polar_fan'`).
- [ ] Confirm `circles`/`bands` arrays stay empty for `polar_fan` voices (segments-only).
- [ ] Add legend case `polar_fan` in `src/core/legend/legendContent.ts:20`. Add
      `case 'polar_fan':` to the switch statement, returning a `LegendContent` object.
      Include the standard `hue` and `...transpose` lines (matching the pattern used by
      `lines` and `circles`), then add the polar-specific lines:
      `'Pitch class → spoke angle (octave = 360°)'`, `'Duration → segment length'`,
      `'Velocity → stroke weight'`, `'Voices share the canvas center'`,
      `'Chords fan from the origin'`. The `3d_polar_fan` legend case is deferred to Phase 3.
- [ ] Modify `src/core/layout/fitGeometry.ts` to handle `polar_fan` specially: compute
      bounds symmetrically around the origin `(width/2, height/2)` so the fitter does not
      shift the origin. Add a branch at the top of `fitGeometryToCanvas`:
      ```typescript
      if (geometry.config.variation === 'polar_fan') {
        // Note: 3d_polar_fan routes through polar_fan via base2DVariation() before reaching
        // fitGeometryToCanvas, so we only check polar_fan here.
        const segments = geometry.voicePaths.flatMap((path) => path.segments);
        if (segments.length === 0) return { ...geometry, width, height };

        const origin = { x: geometry.width / 2, y: geometry.height / 2 };
        const maxRadius = segments.reduce((max, seg) => {
          const distStart = Math.hypot(seg.start.x - origin.x, seg.start.y - origin.y);
          const distEnd = Math.hypot(seg.end.x - origin.x, seg.end.y - origin.y);
          return Math.max(max, distStart, distEnd);
        }, 0);

        if (maxRadius === 0) return { ...geometry, width, height };

        const scale = Math.min((width - padding * 2) / (2 * maxRadius), (height - padding * 2) / (2 * maxRadius));
        const point = (x: number, y: number) => ({
          x: (x - origin.x) * scale + width / 2,
          y: (y - origin.y) * scale + height / 2
        });

        return {
          ...geometry, width, height,
          voicePaths: geometry.voicePaths.map((path) => ({
            ...path,
            segments: path.segments.map((segment) => ({
              ...segment,
              start: point(segment.start.x, segment.start.y),
              end: point(segment.end.x, segment.end.y),
              width: Math.max(0.5, segment.width * scale),
            })),
            circles: [], // polar_fan has no circles
          })),
        };
      }
      ```
      This preserves the center origin (user briefing: "voices start at the center and move
      out") while still fitting the geometry to the canvas. The implementation includes:
      empty geometry guard, maxRadius computation, stroke width scaling, and config
      preservation via spread. Test with an asymmetric score (e.g., only C notes) to confirm
      the origin stays at the canvas center.

### Phase 2: UI wiring, CLI, glow, and 2D verification

- [ ] Add `<option value="polar_fan">Polar octave fan</option>` to the 2D group in the
      `variation-select` dropdown (`index.html:59`), between `tonal_time_lines` and the
      3D `optgroup`.
- [ ] Confirm `app.ts`'s existing variation-select handler (`src/ui/app.ts:87`) routes
      through `updateCanvasMode()` and renders the new variation with no extra wiring —
      `is3DVariation('polar_fan')` is false, so the 2D Canvas path is automatic.
- [ ] **CLI**: add `'polar_fan'` to the allowed-mode enum array in
      `src/cli/renderMidi.ts:67` and to the `--help` description at renderMidi.ts:30-ish.
      3D variations stay excluded — the CLI emits 2D SVG, but `polar_fan` is a 2D
      SVG-exportable mode and must be reachable from `npm run render -- --mode polar_fan`
      (review finding #3).
- [ ] **Canvas glow**: extend the line-glow predicate at
      `src/renderers/canvas/canvasRenderer.ts:101` from `variation === 'lines'` to
      `variation === 'lines' || variation === 'polar_fan'` so the spokes share the line
      family's neon identity (review finding #6). Manually confirm the spokes don't wash
      out on a dense chord; revisit with a tuned `shadowBlur` multiplier if they do.
- [ ] Add tests in `tests/mapper.test.ts` covering:
      - **Test fixtures**: create inline fixtures following the pattern in
        `tests/mapper.test.ts:35-50`. For single-note tests, construct a `Score` with one
        track and one `NoteEvent`. For triad tests, construct a `Score` with one track and
        three `NoteEvent`s at the same onset. For unison tests, construct a `Score` with
        two tracks, each with one `NoteEvent` at the same onset and pitch.
      - **Guard test**: assert that `mapScoreToGeometry(score, {variation:'polar_fan',...})`
        produces at least one segment for a non-empty score. This catches silent failures
        if the branch is missing or misspelled (e.g., `'polar-fan'` instead of `'polar_fan'`).
      - Single C4 note (pitchClass 0) at (w/2, h/2) → segment endpoint at (w/2 + L, h/2)
        where L = duration × lengthScale. (`L == minSegmentLength` when duration is tiny.)
      - C-major triad (C4/E4/G4) at the same onset → three segments at 0°, 120°, 210°
        (C4 pitchClass 0 × 30° = 0°, E4 pitchClass 4 × 30° = 120°, G4 pitchClass 7 × 30° = 210°),
        all sharing the same start, each with its own duration-derived length.
      - **Transpose parity**: same C4 note with `transposeSemitones = +2` produces a
        segment at 60° (D's spoke) whose color equals D's hue — guards against the
        color/angle desync review finding #1 surfaced.
      - Two voices both playing middle C simultaneously → two visually overlapping
        segments at θ = 0° sharing start and end (the unison case; spec §4.2 keep-all).
      - **Asymmetric score origin**: a score with only C notes (all on the 0° spoke)
        produces segments whose start points remain at the canvas center `(width/2, height/2)`
        after `fitGeometryToCanvas`. This guards against the fitter shifting the origin.
      - Determinism: invoking `mapScoreToGeometry(score, config)` twice with the same
        inputs yields deep-equal output (mirrors `tests/map3d.test.ts` determinism check).
      - No `'gap'`-role segments emitted regardless of `gapPolicy` setting.
      - **Empty circles/bands**: assert that `voicePaths[i].circles.length === 0` for all
        voices and `bands.length === 0` for the geometry, confirming polar_fan produces
        segments only (no circles or tonal-time-lines bands).
- [ ] Run `npm run validate`. Fix any TS strict regressions; confirm the production build
      picks up the new variation without changing the 2D bundle size for sessions that don't
      use it (no new eager dependency).

### Phase 3: 3D `3d_polar_fan` (XY + Z lift)

- [ ] Extend `Variation` with `'3d_polar_fan'` and add it to `is3DVariation()` in
      `src/core/types.ts:1,12`.
- [ ] Extend `base2DVariation()` in `src/core/mapper/map3d.ts:29` to route
      `'3d_polar_fan'` → `'polar_fan'` using an explicit if-branch rather than extending
      the binary ternary (clearer with three cases):
      ```typescript
      if (variation === '3d_note_halos' || variation === '3d_note_spheres') return 'circles';
      if (variation === '3d_polar_fan') return 'polar_fan';
      return 'lines';
      ```
      No new mapper function: `map3DGeometry()`'s existing non-piano-roll flow
      (map3d.ts:204-217) already runs the 2D mapper with the config's variation swapped,
      fits XY, computes `effectiveZScale`, and calls `liftGeometryTo3D()` to attach
      Z = onset × zScale with Z extent = duration × zScale (spec §1, map3d.ts:50-52,69-70).
- [ ] Add `3d_polar_fan` legend entry in `legendContent.ts` modeled on `3d_lines`
      (legendContent.ts:50-61). Include the standard `hue` and `...transpose` lines
      (matching `3d_lines`), then add: `'X / Y → polar fan (pitch class × 30°)'`,
      `'Z (depth) → onset time'`, `'Duration → segment length'`,
      `'Now-plane → current playback moment'`.
- [ ] Add `<option value="3d_polar_fan">3D polar octave fan</option>` to the 3D
      `optgroup` in `index.html:59`. The `app.ts` variation-select handler routes through
      `updateCanvasMode()`, which uses `is3DVariation()` to determine the renderer path.
      After Phase 3 extends `is3DVariation()` to include `'3d_polar_fan'`, the 3D renderer
      path is automatic — no new UI hook needed.
- [ ] Extend `tests/map3d.test.ts` with `3d_polar_fan` cases:
      - XY parity: `map3DGeometry(score, {variation:'3d_polar_fan',...})` produces
        segments whose `startX/startY/endX/endY` equal the 2D `polar_fan` `start/end`
        values (post-fit). This mirrors the existing `3d_lines` ↔ `lines` parity test.
      - Z extent: a note with onset τ and duration δ gets `startZ = τ*zScale`,
        `endZ = (τ+δ)*zScale`.
      - Determinism: identical inputs → identical XYZ output.
- [ ] Run `npm run validate` again; confirm 2D bundle and Three.js lazy chunk unaffected.

### Phase 4: Documentation and changelog

- [ ] Add a paragraph to `DESIGN.md` describing the polar_fan visual rule (pitch class →
      spoke, duration → length, shared-origin voices, chords fan, no gap segments) and the
      3D Z = onset counterpart. Match the structure used for the `3d_piano_roll` entry.
      Reference the spec (`plans/specs/2026-07-26-polar-octave-fan-modes.md`) as the source
      of truth for the visual rule, so the DESIGN.md entry stays in sync.
- [ ] Update `ARCHITECTURE.md` near the `map3DGeometry`/`base2DVariation` section
      (currently references `lines`/`circles`/`piano_roll` routing) to add the
      `'3d_polar_fan' → 'polar_fan'` route and call out that `polar_fan` ignores
      `gapPolicy` and `originMode`.
- [ ] Add a CHANGELOG.md entry under "Unreleased" → "Added": describe both variations in
      one bullet; tag SemVer: **MINOR**.
- [ ] **CLI verification**: run `npm run render -- --input public/demo-midi/bach_prelude_c.mid
      --mode polar_fan --output tmp/polar-fan-test.svg` and confirm the SVG contains the
      expected spokes (12 fixed directions, chords fan from center). The SVG builder
      (`src/renderers/svg/svgBuilder.ts`) is generic and requires no changes, but this
      end-to-end test confirms the CLI enum array was extended correctly.

## Verification

- [ ] `npm run validate` passes after each phase (Vitest + strict TS + production build).
- [ ] Determinism: `mapScoreToGeometry(score, {variation:'polar_fan',...})` returns deep-
      equal output across repeated runs with identical inputs (unit-tested, mirroring the
      determinism rule in AGENTS.md that the parser and mapper must stay pure).
- [ ] Spec-correctness cases pass (see Phase 2 checklist): single note angle, C-major
      triad fan at 0°/120°/210°, unison overlap, no `'gap'` segments emitted, all starts
      equal to canvas center.
- [ ] 3D XY parity: `3d_polar_fan` `RenderedGeometry3D.segments` have `startX/startY/endX/
      endY` equal to the 2D `polar_fan` segments after `fitGeometryToCanvas` (unit-tested).
- [ ] 3D Z extent: `GeometrySegment3D.startZ = onset × zScale`, `endZ = (onset+duration) ×
      zScale` (unit-tested).
- [ ] Manual: load the Bach prelude demo, switch to `polar_fan`, visually confirm the 12
      fixed spokes, a chord-playing bar fans multiple spokes, voices share center. Switch
      to `3d_polar_fan`, confirm reveal cue still works (no future spokes appear past the
      now-plane when `playbackCue === 'now_plane'`). Cycle camera presets; export a PNG.
- [ ] Manual perf: dense score holds frame rate during 2D polar_fan pan/zoom and 3D
      orbit/reveal; no WebGL memory leak on repeated variation switching (check
      `renderer.info.memory` per existing 3D plan).

## Open questions

- [x] **C-right vs C-up reference** (spec §4.1) — **Decided**: `pitchClass 0 → θ = 0°`
      means C points right (clockwise from +X). This matches the existing `scoreMapper`
      angle convention. Reversible in the mapper (add +90° offset to angle) without
      touching the geometry contract if a "C up" reading turns out more intuitive during
      visual review.
- [ ] **Voice-route dedup** (spec §4.2) — keep-all default for v1 (renderer paints
      overlays top-sorted). If a perf regression shows up on dense chorales, revisit in a
      follow-up that bubbles the dominant color in the renderer's instancing path *without*
      touching the mapper (the spec default). No action needed for this plan unless the
      manual perf check surfaces it.
- [ ] **OctavePanel readout** — does the 2D polar_fan view warrant an optional 12-spoke
      rose overlay (like the 3D grounding grid)? Out of scope for this plan; deferred to a
      separate spec if the manual review finds the rose hard to read.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Spoke angle desyncs from note color when `transposeSemitones !== 0` (review finding #1) | high if unmitigated | high — spoke says "C" while color says "D" | Source the spoke angle from `getVisualPitch(note, config) % 12`, never raw `note.pitchClass`. Add the transpose-parity test in Phase 2 to lock it in. |
| Silent failure if polar_fan branch is missing or misspelled | med if unmitigated | high — feature appears to work but produces blank canvas | Add a defensive `else` clause in the variation chain that throws on unhandled variations. Add a guard test asserting non-empty segments for a non-empty score. |
| Dense chorale produces heavy spoke overlap → illegible color | med | low | `voice_palette` hue mode already disambiguates per-voice; documented in spec §1.2. Defer dedup optimization per spec §4.2 unless perf regresses. |
| Polyphony fast path (`mapPolyphonicLineSegments`) accidentally entered for `polar_fan` when `chordLayout === 'polyphony'` | med | high | Branch guard at top of the per-track loop: skip the fast path when `config.variation === 'polar_fan'`. Test the C-major triad case to catch a regression. |
| `fitGeometryToCanvas` shifts the origin away from canvas center for asymmetric scores, contradicting user briefing | high if unmitigated | high — "voices start at the center and move out" is violated | Modify `fitGeometryToCanvas` to compute bounds symmetrically around the origin for `polar_fan` variations. Add an asymmetric-score test asserting the origin stays at `(width/2, height/2)` after fitting. |
| `3d_polar_fan` lifts segments that share `startX/startY` (the center) but have Z extent that overlaps across voices — coincident 3D line geometry produces Z-fighting among same-pitch-class cross-voice notes | med | low | Existing `3d_lines` Z-fighting handling (depth offset per voice, if any) carries over; if not present, render-on-demand + the renderer's existing depth-sorted line render path covers it. Surface to spec follow-up if it looks bad in manual review. |
| Test golden values hard-code C-right and the spec later flips to C-up | low | low | Keep the angle constant (`transposedPitchClass * 30°`) in one place in the mapper and if we flip, only one offset param changes; tests assert against the helper, not a magic number. Decide before merging Phase 1. |
| Forgetting to skip `gapPolicy`/`originMode` for polar_fan accidentally links `left_to_right` cursor origin into the new branch | low | med | Phase 1 explicitly does **not** call `getInitialCursor`/`getInitialHeading`/`addGapSegment`. Add a guard test asserting that a `gapPolicy: 'ghost'` config still emits zero `'role: 'gap'` segments for `polar_fan`. |
| CLI drops `--mode polar_fan` with an enum validation error because the allowed-mode array wasn't extended (review finding #3) | high if unmitigated | med — feature is silently unreachable from the CLI | Phase 2 task explicitly extends the array and the `--help` text before Phase 4 verification runs `npm run validate`. Phase 4 includes an end-to-end CLI test. |
| Spokes look flat in the 2D Canvas because the line-glow predicate is locked to `variation === 'lines'` (review finding #6) | high if unmitigated | low-med — looks inconsistent with the line family | Phase 2 task extends the predicate to include `polar_fan`. Visually confirm in manual review; tune the shadow-blur multiplier if dense chords wash out. |
