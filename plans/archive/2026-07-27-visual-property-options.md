# Plan: Visual Property Options

Last reviewed: 2026-07-27
Date: 2026-07-27
Author: opencode
Status: complete (2026-07-27)
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

- [x] Add `ringFlashes3D: boolean` (default `true`) to `RuleConfig` in `src/core/types.ts` and `DEFAULT_CONFIG` in `scoreMapper.ts`.
- [x] In `ThreeDRenderer.ts` `stepPlayhead()`, check `this.currentGeometry.config.ringFlashes3D` before calling `spawn()` on `onsetPulseController`. *Deviation: the guard lives both at the `spawnOnsetPulses` call site and inside `OnsetPulseController.spawn()` (explicit `=== false` so partial configs default on), which makes the controller test possible without WebGL stubs.*
- [x] Add UI toggle (default on, can be turned off). (`ring-flash-toggle` in the 3D controls.)
- [x] Verify that `OnsetPulseController` does not couple with or trigger audio scheduler events. (Verified: the controller only reads geometry + playhead time; no audio imports.)
- [x] Add test in `tests/onsetPulses.test.ts`: verify no rings spawned when `ringFlashes3D` is false.

### Phase 2: Length proportional to velocity option

- [x] Add `lengthProportionalTo: 'duration' | 'velocity'` (default `'duration'`) to `RuleConfig` and `DEFAULT_CONFIG`.
- [x] Add `velocityLengthMin: number` to `RuleConfig` and `DEFAULT_CONFIG` (default dynamically computed as `Math.max(config.minSegmentLength, (1/127) * lengthScale)` so it scales proportionally, or customizable). *Deviation: defined as a fixed floor in seconds (default `0.05`) since the visual duration is computed in time units before `lengthScale` applies; no dedicated UI control.*
- [x] In `scoreMapper.ts` main loop (~line 186) and `mapPolyphonicPolarWalkSegments` (~line 519): when `lengthProportionalTo === 'velocity'`, calculate note visual duration in seconds using `Math.max(velocityLengthMin, (note.velocity / 127) * note.duration)`. *The formula lives in `getVisualDuration()` in the new `src/core/mapper/noteStyle.ts`, re-exported from `scoreMapper.ts`, and is also applied in the polar fan, polar walk, and radial voice path branches.*
- [x] In `map3d.ts` lines 53-54 (segment Z-extent) and line 73 (note halo `czExtent`): ensure velocity-length (in seconds) is passed to `effectiveZScale()`. *Gap (rest) segments intentionally stay time-true.*
- [x] In `polyphonicLines.ts` line 189: apply the same velocity length (seconds) swap.
- [x] Add UI select control for duration vs velocity. (`length-source-select`.)
- [x] Add test: verify segment/geometry lengths track velocity with the correct floor when enabled. (`tests/mapper.test.ts` + `tests/map3d.test.ts`.)

### Phase 3: Velocity-proportional color saturation or glow

- [x] Add `velocityGlow: boolean` (default `false`) to `RuleConfig` and `DEFAULT_CONFIG`.
- [x] In `scoreMapper.ts`, implement a helper function `modulateColorByVelocity(color: string, velocity: number): string` that scales HSL color saturation with velocity (e.g. higher velocity -> higher saturation). *Lives in `noteStyle.ts` (re-exported from `scoreMapper.ts`) to avoid a circular import; saturation maps `45%` at velocity 0 → `100%` at 127, and is also applied in `polyphonicLines.ts` local colors.*
- [x] Call `modulateColorByVelocity()` inside `getNoteColor()` when `velocityGlow` is true.
- [x] In `canvasRenderer.ts`: scale `shadowBlur` by velocity when enabled in both `drawSegment()` and the circle halo loop (line 57). Cap the shadow blur value at `24` pixels to prevent canvas performance degradation on dense scores. Note that this shadow glow is 2D-only.
- [x] Update `DESIGN.md` to describe each new visual option's rendering rules and visual tradeoffs. (New "Velocity- and thickness-driven options" subsection + Visual grammar table updates.)
- [x] Add UI toggle. (`velocity-glow-toggle`.)
- [x] Add test: verify color/glow scales with velocity when enabled.

### Phase 4: Constant line thickness option

- [x] Add `constantStrokeWidth: boolean` (default `false`) to `RuleConfig` and `DEFAULT_CONFIG`.
- [x] In `scoreMapper.ts` line 185 (and in `mapPolyphonicPolarWalkSegments` line 526): when enabled, use `strokeWidthBase` alone (skip velocity scaling). (`getStrokeWidth()` helper applied at every width site, including percussion rings.)
- [x] In `polyphonicLines.ts` line 195: use constant stroke width when enabled.
- [x] Audit `map3d.ts` to verify if line-width fields (like `lineWidth` in `Line2` materials) need to respect the `constantStrokeWidth` flag. *Audit result: no changes needed — 3D slab thickness and line materials derive from the 2D segment width, so the flag carries through automatically.*
- [x] Add UI toggle. (`constant-stroke-toggle`, labeled "Uniform stroke".)
- [x] Add test: verify stroke widths are constant when enabled.

## Verification

- [x] 3D polar fan: rings do not appear when `ringFlashes3D` is false (unit-tested in `tests/onsetPulses.test.ts`)
- [x] Line/halo length visibly scales with velocity when `lengthProportionalTo = 'velocity'`
- [x] Test velocity-proportional length with a MIDI file containing a single very quiet note (velocity ≈ 1) — verify it is still visible due to `velocityLengthMin` floor (covered by unit tests at velocity 1 in 2D and 3D)
- [x] Color saturation increases with velocity when `velocityGlow` is true (modulating HSL saturation)
- [x] Test velocityGlow with a MIDI file where all notes have the same velocity — verify no visual difference from disabled. *Interpreted as: uniform-velocity scores render with uniform saturation (tested); exact equality with disabled only occurs at velocity ≈ 92, where modulated saturation equals the fixed default 85%.*
- [x] Line thickness is uniform when `constantStrokeWidth` is true
- [x] Test constantStrokeWidth with the polyphony layout — verify uniform thickness across chord fans
- [x] All options default to current behavior (no visual regression; full existing suite passes unchanged)
- [x] `npm run validate` passes (30 test files, 273 tests, tsc + vite build)

## Completion checklist

When all phases and verification are done:

- [x] Update plan `Status:` to `complete` with completion date
- [x] Move plan to `plans/archive/`
- [x] Add entry to `CHANGELOG.md` (user-facing) or `CHANGELOG.dev.md` (internal)
- [x] Remove the completed items from `dev-docs/TO_DO.md` (do not just check them off)

## Open questions

- None. (Resolved: velocityGlow modulates HSL saturation + 2D shadowBlur. Velocity length has a configurable minimum floor.)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Velocity-proportional length makes short notes invisible | medium | medium | Add a minimum length floor; test with extreme MIDI files |
| Glow scaling with velocity causes performance issues on dense scores | low | low | Glow is a visual nicety; can be capped at a max blur radius |
| InstancedMesh lacks per-instance opacity control | high | low | Perform modulation on HSL color lightness/saturation instead of using material opacity/emissive attributes |
