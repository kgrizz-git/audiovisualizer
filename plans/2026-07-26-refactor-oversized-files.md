# Plan: Refactor oversized files to pass 800-line hook

Last reviewed: 2026-07-26
Date: 2026-07-26
Author: agent
Status: approved
Linked issue/PR: n/a

## Goal

Two source files are near or over the 800-line hard cap enforced by
`check_file_size.py`: `src/ui/app.ts` (804 lines, currently passing via a
`policy:file-size allow=850` override) and `src/renderers/three/ThreeDRenderer.ts`
(852 lines, no override — failing the hook). Extract cohesive slices into sibling
modules so both files fall comfortably under the 800 cap and the `app.ts`
dispensation can be retired, restoring a consistent limit across the codebase.

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
| Keep the `allow=850` exemption on `app.ts` | Works today (804 < 850), but is policy-dispensation tech debt; this refactor retires it so the consistent 800 cap applies everywhere |
| Inline-compress code further | Already dense; further compression hurts readability |

## Proposed file changes

```
src/ui/app.ts                          — shrink by ~120 lines via extractions below
src/ui/soundfontLibraryUI.ts           — NEW: library prompt, download, cache-clear, cache-status
src/ui/voiceOptionsUI.ts               — NEW: per-track audio voice row DOM builder
src/renderers/three/ThreeDRenderer.ts  — shrink by ~270 lines via extractions below (Phases 3–5)
src/renderers/three/geometryBuilders.ts — NEW: buildLines, buildSlabSet, buildDiscs, buildSpheres, buildBoxes
src/renderers/three/onsetPulses.ts     — NEW: spawn/update/clear onset pulse ring meshes
src/renderers/three/sceneAtmosphere.ts — NEW: buildAtmosphere, buildNowPlane, disposeNowPlane, makeGradientBackground
```

## Tasks & checklist

### Task 1: Extract SoundFont library UI from `app.ts` (~55 lines)

Move these methods out of `AudioVisualizerApp` into `src/ui/soundfontLibraryUI.ts`
as free functions. The orchestrator passes a small callback surface so the leaf
module has no reference to `this`:

```ts
interface LibraryUIContext {
  element: <T extends HTMLElement>(id: string) => T;
  setStatus: (message: string, isError?: boolean) => void;
}
```

Methods to extract:

- `maybeShowLibraryPrompt`
- `dismissLibraryPrompt`
- `refreshCacheStatus`
- `downloadLibrary`
- `clearLibraryCache`

- [x] Create `src/ui/soundfontLibraryUI.ts` with the extracted functions
- [x] Replace inline methods in `app.ts` with delegating calls
- [x] Remove the `policy:file-size` exemption comment from `app.ts`

### Task 2: Extract voice options row builder from `app.ts` (~65 lines)

The per-track audio row DOM construction inside `updateScoreUi` (lines 316-383)
is self-contained. Extract into `src/ui/voiceOptionsUI.ts`:

- `buildAudioVoiceRow(track, index, settings, context)` — creates one row's DOM
- `applyBadge(span, status)` — patch-status badge helper
- `gmLabel(program)` / `soundbankLabel(soundbank)` — label formatters

The row's event listeners currently call private orchestrator methods
(`commitVoiceMix`, `applyVoiceRoutingChange`, `voiceRouter.setProgram`, etc.).
The extracted module stays a leaf by receiving callbacks, not references:

```ts
interface VoiceRowContext {
  engine: PlaybackEngine;
  soundbank: SoundbankPreset;
  statusMap?: Map<number, PatchStatus>;
  onProgramChange(channel: number, program: number): void;
  onTimbreChange(channel: number, timbre: VoicePlaybackSettings['timbre']): void;
  onMixChange(channel: number, settings: VoicePlaybackSettings): void;
  onMute(channel: number, muted: boolean): void;
  onSolo(channel: number, solo: boolean): void;
}
```

**Decision:** the voice-filter checkbox row (`app.ts:309-315`) stays in `app.ts`.
It is 7 lines of tight orchestrator logic (mutates `currentConfig.voiceFilter` +
re-renders) and pulling it out would trade a trivial line saving for a new
callback path. `voiceOptionsUI.ts` owns only the per-track audio voice rows
(lines 316–383).

- [ ] Create `src/ui/voiceOptionsUI.ts`
- [ ] Wire `updateScoreUi` to call the new builder per track
- [ ] Verify voice filter, mute/solo, timbre, and GM select still work

### Task 3: Extract geometry builders from `ThreeDRenderer.ts` (~180 net lines)

Move the instanced-mesh construction methods into `src/renderers/three/geometryBuilders.ts`:

- `buildLines` + `buildLineSlabs` + `buildSlabSet`
- `buildDiscs`
- `buildSpheres`
- `buildBoxes` + `bucketOpacity`

These become free functions that accept a context object carrying the coordinate
helpers, content group, reveal plane, and materials accumulators:

```ts
interface GeometryBuildContext {
  worldX: (x: number) => number;
  worldY: (y: number) => number;
  worldZ: (z: number) => number;
  contentGroup: THREE.Group;
  revealPlane: THREE.Plane;
  lineMaterials: LineMaterial[];
  revealMaterials: THREE.Material[];
  width: number;
  height: number;
}
```

`ThreeDRenderer.rebuildContent` constructs the context once and calls the
extracted functions in sequence. ~256 raw lines move out; ~180 net reduction
after delegation stubs and shared-helper imports remain.

- [ ] Create `src/renderers/three/geometryBuilders.ts`
- [ ] Update `rebuildContent` to call the extracted functions
- [ ] Verify all 3D variations render correctly (lines, discs, spheres, boxes)

### Task 4: Extract onset pulses from `ThreeDRenderer.ts` (~45 lines)

Move the pulse ring lifecycle into `src/renderers/three/onsetPulses.ts`:

- `spawnOnsetPulses`
- `updateOnsetPulses`
- `clearOnsetPulses`

Exported as a small `OnsetPulseController` class or free functions operating on
an array + content group reference.

- [ ] Create `src/renderers/three/onsetPulses.ts`
- [ ] Wire `ThreeDRenderer` to delegate pulse calls

### Task 5: Extract scene atmosphere from `ThreeDRenderer.ts` (~55 lines)

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
- [ ] Manual smoke (reveal-clip): verify reveal playback cue clips notes at the
      now-plane for `3d_lines`, `3d_note_spheres`, and `3d_boxes`; verify long
      notes show the release tail fade in `3d_lines` and `3d_note_discs`
- [ ] (Optional) Add a Vitest asserting every material pushed into
      `revealMaterials` carries `clippingPlanes.length === 1` — cheap safety net
      for the extraction since 3D rendering is browser-only and not otherwise
      under unit test

## Completion checklist

- [ ] Update plan `Status:` to `complete` with completion date
- [ ] Move plan to `plans/archive/`
- [ ] Add entry to `CHANGELOG.dev.md` (internal refactor, no user-facing change)
- [ ] Remove the completed item from `dev-docs/TO_DO.md` (do not just check it off)

## Open questions

None — resolved during review. Voice-filter checkbox row stays in `app.ts` (see Phase 2).

## Line-budget sanity check (realistic)

| File | Now | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | Projected |
|---|---|---|---|---|---|---|---|
| `src/ui/app.ts` | 804 | −55 | −65 | — | — | — | **~684** |
| `ThreeDRenderer.ts` | 852 | — | — | −180 | −40 | −50 | **~582** |

Both clear the 800 hard cap with comfortable margin. The `allow=850` comment on
`app.ts:1` is retired; `ThreeDRenderer.ts` needs no override now or after.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Extracted modules need access to many private fields | med | low | Pass only what's needed via parameters; keep orchestrator as the caller |
| Circular imports between ThreeDRenderer and extracted modules | low | med | Extracted modules are leaf dependencies; they import types only from `core/types` |
