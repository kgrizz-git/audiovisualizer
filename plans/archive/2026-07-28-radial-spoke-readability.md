# Plan: Radial spoke readability

Created: 2026-07-28
Status: completed
Completed: 2026-07-28
Linked issue/PR: n/a

## Goal

Make pitch-direction spokes legible in long scores such as the bundled Mozart movement
without changing their onset-based radial placement. Add an explainable automatic baseline,
a visible user adjustment, and a stroke-width guard that prevents short strokes reading as
dots.

## Evidence

For the 319.6-second Mozart movement at 900px, the current
`duration / scoreDuration × radialRadius` formula produces a 0.26px median spoke and a
0.53px 90th-percentile spoke. The pitch directions are present in the geometry but are too
short to perceive. The present mapper also bypasses `lengthScale` and `minSegmentLength`.

## Scope

- `radial_pitch_spokes` and `3d_voice_towers`: use automatic readable duration scaling,
  plus an adjustable multiplier.
- Constrain note stroke width by the final spoke length so short strokes retain a line-like
  appearance.
- Expose the resolved automatic scale and user multiplier in the UI, legend/summary, docs,
  manifest, and deterministic tests.

## Out of scope

- Changing `lines`, `circles`, `polar_fan`, `polar_walk`, or their 3D counterparts; they
  already use `lengthScale` plus `minSegmentLength` and are not score-duration-compressed.
- Changing `radial_voice_paths` or `3d_radial_voice_paths` by default. Their radial endpoint
  deliberately encodes literal note offset; any duration exaggeration for those modes is a
  separate future option.
- Changing percussion ring geometry.

## Approach

1. Add a serializable `radialSpokeScale` multiplier (default `1`) to `RuleConfig`.
2. Add a pure helper that calculates the automatic multiplier from visible pitched notes:
   target the median raw radial spoke at a documented readable target length, clamp the
   result to a conservative range, then multiply by `radialSpokeScale`. The score and config
   fully determine the result, so export and manifest reproduction remain exact.
3. Use the resulting scale only for `radial_pitch_spokes` and `3d_voice_towers`; onset still
   chooses radial position / tower Z exactly as today.
4. Cap note stroke width at a documented fraction of rendered spoke length, retaining the
   existing velocity width below that cap.
5. Add a `Spoke length` control with an Auto-relative multiplier and display the resolved
   automatic factor. Add the active multiplier to the summary and legend.

### Alternatives considered

| Option | Why not chosen |
|---|---|
| Use the global `lengthScale` directly | Does not adapt to long versus short full-score durations. |
| Apply a fixed 10px minimum only | Makes short notes readable but does not preserve useful duration contrast in dense long works. |
| Scale every radial mode | Would weaken literal onset/offset-as-radius semantics in radial voice paths. |

## Proposed file changes

```
src/core/types.ts                         — serializable spoke multiplier configuration
src/core/mapper/scoreMapper.ts            — pure auto-scale and width-cap helpers; 2D spoke mapping
src/core/mapper/map3d.ts                  — reuse the same effective scale in voice towers
src/core/legend/legendContent.ts          — active spoke-scale rule text
index.html                                — readable spoke-length control
src/ui/app.ts                             — control binding and resolved-scale display
src/ui/launchRandomizer.ts                — preserve/default the new option intentionally
docs/modes.md, DESIGN.md                  — documented formula and semantics
CHANGELOG.md                              — user-visible behavior change
tests/mapper.test.ts, tests/map3d.test.ts — long-score scale, direction, width cap, determinism
```

## Phases & checklist

### Phase 1: Mapping contract

- [x] Select and document the target median spoke length, auto-scale clamp range, and
  width-to-length cap ratio.
- [x] Add pure, deterministic scale and stroke-width helpers.
- [x] Apply them only to 2D radial pitch spokes and 3D voice towers.

### Phase 2: Controls and communication

- [x] Add the Auto-relative spoke-length multiplier control and resolved-scale label.
- [x] Include the active rule in legends, summary, docs, and manifest configuration.

### Phase 3: Verification and handoff

- [x] Add Mozart-style long-score coverage proving ordinary notes are visibly longer than
  their current sub-pixel output while directions and onset placement remain unchanged.
- [x] Test stroke caps and mapper determinism; run `npm run validate`.
- [x] Update changelog, complete/archive this plan, and remove its TODO entry.

## Risks

| Risk | Mitigation |
|---|---|
| Auto scale over-amplifies unusually short scores | Clamp the automatic baseline and leave a visible user multiplier. |
| Thickness cap erases dynamic contrast | Cap only after existing velocity width calculation and only when a spoke is short. |
| Per-score auto result surprises users | Display the resolved Auto scale and include the multiplier in the exported configuration. |
