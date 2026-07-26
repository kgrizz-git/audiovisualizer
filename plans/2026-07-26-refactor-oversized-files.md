# Plan: Refactor oversized files to pass 800-line hook

Last reviewed: 2026-07-26
Date: 2026-07-26
Author: agent
Status: draft
Linked issue/PR: n/a

## Goal

Two source files exceed the 800-line hard cap enforced by `check_file_size.py`:
`src/ui/app.ts` (804 lines) and `src/renderers/three/ThreeDRenderer.ts` (852 lines).
Extract cohesive slices into sibling modules so both files fall comfortably under
the limit without changing any public behavior.

## Out of scope

- Renaming public API or changing domain contracts.
- Rewriting visual rules, mapping formulas, or export aesthetics.
- Adding new features or tests beyond what the extractions need.

## Approach

Split each file by responsibility into focused sibling modules that the parent
imports. Keep the `AudioVisualizerApp` class and `ThreeDRenderer` class as the
single orchestrator; move self-contained helper groups out.

### Alternatives considered

| Option | Why not chosen |
|---|---|
| Raise the hook limit | Defeats the purpose of the policy; other files will hit it later |
| Add `policy:file-size` exemption | Already tried on `app.ts` (allow=850) but hook hard cap is 800 |
| Inline-compress code further | Already dense; further compression hurts readability |

## Proposed file changes

```
src/ui/app.ts                          — shrink by ~120 lines via extractions below
src/ui/soundfontLibraryUI.ts           — NEW: library prompt, download, cache-clear, cache-status
src/ui/voiceOptionsUI.ts               — NEW: per-track audio voice row DOM builder
src/renderers/three/ThreeDRenderer.ts  — shrink by ~200 lines via extractions below
src/renderers/three/geometryBuilders.ts — NEW: buildLines, buildSlabSet, buildDiscs, buildSpheres, buildBoxes
src/renderers/three/onsetPulses.ts     — NEW: spawn/update/clear onset pulse ring meshes
src/renderers/three/sceneAtmosphere.ts — NEW: buildAtmosphere, buildNowPlane, disposeNowPlane, makeGradientBackground
```

## Phases & checklist

### Phase 1: Extract SoundFont library UI from `app.ts` (~55 lines)

Move these methods out of `AudioVisualizerApp` into `src/ui/soundfontLibraryUI.ts`
as a class or free functions that accept the DOM element helper and status callback:

- `maybeShowLibraryPrompt`
- `dismissLibraryPrompt`
- `refreshCacheStatus`
- `downloadLibrary`
- `clearLibraryCache`

- [ ] Create `src/ui/soundfontLibraryUI.ts` with the extracted functions
- [ ] Replace inline methods in `app.ts` with delegating calls
- [ ] Remove the `policy:file-size` exemption comment from `app.ts`

### Phase 2: Extract voice options row builder from `app.ts` (~65 lines)

The per-track audio row DOM construction inside `updateScoreUi` (lines 316-383)
is self-contained. Extract into `src/ui/voiceOptionsUI.ts`:

- `buildAudioVoiceRow(track, index, settings, context)` — creates one row's DOM
- `applyBadge(span, status)` — patch-status badge helper
- `gmLabel(program)` / `soundbankLabel(soundbank)` — label formatters

- [ ] Create `src/ui/voiceOptionsUI.ts`
- [ ] Wire `updateScoreUi` to call the new builder per track
- [ ] Verify voice filter, mute/solo, timbre, and GM select still work

### Phase 3: Extract geometry builders from `ThreeDRenderer.ts` (~280 lines)

Move the instanced-mesh construction methods into `src/renderers/three/geometryBuilders.ts`:

- `buildLines` + `buildLineSlabs` + `buildSlabSet`
- `buildDiscs`
- `buildSpheres`
- `buildBoxes` + `bucketOpacity`

These become free functions that accept `RenderedGeometry3D`, the content group,
the reveal plane, and a materials accumulator. `ThreeDRenderer.rebuildContent`
calls them in sequence.

- [ ] Create `src/renderers/three/geometryBuilders.ts`
- [ ] Update `rebuildContent` to call the extracted functions
- [ ] Verify all 3D variations render correctly (lines, discs, spheres, boxes)

### Phase 4: Extract onset pulses from `ThreeDRenderer.ts` (~45 lines)

Move the pulse ring lifecycle into `src/renderers/three/onsetPulses.ts`:

- `spawnOnsetPulses`
- `updateOnsetPulses`
- `clearOnsetPulses`

Exported as a small `OnsetPulseController` class or free functions operating on
an array + content group reference.

- [ ] Create `src/renderers/three/onsetPulses.ts`
- [ ] Wire `ThreeDRenderer` to delegate pulse calls

### Phase 5: Extract scene atmosphere from `ThreeDRenderer.ts` (~55 lines)

Move scene dressing into `src/renderers/three/sceneAtmosphere.ts`:

- `buildAtmosphere` (grid + star field)
- `buildNowPlane`
- `disposeNowPlane`
- `makeGradientBackground`

- [ ] Create `src/renderers/three/sceneAtmosphere.ts`
- [ ] Wire `ThreeDRenderer` to call the extracted functions

## Verification

- [ ] `wc -l src/ui/app.ts` < 800
- [ ] `wc -l src/renderers/three/ThreeDRenderer.ts` < 800
- [ ] `npm run validate` passes (typecheck + tests + production build)
- [ ] Manual smoke: 2D variations render, 3D variations render, onset pulses animate,
      playback works, SoundFont library download/clear works, voice rows build correctly

## Completion checklist

- [ ] Update plan `Status:` to `complete` with completion date
- [ ] Move plan to `plans/archive/`
- [ ] Add entry to `CHANGELOG.dev.md` (internal refactor, no user-facing change)
- [ ] Remove the completed item from `dev-docs/TO_DO.md` (do not just check it off)

## Open questions

- [ ] Should `voiceOptionsUI.ts` also own the voice-filter checkbox row, or keep that in `app.ts`?

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Extracted modules need access to many private fields | med | low | Pass only what's needed via parameters; keep orchestrator as the caller |
| Circular imports between ThreeDRenderer and extracted modules | low | med | Extracted modules are leaf dependencies; they import types only from `core/types` |
