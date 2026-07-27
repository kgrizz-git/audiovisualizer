# Plan: Polar Walk Mode - Continuous Voice Paths in Polar Coordinates

Last reviewed: 2026-07-27
Date: 2026-07-27
Author: Devin (agent)
Status: complete (2026-07-27)
Linked issue/PR: n/a

## Goal

Add a new `polar_walk` visualization mode that creates continuous voice paths in polar coordinates, addressing user feedback that the current `polar_fan` mode should have voices start at center but then continue from where each previous note ends, rather than every note radiating from the center. This will reduce color overlap issues and provide a more intuitive visualization of voice independence while maintaining the polar coordinate mapping where pitch class determines direction.

## Out of scope

- Modifying the existing `polar_fan` mode (it will remain unchanged for backward compatibility)
- Adding octave-based radial offsets (all octaves of same pitch class use same angle)
- 3D-specific polar walk variants (3D will automatically inherit 2D behavior)
- SVG/plotter-specific polar walk features (uses existing export infrastructure)

## Approach

Create a new `polar_walk` variation that reuses the polar coordinate angle mapping (pitch class → 30° per semitone) but implements continuous path advancement per voice. Each voice starts at canvas center, then walks forward through polar coordinates where each segment's direction is determined by the current note's pitch class and length by duration. This approach was chosen over modifying the existing `polar_fan` to preserve backward compatibility and allow users to compare both radial fan and continuous path behaviors.

### Alternatives considered

| Option | Why not chosen |
|---|---|
| Replace existing `polar_fan` with continuous paths | Breaking change for existing users; would require MAJOR version bump |
| Add config toggle within `polar_fan` | More complex API; separate mode is cleaner and more discoverable |
| Use interval-based heading like `lines` mode | User specifically wants polar angle mapping, not interval-based turns |

## Proposed file changes

```
src/core/types.ts
  — Add 'polar_walk' and '3d_polar_walk' to Variation union type
  — Update is3DVariation() to return true for '3d_polar_walk'

src/core/mapper/scoreMapper.ts
  — Add polar_walk case in variation switch statement
  — Implement per-voice cursor advancement logic (starts at canvas center)
  — Add dedicated polyphonic polar walk mapping helper
  — Integrate gap policy handling for polar_walk

src/core/layout/fitGeometry.ts
  — Update fitGeometryToCanvas to use symmetrical fitting for polar_walk (same as polar_fan)

src/core/mapper/map3d.ts
  — Update base2DVariation to map '3d_polar_walk' to 'polar_walk'

src/core/legend/legendContent.ts
  — Add polar_walk and 3d_polar_walk cases to getLegendContent

src/renderers/canvas/canvasRenderer.ts
  — Update glow boolean check to apply line glow to polar_walk variation

src/ui/launchRandomizer.ts
  — Add 'polar_walk' and '3d_polar_walk' to VARIATIONS array

src/cli/renderMidi.ts
  — Add 'polar_walk' to available CLI modes in parseCli and HELP text

DESIGN.md
  — Document polar_walk and 3d_polar_walk in visual grammar variations list

tests/mapper.polarWalk.test.ts
  — Add comprehensive polar_walk mapping, polyphony, fit, and CLI parsing tests

tests/map3d.test.ts
  — Add 3d_polar_walk test cases (XY parity and Z onset mapping)

tests/launchRandomizer.test.ts
  — Update VARIATIONS array assertions to expect 12 variations
```

## Phases & checklist

### Phase 1: Core mapping implementation

- [x] Add 'polar_walk' and '3d_polar_walk' to Variation type in types.ts
- [x] Add '3d_polar_walk' to is3DVariation()
- [x] Add base2DVariation('3d_polar_walk') returning 'polar_walk' in map3d.ts
- [x] Implement polar_walk mapping in scoreMapper.ts:
  - project segment from previous end-point (or center for first note)
  - angle = pitch class * 30 degrees (clockwise from +X)
  - length = duration * lengthScale
- [x] Add polar_walk to fitGeometry.ts symmetrical-fitting branch (same logic as polar_fan)
- [x] Add basic test case for single voice continuous path
- [x] Verify pitch class → angle mapping matches polar_fan (C=0°, E=120°, G=210°)
- [x] Verify duration → length mapping

### Phase 2: Advanced features integration

- [x] Implement chordLayout === 'polyphony': fan from cursor, track active tips, compute centroid for next join point
- [x] Implement chordLayout === 'chain': sequential end-to-start mapping
- [x] Test both chord layout modes with simultaneous onsets
- [x] Implement gap policy handling (gap direction = last heading angle)
- [x] Test lift_pen, faint_line, ghost gap policies
- [x] Test with multiple voices (independent cursors, each starting at center)
- [x] Test color separation between voices
- [x] Test edge cases (empty voices, single notes, extreme durations)

### Phase 3: 3D and rendering support

- [x] Verify 3d_polar_walk via existing liftGeometryTo3D() (XY from 2D, Z from onset × zScale)
- [x] Add 3d_polar_walk test in map3d.test.ts (XY matches 2D polar_walk, Z extent correct)
- [x] Add polar_walk to canvas renderer glow condition (canvasRenderer.ts:101)
- [x] Verify SVG export produces correct geometry
- [x] Test PNG export

### Phase 4: Documentation and polish

- [x] Add polar_walk and 3d_polar_walk options to index.html variation select dropdown
- [x] Add polar_walk and 3d_polar_walk to launchRandomizer.ts VARIATIONS array
- [x] Update launchRandomizer.test.ts expected array
- [x] Add polar_walk to CLI --mode enum and help text
- [x] Update DESIGN.md with polar_walk description and difference from polar_fan
- [x] Add legend content for polar_walk and 3d_polar_walk in legendContent.ts
- [x] Add comprehensive test coverage

### Phase 5: Validation and release

- [x] Run full test suite (npm run validate)
- [x] Manual visual testing with various MIDI files
- [x] Update CHANGELOG.md with new feature (MINOR bump)
- [x] Update VERSION file
- [x] Archive this plan to plans/archive/

## Verification

How will we know this is done and correct?

- [x] All existing tests pass (polar_fan behavior unchanged)
- [x] New polar_walk tests verify continuous path behavior
- [x] Single voice starts at center, subsequent notes continue from previous endpoint
- [x] Pitch class → angle matches polar_fan: C=0°, E=120°, G=210° (visualPitchClass × 30°)
- [x] Multiple voices with same pitch class separate over time (independent cursors)
- [x] chordLayout === 'polyphony': chords fan from cursor, centroid join for next note
- [x] chordLayout === 'chain': chords mapped sequentially end-to-start
- [x] Gap policy works correctly: lift_pen lifts, faint_line/ghost draw gap segment in last heading direction
- [x] fitGeometryToCanvas uses symmetrical fitting (origin stays at canvas center)
- [x] Canvas renderer displays polar_walk correctly with glow
- [x] SVG export produces valid continuous path geometry
- [x] CLI can render polar_walk mode
- [x] 3d_polar_walk: XY matches 2D polar_walk, Z = onset × zScale
- [x] index.html dropdown includes polar_walk and 3d_polar_walk options
- [x] launchRandomizer includes polar_walk and 3d_polar_walk
- [x] Performance is acceptable with complex scores

## Completion checklist

When all phases and verification are done:

- [x] Update plan `Status:` to `complete` with completion date
- [x] Move plan to `plans/archive/`
- [x] Add entry to `CHANGELOG.md` under "Added" section
- [x] Update VERSION file for MINOR version bump
- [x] Remove any related item from `dev-docs/TO_DO.md` if present

## Open questions (resolved)

- [x] **3D variant**: Add `3d_polar_walk` alongside `polar_walk`. The existing `map3d.ts` infrastructure (`liftGeometryTo3D`, `base2DVariation`) makes this trivial — same pattern as `3d_polar_fan`. Deferring would create unnecessary asymmetry.
- [x] **Polyphony handling**: Implement dedicated polar walk mapper logic in scoreMapper.ts. Do NOT reuse `mapPolyphonicLineSegments()` from polyphonicLines.ts — its heading math is interval-based, not absolute pitch-class angles. Reuse only `clusterNotesByOnset()` for chord detection.
- [x] **Chord behavior**: Depends on `chordLayout` config:
  - `'polyphony'`: fan from current cursor, track active tips, compute centroid for next join point
  - `'chain'`: sequential end-to-start mapping using absolute pitch-class angles
- [x] **Gap policy semantics**: Gap direction = last heading angle (the polar angle of the last note). `lift_pen` moves cursor without drawing; `faint_line` and `ghost` draw a gap segment in the last heading direction for the gap duration. This is consistent with how `lines` mode handles gaps.
- [x] **Geometry fitting**: Use symmetrical centering (same as `polar_fan`) — measure max radial distance from canvas center and scale symmetrically. This preserves the polar origin at canvas center, critical for the "wind-rose" aesthetic. Do NOT use generic bbox fitting which would shift the origin.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Visual clutter with dense scores | medium | medium | Test with various MIDI files, adjust lengthScale if needed |
| Walk drifts off-canvas or into corner | medium | medium | polar_walk geometry is a walk, not radial — verify fitGeometryToCanvas handles asymmetric bounds; may need special-case branch like polar_fan |
| Polyphonic centroid in polar coords produces unexpected join points | low | medium | Active-tip centroid is Cartesian (same as polyphonicLines.ts); verify visually with 2+ voice chords |
| Performance regression with polyphony | low | medium | Benchmark with complex scores, optimize if needed |
| User confusion between polar_fan and polar_walk | low | low | Clear documentation and legend descriptions |
