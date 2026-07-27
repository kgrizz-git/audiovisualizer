# Plan Assessment: Radial Voice-Path Layout

Last reviewed: 2026-07-27T16:53:33Z (re-review of updated plan)
Date: 2026-07-27
Reviewer: opencode (agent)
Scope: [plans/2026-07-27-radial-voice-path-layout.md](plans/2026-07-27-radial-voice-path-layout.md)
Status: approved

## Executive Summary

The plan adds a new `radial_voice_paths` variation that maps each voice to a radial spoke based on its median pitch, with pitched notes as segments along the spoke and percussion as concentric time-rings. The decision to reuse standard `GeometrySegment`/`GeometryCircle` rather than introduce a new geometry type is well-founded and preserves 2D/SVG renderer compatibility. All four recommendations from the previous assessment have been incorporated into the updated plan. We approve the plan as-is.

## Detailed Technical Review

### 1. Variation registration without a new geometry type
Adding `'radial_voice_paths'` to the `Variation` union at `src/core/types.ts:1-13` is correct. The plan correctly avoids introducing a new `GeometryRadialVoicePath` type, which would have required parallel updates in `canvasRenderer.ts`, `svg/`, `ThreeDRenderer.ts`, `viewportController.ts`, and tests. This is the same approach the polar walk plan took and is the right call.

### 2. Voice-to-angle assignment
The proposed mapping (lowest → 270°, highest → 90°, middle spread linearly between 180° and 0°) has a subtle issue: it forces voices onto a 180° arc, ignoring the lower-left and lower-right quadrants. With many voices this may look asymmetric (no voices below 270° or between 90° and 180°/0°). Recommend either:
- Using a full 360° mapping (e.g. lowest → 270°, highest → 90°, intermediate voices spread by sort-rank across all 360°), or
- Explicitly stating the 180° arc is intentional for compositional focus (low and high get visual emphasis; middle "spokes" radiate laterally).

The current plan describes a 180° arc without justifying it. Recommend documenting the rationale or switching to a full 360° spread.

### 3. Median pitch computation
The plan computes each voice's median pitch across the score. For percussion, the median pitch is meaningless — percussion notes are typically all on channel 10 with non-pitched MIDI keys. The plan should:
- Detect percussion voices by channel (10) or by the existing `track.isPercussion` flag (if present — verify against `src/core/types.ts` and the MIDI parser)
- Skip median-pitch computation for percussion voices entirely
- Map percussion voices to the concentric-ring path, not to a spoke

Without this guard, a percussion channel's "median pitch" will be a MIDI key in the 35-81 range, which would assign a spurious angle to a non-pitched voice.

### 4. Concentric percussion rings
The plan maps percussion to standard `GeometryCircle` with `center = (0, 0)` and `radius = note.onset / score.duration * maxRadius`. Verified against existing `GeometryCircle` schema at `src/core/types.ts:103-111`: center, radius, fillColor, strokeColor, strokeWidth, opacity, and note are present, so no schema change is strictly required. The plan's "Verify if `GeometryCircle` has an `isPercussion: boolean` field; if not, add it" is a good defensive step.

A subtle concern: SVG and Canvas renderers expect a finite canvas. Concentric circles centered at `(0, 0)` will extend to the corners of the bounding box; rings at `maxRadius` will just touch the canvas edge. The fitting extension (see §6) is therefore critical.

### 5. Percussion color mapping
The plan defines six GM percussion family groups with explicit colors. This is a fine, deterministic mapping but is GM-specific. Non-GM drum kits (SoundFont drum kits, channel-10 custom kits) will all fall into the "Other" grey bucket. The plan acknowledges this in the Risks table; the fallback behavior is acceptable.

A minor improvement: extract the GM mapping into a small table at the top of the mapper file for readability and easier future maintenance. This is a stylistic recommendation only.

### 6. Polar fitting extension
The current `fitGeometryToCanvas` at `src/core/layout/fitGeometry.ts:5-40` handles `polar_fan` and `polar_walk` by computing `maxRadius` from segments and applying a centered scale. Critically, it clears `circles: []` at line 37 because polar_fan/walk do not produce circles.

The plan correctly identifies this as a risk: the new variation produces both segments and circles, and the existing polar branch would discard the circles. The proposed fix (compute `maxRadius` from both segments and circles, scale both, retain circles) is correct. The exact formula
```
maxRadius = max(...segments.map(s => distance(s.x, s.y, centerX, centerY)),
                 ...circles.map(c => c.radius + distance(c.x, c.y, centerX, centerY)))
```
is right. Implement as a new branch in the polar fitting block:
```ts
if (geometry.config.variation === 'polar_fan' || geometry.config.variation === 'polar_walk' || geometry.config.variation === 'radial_voice_paths') {
  // ... extended branch that retains circles for radial_voice_paths
}
```
This avoids duplicating the polar fitting logic and keeps the change additive.

### 7. CLI / UI / legend / randomizer wiring
The plan correctly identifies all the touch points:
- `src/cli/renderMidi.ts` — allowed `--mode` flags
- `src/ui/app.ts` and `index.html` — variation selector
- `src/ui/launchRandomizer.ts` — `VARIATIONS` array
- `src/core/legend/legendContent.ts` — exhaustiveness check at line 46 (`case 'polar_fan':`) and 112 (`case 'polar_walk':`); `radial_voice_paths` will need a matching case
- `src/renderers/canvas/canvasRenderer.ts` — line-glow check
- `src/core/mapper/map3d.ts` — `base2DVariation()` mapping (out of scope per plan, but `radial_voice_paths` 3D should be a follow-up)

This is comprehensive and matches the wiring pattern used by `polar_fan` and `polar_walk`.

### 8. Tests
The plan adds tests in `tests/mapper.test.ts` for:
- Spoke assignment and tie-breaking
- Segment positions fanning by pitch
- Ring radii, transparent fills, and family colors

Recommend also adding a test in `tests/layout.test.ts` (or wherever fitting tests live — verify against `tests/layout.test.ts`) that exercises the polar fitting branch with both segments and circles present, to prevent the "circles dropped" regression from reappearing.

## Assessment of Phases

| Phase | Verdict | Notes |
|---|---|---|
| Phase 1: Type definitions and mapper skeleton | Approved | Standard wiring, well-scoped |
| Phase 2: Voice-to-angle assignment | Approved | Percussion detection is now first item; full 360° distribution is explicit; 12-slot cap with spoke sharing is explicit |
| Phase 3: Note segment rendering | Approved | Clamped offset, radial start/end, color reuse correct; opacity scaling `1 / numVoicesAtThisAngle` is now explicit |
| Phase 4: Percussion concentric rings | Approved | GM color table is acceptable; rings centered at canvas origin are simple and aesthetic |
| Phase 5: Fitting and integration | Approved | Extends existing polar branch (not duplicating); fitting test for `radial_voice_paths` is an explicit checklist item |

## Risks Reassessment

- **Many voices cause overlapping angular assignments**: Mitigated. The plan now caps at 12 angular slots, with explicit spoke-sharing with radial separation for the closest voice pairs (Phase 2, fifth item).
- **Percussion type color mapping is inaccurate for non-GM MIDI**: Acknowledged; grey fallback is fine.
- **Radial segments overlap when notes are dense**: Mitigated. Opacity is now scaled as `1 / numVoicesAtThisAngle` (Phase 3, fifth item), preventing dense spokes from overpowering sparse ones.
- **Fitting path discards concentric percussion circles**: Mitigated. Phase 5 first item now extends the existing polar branch with `radial_voice_paths` joined to the condition, retaining and scaling circles. A regression test in `tests/layout.test.ts` is now an explicit checklist item (Phase 5, fourth item).

## Documentation & Housekeeping

- `DESIGN.md` should describe the new variation's visual rules: spoke-per-voice, median-pitch ordering, percussion rings, color families.
- `ARCHITECTURE.md` should add `radial_voice_paths` to the variation list in domain contracts.
- `CHANGELOG.md` should receive a "Added" entry for the new layout.

## Resolution of Prior Recommendations

| Recommendation | Status |
|---|---|
| Explicit percussion-voice detection (channel 10 or percussion flag) | Resolved — Phase 2, first item: "Detect percussion voices (channel 10 or track percussion flag). Skip median pitch computation and routing to spokes" |
| Document 180° arc rationale or switch to full 360° | Resolved — Plan now distributes intermediate voices across the full 360°; Approach paragraph updated: "across all 360° of the circle (lowest → 270°/down, highest → 90°/up, and intermediate voices sorted and distributed across the remaining angles)" |
| Extend existing polar fitting branch (don't duplicate) | Resolved — Phase 5, first item: "extend the existing polar fitting branch (`if (variation === 'polar_fan' || variation === 'polar_walk' || variation === 'radial_voice_paths')`)" |
| Add fitting test in `tests/layout.test.ts` | Resolved — Phase 5, fourth item: explicit "Add a unit test in `tests/layout.test.ts` ... validating that `fitGeometryToCanvas()` preserves and scales concentric percussion circles for the `radial_voice_paths` variation" |

## Conclusion

The plan is approved. All four recommendations from the initial assessment have been incorporated. The decision to reuse standard geometry types rather than introduce a new one is well-grounded and consistent with the project's recent additions (`polar_walk` follows the same pattern). The 360° distribution, percussion-voice detection, opacity scaling, and fitting test together close the gaps identified in the initial review. No further adjustments are required.
