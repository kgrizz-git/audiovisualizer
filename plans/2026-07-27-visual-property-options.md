# Plan: Visual Property Options

NEEDS REVIEW
Last reviewed: 2026-07-27
Date: 2026-07-27
Author: opencode
Status: draft
Linked issue/PR: n/a

## Goal

Add several configurable visual properties: (1) disable transient ring flashes on the 3D polar fan layout, (2) allow note halo/line length or size to be proportional to velocity instead of duration, (3) add an option for color saturation or glow intensity to scale with velocity, and (4) add an option for constant line thickness instead of duration-proportional thickness.

## Out of scope

- New layout modes or 3D geometry primitives.
- Playback or transport changes.
- Export/rendering pipeline changes.

## Approach

Introduce new boolean or enum fields on `RuleConfig` in `src/core/types.ts` and their defaults in `DEFAULT_CONFIG` in `src/core/mapper/scoreMapper.ts`. Thread them through the mappers (`scoreMapper.ts`, `map3d.ts`, `polyphonicLines.ts`) and renderers, then expose them as UI controls. 

Specifically:
- **RuleConfig and Default Configuration:** Ensure the fields are fully defined in `RuleConfig` and `DEFAULT_CONFIG` so that CLI/MIDI utilities can load them cleanly.
- **Velocity-proportional length/thickness:** Update mappers in `scoreMapper.ts` main loop, `mapPolyphonicPolarWalkSegments`, and `polyphonicLines.ts`. For 3D (`map3d.ts`), update both segment and circle/halo Z-extents. We will implement a `velocityLengthMin` config option to prevent quiet notes from becoming invisible.
- **Glow & Color Saturation:** Emissive intensity cannot be modulated on the 3D `InstancedMesh` because it uses `MeshBasicMaterial`. We will instead modulate HSL saturation in the mapper (via a helper function in `scoreMapper.ts`) so that it affects 2D and 3D uniformly. For the 2D canvas renderer, we will update `drawSegment()` and the circle halo loop (around line 57) to scale `shadowBlur`.
- **Onset rings gating:** Gate the spawning at the call site in `ThreeDRenderer.stepPlayhead()` checking `this.currentGeometry.config.ringFlashes3D` rather than inside `OnsetPulseController.spawn()`.

### Alternatives considered

| Option | Why not chosen |
|---|---|
| Separate config object for visual tweaks | RuleConfig already carries all mapping parameters; adding fields is simpler |
| Global presets with no per-option control | Users need fine-grained control; presets can layer on top later |
| Modulate 3D emissive material properties | Material is MeshBasicMaterial (no emissive) and InstancedMesh prevents per-instance material attribute modulation without custom shaders |

## Proposed file changes

```
src/core/types.ts                        — add new RuleConfig fields: ringFlashes3D, lengthProportionalTo, velocityGlow, constantStrokeWidth
src/core/mapper/scoreMapper.ts           — use new config fields to select velocity-vs-duration for length, strokeWidth, and glow
src/core/mapper/map3d.ts                 — respect ringFlashes3D for 3D polar fan; use lengthProportionalTo for 3D line/halo Z-extent
src/core/mapper/polyphonicLines.ts       — use lengthProportionalTo and constantStrokeWidth for polyphonic lines
src/renderers/three/geometryBuilders.ts  — use velocityGlow for saturation/emissive intensity on 3D meshes
src/renderers/canvas/canvasRenderer.ts   — use velocityGlow for shadowBlur intensity on 2D halos/lines
src/renderers/three/onsetPulses.ts       — respect ringFlashes3D to skip spawning rings
src/ui/app.ts, index.html               — add UI controls for new options
tests/mapper.test.ts                     — add tests for each new option
tests/map3d.test.ts                      — add tests for ringFlashes3D and 3D velocity mapping
```

## Phases & checklist

### Phase 1: Disable 3D polar fan ring flashes

- [ ] Add `ringFlashes3D: boolean` (default `true`) to `RuleConfig` in `src/core/types.ts` and `DEFAULT_CONFIG` in `scoreMapper.ts`.
- [ ] In `ThreeDRenderer.ts` `stepPlayhead()`, check `this.currentGeometry.config.ringFlashes3D` before calling `spawn()` on `onsetPulseController`.
- [ ] Add UI toggle (default on, can be turned off).
- [ ] Verify that `OnsetPulseController` does not couple with or trigger audio scheduler events.
- [ ] Add test in `tests/onsetPulses.test.ts`: verify no rings spawned when `ringFlashes3D` is false.

### Phase 2: Length proportional to velocity option

- [ ] Add `lengthProportionalTo: 'duration' | 'velocity'` (default `'duration'`) to `RuleConfig` and `DEFAULT_CONFIG`.
- [ ] Add `velocityLengthMin: number` to `RuleConfig` and `DEFAULT_CONFIG` (default dynamically computed as `Math.max(config.minSegmentLength, (1/127) * lengthScale)` so it scales proportionally, or customizable).
- [ ] In `scoreMapper.ts` main loop (~line 186) and `mapPolyphonicPolarWalkSegments` (~line 519): when `lengthProportionalTo === 'velocity'`, calculate note visual duration in seconds using `Math.max(velocityLengthMin, (note.velocity / 127) * note.duration)`.
- [ ] In `map3d.ts` lines 53-54 (segment Z-extent) and line 73 (note halo `czExtent`): ensure velocity-length (in seconds) is passed to `effectiveZScale()`.
- [ ] In `polyphonicLines.ts` line 189: apply the same velocity length (seconds) swap.
- [ ] Add UI select control for duration vs velocity.
- [ ] Add test: verify segment/geometry lengths track velocity with the correct floor when enabled.

### Phase 3: Velocity-proportional color saturation or glow

- [ ] Add `velocityGlow: boolean` (default `false`) to `RuleConfig` and `DEFAULT_CONFIG`.
- [ ] In `scoreMapper.ts`, implement a helper function `modulateColorByVelocity(color: string, velocity: number): string` that scales HSL color saturation with velocity (e.g. higher velocity -> higher saturation).
- [ ] Call `modulateColorByVelocity()` inside `getNoteColor()` when `velocityGlow` is true.
- [ ] In `canvasRenderer.ts`: scale `shadowBlur` by velocity when enabled in both `drawSegment()` and the circle halo loop (line 57). Cap the shadow blur value at `24` pixels to prevent canvas performance degradation on dense scores. Note that this shadow glow is 2D-only.
- [ ] Update `DESIGN.md` to describe each new visual option's rendering rules and visual tradeoffs.
- [ ] Add UI toggle.
- [ ] Add test: verify color/glow scales with velocity when enabled.

### Phase 4: Constant line thickness option

- [ ] Add `constantStrokeWidth: boolean` (default `false`) to `RuleConfig` and `DEFAULT_CONFIG`.
- [ ] In `scoreMapper.ts` line 185 (and in `mapPolyphonicPolarWalkSegments` line 526): when enabled, use `strokeWidthBase` alone (skip velocity scaling).
- [ ] In `polyphonicLines.ts` line 195: use constant stroke width when enabled.
- [ ] Audit `map3d.ts` to verify if line-width fields (like `lineWidth` in `Line2` materials) need to respect the `constantStrokeWidth` flag.
- [ ] Add UI toggle.
- [ ] Add test: verify stroke widths are constant when enabled.

## Verification

- [ ] 3D polar fan: rings do not appear when `ringFlashes3D` is false
- [ ] Line/halo length visibly scales with velocity when `lengthProportionalTo = 'velocity'`
- [ ] Test velocity-proportional length with a MIDI file containing a single very quiet note (velocity ≈ 1) — verify it is still visible due to `velocityLengthMin` floor
- [ ] Color saturation increases with velocity when `velocityGlow` is true (modulating HSL saturation)
- [ ] Test velocityGlow with a MIDI file where all notes have the same velocity — verify no visual difference from disabled
- [ ] Line thickness is uniform when `constantStrokeWidth` is true
- [ ] Test constantStrokeWidth with the polyphony layout — verify uniform thickness across chord fans
- [ ] All options default to current behavior (no visual regression)
- [ ] `npm run validate` passes

## Completion checklist

When all phases and verification are done:

- [ ] Update plan `Status:` to `complete` with completion date
- [ ] Move plan to `plans/archive/`
- [ ] Add entry to `CHANGELOG.md` (user-facing) or `CHANGELOG.dev.md` (internal)
- [ ] Remove the completed items from `dev-docs/TO_DO.md` (do not just check them off)

## Open questions

- None. (Resolved: velocityGlow modulates HSL saturation + 2D shadowBlur. Velocity length has a configurable minimum floor.)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Velocity-proportional length makes short notes invisible | medium | medium | Add a minimum length floor; test with extreme MIDI files |
| Glow scaling with velocity causes performance issues on dense scores | low | low | Glow is a visual nicety; can be capped at a max blur radius |
| InstancedMesh lacks per-instance opacity control | high | low | Perform modulation on HSL color lightness/saturation instead of using material opacity/emissive attributes |
