# Plan Assessment: Visual Property Options

Last reviewed: 2026-07-27T16:53:33Z (re-review of updated plan)
Date: 2026-07-27
Reviewer: opencode (agent)
Scope: [plans/2026-07-27-visual-property-options.md](plans/2026-07-27-visual-property-options.md)
Status: approved

## Executive Summary

The plan adds four new configurable visual properties (3D ring-flash toggle, velocity-proportional length, velocity-driven color saturation/glow, constant stroke width) and threads them through the existing `RuleConfig` surface. The approach is consistent with the project's "options, not presets" pattern and the mapper/renderer split. All four recommendations from the previous assessment have been incorporated into the updated plan. We approve the plan as-is.

## Detailed Technical Review

### 1. `RuleConfig` extension pattern
The current `RuleConfig` at `src/core/types.ts:64-85` is the single source of truth for variation parameters and the proposal correctly extends it. Recommended fields:

- `ringFlashes3D: boolean` — default `true` (preserves current behavior; users opt out)
- `lengthProportionalTo: 'duration' | 'velocity'` — default `'duration'`
- `velocityLengthMin: number` — default `0.05` seconds is too small if `lengthScale` is e.g. 600; recommend a derived default computed from `lengthScale`, e.g. `minSegmentLength` reused, or a literal canvas-pixel floor like `8` pixels. Suggest: `Math.max(config.minSegmentLength, (1/127) * lengthScale)` so the floor scales with `lengthScale`.
- `velocityGlow: boolean` — default `false` (keeps current behavior)
- `constantStrokeWidth: boolean` — default `false`

The plan's `DEFAULT_CONFIG` updates in `src/core/mapper/scoreMapper.ts:14` are correct.

### 2. Velocity-proportional length
The plan applies the velocity-length formula at:
- `scoreMapper.ts:186` (single-voice main loop)
- `mapPolyphonicPolarWalkSegments` (line 519 referenced)
- `map3d.ts` lines 53-54 (segment Z-extent) and line 73 (note halo Z-extent)
- `polyphonicLines.ts` line 189

This is comprehensive and covers all of the mapper's segment-emitting paths. A subtle point: in `map3d.ts`, the Z-extent formula uses `effectiveZScale()` which is keyed on `durationSeconds`. When switching to velocity, `effectiveZScale()` must be called with the velocity-derived length in seconds, not the original `note.duration`. The plan should clarify whether the `minSegmentLength` is interpreted in seconds (input to `effectiveZScale`) or in canvas pixels (post-scale output). Recommend unifying on "seconds" for clarity, then letting the 3D pipeline scale it.

### 3. Velocity glow — HSL saturation in the mapper
The plan correctly identifies that `MeshBasicMaterial` (used in 3D `InstancedMesh`) has no emissive channel and that modulating it is not possible per-instance without a custom shader. Routing the modulation through HSL saturation in the mapper is the right call: it is renderer-agnostic, deterministic, and applies uniformly to 2D canvas and 3D.

`getNoteColor()` is at `src/core/mapper/scoreMapper.ts:39`. The `modulateColorByVelocity()` helper should:
- Take the current HSL color string and a velocity in [0, 127]
- Parse to HSL, scale saturation by `velocity/127 * 100%`, optionally bump lightness slightly at high velocity
- Re-emit HSL string

The 2D `shadowBlur` augmentation in `canvasRenderer.ts` (around line 57) is a useful complement but should be clearly noted as a 2D-only effect — the 3D renderer will rely solely on HSL saturation since shadow blur is a Canvas2D concept.

### 4. Onset ring gating
The plan's call-site gating in `ThreeDRenderer.stepPlayhead()` is correct. The current `OnsetPulseController.spawn()` (`src/renderers/three/onsetPulses.ts`) is reused by other 3D variations, so checking `currentGeometry.config.ringFlashes3D` at the call site keeps `OnsetPulseController` reusable without leaking variation-specific knowledge. Good.

One omission: the plan should also gate the ring pulse controller's audio-side scheduling if any (verify that `OnsetPulseController` does not also produce audio; based on naming it does not, but the test in `tests/onsetPulses.test.ts` should assert the gate is honored).

### 5. Constant stroke width
The plan covers `scoreMapper.ts:185` and `mapPolyphonicPolarWalkSegments` line 526. Recommend also auditing `map3d.ts` for any stroke-width-equivalent fields (e.g. `lineWidth` for `Line2` materials) that would need to honor `constantStrokeWidth`. The plan does not mention this; if the 3D mapper delegates to the 2D path, no extra change is needed, but this should be verified.

## Assessment of Phases

| Phase | Verdict | Notes |
|---|---|---|
| Phase 1: 3D ring flash toggle | Approved | Gating at the call site is correct; audio-coupling verification is now an explicit checklist item |
| Phase 2: Length proportional to velocity | Approved | Default now `Math.max(config.minSegmentLength, (1/127) * lengthScale)` — `lengthScale`-derived floor; unit is seconds; the formula passes velocity-derived length to `effectiveZScale()` |
| Phase 3: Velocity glow | Approved | HSL saturation + 2D `shadowBlur` cap at 24px is explicit in the plan; 2D-only note added |
| Phase 4: Constant stroke width | Approved | `map3d.ts` audit for `lineWidth`/equivalent fields is now an explicit checklist item |

## Risks Reassessment

- **Velocity-proportional length makes short notes invisible**: Mitigated. The default is now derived from `lengthScale`, producing a perceptually smooth gradient across the velocity range.
- **Glow scaling with velocity causes performance issues on dense scores**: Mitigated. The plan now caps `shadowBlur` at 24px regardless of velocity.
- **InstancedMesh lacks per-instance opacity control**: Acknowledged. The HSL approach correctly sidesteps this.

## Documentation & Housekeeping

- `DESIGN.md` updates are now an explicit Phase 3 checklist item ("describe each new visual option's rendering rules and visual tradeoffs").
- `CHANGELOG.md` should receive a "Changed" entry for each user-facing option.
- `tests/mapper.test.ts` and `tests/map3d.test.ts` test additions are well-scoped.

## Resolution of Prior Recommendations

| Recommendation | Status |
|---|---|
| Derive `velocityLengthMin` default from `lengthScale` | Resolved — Phase 2, second item: `Math.max(config.minSegmentLength, (1/127) * lengthScale)` |
| Cap 2D `shadowBlur` at ~24px | Resolved — Phase 3, fourth item: "Cap the shadow blur value at `24` pixels" |
| Audit `map3d.ts` for `constantStrokeWidth` propagation | Resolved — Phase 4, fourth item: "Audit `map3d.ts` to verify if line-width fields (like `lineWidth` in `Line2` materials) need to respect the `constantStrokeWidth` flag" |
| Document 2D `shadowBlur` as 2D-only | Resolved — Phase 3, fourth item: "Note that this shadow glow is 2D-only" |
| Verify `OnsetPulseController` does not couple with audio scheduler | Resolved — Phase 1, fourth item: explicit verification checklist item |

## Conclusion

The plan is approved. All five recommendations from the initial assessment have been incorporated. The HSL-saturation approach for `velocityGlow` is the cleanest cross-renderer path, and the call-site gating for `ringFlashes3D` correctly avoids leaking variation-specific knowledge into `OnsetPulseController`. No further adjustments are required.
