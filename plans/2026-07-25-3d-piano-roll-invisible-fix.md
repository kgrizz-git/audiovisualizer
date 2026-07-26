# Plan: 3D Piano-Roll Slab — Fix Invisible Boxes and Velocity Opacity

Last reviewed: 2026-07-25
Date: 2026-07-25
Author: opencode
Status: draft
Linked issue/PR: n/a
Incorporates:
  - tmp/assessment-20260725-232636.md (Antigravity, 2026-07-25).
  - tmp/assessment-20260726-0009.md (Antigravity, 2026-07-26) — `FrontSide` vs
    `DoubleSide` for closed boxes, the role of `revealMaterials`, and test-file
    creation.

## Goal

The `3d_piano_roll` variation renders a blank canvas except for transient onset
"explosion" rings. The boxes are produced correctly by the mapper and passed to the
renderer, but `ThreeDRenderer.buildBoxes` makes them render black-on-near-black.

This plan fixes two related defects in `ThreeDRenderer.buildBoxes`:

1. **Invisible slab (regression)** — the box material sets `vertexColors: true` with
   no per-vertex `color` attribute on `BoxGeometry`, so the
   `vColor *= color` shader chunk multiplies the instance color by `vec3(0.0)` → black
   boxes on a dark gradient. The other 3D builders (`buildSlabSet`, `buildDiscs`,
   `buildSpheres`) leave `vertexColors` at its default and rely solely on
   `InstancedMesh.setColorAt`, which works because Three.js defines
   `USE_INSTANCING_COLOR` whenever `object.instanceColor !== null`
   (`WebGLPrograms.js:199`) and routes the instance color through
   `USE_COLOR` in the fragment shader (`WebGLProgram.js:794`).
2. **Ignored per-note opacity** — `mapPianoRoll3D` already computes a per-note
   `opacity` (`0.55 + velocity / 127 × 0.4` at `src/core/mapper/map3d.ts:170`) and
   exposes it on `GeometryBox3D.opacity`. `buildBoxes` hardcodes material
   `opacity: 0.96` and never reads `box.opacity`, so the velocity signal is lost.

This restores a usable piano-roll slab and makes velocity readable as note
transparency, matching the design intent that the slab visualize dynamics.

## Out of scope

- Changing `3d_lines`, `3d_note_halos`, or `3d_note_spheres` rendering — they work.
- New visual variations, new camera presets, new playback cues.
- Renaming `GeometryBox3D.opacity` or its computation (the contract stays).
- Clip-plane (`reveal` cue) changes for boxes per se — existing
  `material.clippingPlanes = [this.revealPlane]` stays in place.
- SVG / plotter export for 3D (still unsupported).

## Approach

Single-renderer change, decomposed into two phases that ship independently:

- **Phase 1 (the regression fix)**: drop `vertexColors: true` from the box material so
  the instance-color path applies, mirroring `buildSlabSet`/`buildDiscs`/`buildSpheres`.
  Also flip `depthWrite: true` → `depthWrite: false` so the now-transparent boxes sort
  consistently with every other piece of three-dimensional content (all other builders
  already use `depthWrite: false`; the lone `true` here is leftover from before the
  transparency tuning and would z-fight once the boxes are actually visible).
- **Phase 2 (velocity opacity)**: honor `box.opacity` per instance. Three.js's
  `InstancedMesh.instanceColor` is a `vec3` attribute — `setColorAt` clips RGB to
  `[0,1]` and discards alpha, so per-instance transparency can't ride the existing
  instance-color path. The clean fix is a small number of opacity-quantized material
  groups: bucket notes by opacity into four bands (see below), each band getting its
  own `MeshBasicMaterial` with that band's `opacity`, still driven by `setColorAt`
  for the hue. This preserves `InstancedMesh`'s one-draw-call-per-band benefit.

Phase 1 is independently shippable and unblocks the user immediately; Phase 2 is a
follow-up enhancement that restores velocity-encoded transparency without touching the
mapper contract.

**Phase 2 bucketing (concrete bands)** — the mapper formula is
`opacity = 0.55 + (velocity / 127) × 0.4`, i.e. opacity ∈ [0.55, 0.95]. Bucket into four
bands using thresholds derived from that formula:

| velocity | bucket opacity |
|---|---|
| 0–23   | 0.55 |
| 24–71  | 0.70 |
| 72–111 | 0.85 |
| 112–127| 0.95 |

(thresholds are the opacity values 0.625, 0.775, 0.90 — i.e. velocities 23.81, 71.44,
111.13 — rounded so each integer velocity lands deterministically in one bucket).

**Lifecycle rule (from the assessment)** — each bucket's `InstancedMesh` **must own its
own `THREE.BoxGeometry` instance**. `ThreeDRenderer.clearContent()` traverses
`contentGroup` and calls `mesh.geometry?.dispose?.()` on every mesh; a
once-allocated-shared `BoxGeometry` would be disposed up-to-4× and cause GPU state
mismatches / future-render bugs when one bucket is removed independently. The existing
builders (`buildSlabSet`, `buildBoxes`) already allocate a fresh `BoxGeometry` per call,
so per-bucket allocation matches the existing lifecycle discipline and the overhead is
negligible (≤ 4 simple 12-triangle cubes).

### Alternatives considered

| Option | Why not chosen |
|---|---|
| Keep `vertexColors: true` and add a `color` attribute to `BoxGeometry` | Forces a custom geometry or `setAttribute('color', ...)` trip on a unit cube. More code, no benefit — the existing instance-color path works for the other three builders. |
| Phase 2 via `THREE.Color` alpha on instanceColor | Three.js `instanceColor` is a `vec3` attribute; `setColorAt` discards alpha. Would need a custom shader or `ShaderMaterial`, beyond the scope of restoring velocity signaling and a larger maintenance surface. |
| Phase 2 via one material per unique opacity | Worst case N == note count materials; loses instancing point. Bucketing keeps draw-call count bound by bucket count (4) instead of note count. |
| Move opacity into the mapper as a separate `GeometryBox3D.opacityBands` field | Leaks renderer-specific quantization into the pure mapper; the mapper should keep producing a float opacity and the renderer should bucket. |
| Share one `THREE.BoxGeometry` across the ≤ 4 bucket `InstancedMesh`es (Phase 2) | `clearContent()` disposes each mesh's geometry; a shared instance would be disposed multiply and decouple the buckets' GPU lifecycles. The 12-triangle cube is cheap to allocate per bucket; per-bucket instantiation matches `buildSlabSet`. (Surfaced by the Antigravity assessment.) |

## Proposed file changes

```
src/renderers/three/ThreeDRenderer.ts — buildBoxes: remove vertexColors:true and
  depthWrite:true; switch the box material from DoubleSide to the default FrontSide
  (closed geometry ≠ open disc/cylinder shells); add velocity-opacity bucketing
  (Phase 2). The fresh BoxGeometry-per-bucket rule lives there too (Phase 2 item 2.2).
tests/ThreeDRenderer.test.ts (NEW FILE) — assert box material flags and per-bucket
  opacity behavior via direct `renderer.contentGroup.children` inspection in a Node
  Vitest environment (no DOM/WebGL — see Verification).
DESIGN.md — note velocity-encoded box opacity as the intended slab dynamic.
ARCHITECTURE.md — document that buildBoxes uses opacity bucketing (renderer-side
  quantization) so a future agent doesn't try to push alpha through instanceColor;
  note the `revealMaterials` collection groups clip-plane-bound materials and is
  *not* the disposal vector (disposal happens in the clearContent traverse).
CHANGELOG.md — "Fixed" entry for the invisible slab regression; "Changed" entry for
  velocity opacity once Phase 2 lands.
```

## Phases & checklist

### Phase 1: Restore visible piano-roll boxes (regression fix)

This phase delivers a working `3d_piano_roll` view end-to-end. It must be reviewable
and shippable on its own.

- [ ] 1.1 In `ThreeDRenderer.buildBoxes`, remove `vertexColors: true` from the
  `MeshBasicMaterial` constructor; leave `color: 0xffffff`, `transparent: true`,
  `opacity` (Phase 1 keeps the existing hard-coded value; Phase 2 changes it).
- [ ] 1.2 Flip `depthWrite: true` → `depthWrite: false` in the same material, so the
  semi-transparent boxes sort consistently with `buildSlabSet`/`buildDiscs`/
  `buildSpheres` (which all use `depthWrite: false`). Do **not** carry `DoubleSide`
  over to the box material — boxes are closed geometry, and
  `transparent + depthWrite:false + DoubleSide` would render back-faces through
  front-faces, making the boxes read as hollow hulls. Use the material's default
  `THREE.FrontSide` instead (per the Antigravity 2026-07-26 update). Note: the other
  builders use `DoubleSide`, but their geometries (`CircleGeometry`, `CylinderGeometry`
  with `openEnded`, `SphereGeometry` seen as a shell from inside) are open; boxes are
  not.
- [ ] 1.3 Add a focused unit test (**in a new file** `tests/ThreeDRenderer.test.ts`,
  which does not yet exist) that constructs a piano-roll `RenderedGeometry3D` with
  non-empty `boxes`, calls `setGeometry` headlessly (Vitest Node environment — see
  Verification), and traverses `renderer.contentGroup.children` to assert:
  - the box `MeshBasicMaterial` has `vertexColors === false`,
  - `depthWrite === false`,
  - `transparent === true`,
  - `side === THREE.FrontSide` (i.e. equal to the material's default),
  - `material.clippingPlanes` still references the renderer's `revealPlane`.
- [ ] 1.4 Add a regression test that `InstancedMesh.setColorAt` was called per box
  and that the resulting `instanceColor` attribute carries the box's hue at the right
  index (verifying the path that was being silently zeroed-out is now live).
- [ ] 1.5 Update `CHANGELOG.md` Unreleased **Fixed** with a PATCH entry:
  "3D piano-roll slab no longer renders blank — boxes were being shaded black by a
  `vertexColors: true` material pointing at a `BoxGeometry` with no color attribute;
  instance colors now pass through correctly."
- [ ] 1.6 Run `npm run validate`; manually load a demo MIDI in the browser, switch to
  `3D piano-roll slab`, and confirm boxes are visible across all camera presets.
- [ ] 1.7 Mark Phase 1 done in this plan only after 1.6 passes (per checklist honesty).

### Phase 2: Honor per-note velocity opacity via bucketing

This phase ships as a follow-up and depends on Phase 1 being merged. It restores
the velocity signal that `mapPianoRoll3D` already computes but the renderer drops.

- [ ] 2.1 Add a private helper `bucketOpacity(opacity: number): number` returning one
  of four band centers {0.55, 0.70, 0.85, 0.95} using thresholds 0.625 / 0.775 / 0.90
  (equivalent integer-velocity split at velocities 23 / 71 / 111 — boundaries 23.81 /
  71.44 / 111.13 from `0.55 + (v/127)·0.4`). Pseudocode:
  `if (opacity < 0.625) return 0.55; else if (opacity < 0.775) return 0.70; else if (opacity < 0.90) return 0.85; else return 0.95;`
- [ ] 2.2 For each non-empty bucket, allocate a **fresh** `THREE.BoxGeometry(1, 1, 1)`
  *inside* the bucket loop and a per-bucket `MeshBasicMaterial` carrying that bucket's
  `opacity` (transparent: true, vertexColors: false, depthWrite: false, clippingPlanes:
  [this.revealPlane]). Use the default `side: THREE.FrontSide` for closed boxes (see
  item 1.2). Do **not** share a single geometry across buckets — `clearContent()`
  disposes each mesh's geometry by traversing `contentGroup` (lines 319–325 here), and
  a shared instance would be disposed up to 4× (per the Antigravity 2026-07-25
  assessment). Push each bucket material to `this.revealMaterials` to match the
  pattern of `buildSlabSet`/`buildDiscs`/`buildSpheres`; note that `clearContent` does
  **not** dispose from `this.revealMaterials` — it just reassigns the array to `[]`
  (line 318). Actual disposal happens in the `contentGroup.traverse` loop. The
  `revealMaterials` collection's real role is grouping clip-plane-bound materials
  (per the Antigravity 2026-07-26 update).
- [ ] 2.3 Keep `setColorAt` per instance in each bucket so each box keeps its hue.
  Verify the `instanceColor` write pattern matches Phase 1's regression test.
- [ ] 2.4 Update the Phase 1 unit test:
  - assert the renderer now produces a bounded number of `InstancedMesh` objects for
    boxes equal to the number of non-empty buckets (≤ 4 — not == note count),
  - assert each bucket material's `opacity` equals one of {0.55, 0.70, 0.85, 0.95},
  - assert `vertexColors === false`, `depthWrite === false`, and `side ===
    THREE.FrontSide` on every bucket material,
  - assert each bucket `InstancedMesh`'s `geometry` is a distinct instance
    (`mesh1.geometry !== mesh2.geometry`) so `clearContent` disposal is safe.
- [ ] 2.5 Add a deterministic regression test vector: a score with two notes of known
  velocities maps to boxes with the expected two distinct bucket opacities; assert both
  buckets exist and the high-velocity box sits in the higher-opacity bucket. Concretely:
  a velocity-1 note → opacity `0.55` band, a velocity-127 note → opacity `0.95` band,
  and a mid velocity test (e.g. velocity 50 → `0.70` band, velocity 90 → `0.85` band)
  nails all four bands with three notes.
- [ ] 2.6 Update `DESIGN.md` to note velocity-encoded box opacity for
  `3d_piano_roll` under the 3D slab description (around the existing
  `3d_piano_roll` reference at DESIGN.md:82).
- [ ] 2.7 Update `ARCHITECTURE.md`'s 3D paragraph (around ARCHITECTURE.md:76) to
  mention box opacity is conveyed by renderer-side bucketing, not by
  `instanceColor` alpha (which Three.js strips), so future agents don't repeat the
  mistake. Also note the box material uses `FrontSide` (closed geometry) — distinct
  from `buildDiscs`'s `DoubleSide` (open shells) — and that `revealMaterials` is the
  clip-plane-bound material group, not the disposal vector (disposal happens in the
  `contentGroup.traverse` loop of `clearContent`).
- [ ] 2.8 Add a "Changed" entry to `CHANGELOG.md` Unreleased:
  "Velocity now modulates piano-roll slab opacity (4 bands); previously the
  mapper-computed per-note opacity was dropped by the renderer. SemVer: **MINOR**."
- [ ] 2.9 Run `npm run validate`; manual browser verification: high-velocity notes
  render noticeably brighter/more opaque than low-velocity ones in the slab view.

## Verification

- [x] **Headless import sanity** (VERIFIED 2026-07-25): importing
  `ThreeDRenderer` and calling `setGeometry(map3DGeometry(...))` in `vitest run`
  (Node environment, no DOM/WebGL globals) builds the full scene graph without throwing.
  `mount()` is the only WebGL/DOM entrypoint and is never invoked; `renderOnce()`
  short-circuits on `this.renderer === null`. Confirmed by a scratch test that read
  `contentGroup.children` and asserted both the buggy material flags
  (`vertexColors === true`, `depthWrite === true`, `transparent === true`,
  `opacity === 0.96`) and a non-null `instanceColor` on the box `InstancedMesh`. The
  scratch test was deleted; the real assertions will be re-added in Phases 1/2. **No
  fallback to helper extraction is needed** — the test-strategy risk in the table below
  is closed.
- [ ] `npm run validate` (typecheck + tests + production build) passes after each
  phase.
- [ ] Existing `tests/map3d.test.ts` "maps piano-roll notes into deterministic
  pitch × voice × time boxes" still passes unchanged (mapper contract untouched).
- [ ] New unit test asserts `buildBoxes` material flags (`vertexColors === false`,
  `depthWrite === false`, `transparent === true`, `side === THREE.FrontSide`).
  (Phase 1 + Phase 2)
- [ ] New unit test asserts per-instance `setColorAt` was invoked for each box with
  the mapped hue. (Phase 1)
- [ ] Phase 2: new unit test asserts bucket count == distinct opacity-band count for
  a multi-velocity score; results land in the expected bands {0.55, 0.70, 0.85, 0.95}.
- [ ] Phase 2: assert each bucket `InstancedMesh.geometry` is a distinct instance
  (no shared-geometry disposal hazard).
- [ ] Manual browser check after Phase 1: switching to `3D piano-roll slab` shows
  colored, Z-axis-extruded boxes; they follow the playhead and reveal/now-plane cues
  behave the same as the other 3D variations.
- [ ] Manual browser check after Phase 2: loud notes render noticeably more opaque
  than soft notes; no z-fighting / flicker when orbiting through dense regions.
- [ ] PNG export (`capturePNG()`) of the piano-roll slab produces a non-blank image.

## Open questions

- [ ] Whether to keep a minimum bucketed opacity floor so very soft notes are still
  readable against the dark gradient background, or trust the current 0.55 floor.
  Owner: implementor (decide during manual check 2.9).

## Resolved by the Antigravity assessment

- Bucket count and band edges: four bands at {0.55, 0.70, 0.85, 0.95}, thresholds
  0.625 / 0.775 / 0.90 (prior placeholder proposed 1.0 as the top band — corrected to
  0.95 to match the mapper's velocity-127 cap of `0.55 + (127/127)·0.4 = 0.95`).
- Geometry-sharing disposal hazard: per-bucket `BoxGeometry` instantiation is now an
  explicit checklist item (2.2) and a test in Verification.
- Per-velocity bucket boundaries verified against the formula: 23.81 / 71.44 / 111.13
  → integer split at velocities 23 / 71 / 111.

## Resolved by direct verification (2026-07-25)

- Headless `ThreeDRenderer` import in Node/Vitest **works** end-to-end (see the
  Verification "Headless import sanity" item, now marked `[x]`). The scene graph is
  reachable via `renderer.contentGroup.children`, so Phase 1/2 tests can assert
  material flags, instance count, `instanceColor` presence, and per-bucket geometry
  distinctness directly — no fallback helper extraction is needed.

## Resolved by the Antigravity 2026-07-26 update

- **Material side for closed boxes**: use the default `THREE.FrontSide`, **not**
  `DoubleSide`, for `buildBoxes`. With `transparent + depthWrite:false + DoubleSide`,
  the back-faces of closed `BoxGeometry` render through the front-faces and read as
  hollow hulls. `buildDiscs` keeps `DoubleSide` because circles and open-ended
  cylinders are one-sided shells. Reflected in items 1.2, 2.2, 2.4, 2.7.
- **`revealMaterials` is not the disposal vector**: `clearContent()` only
  reassigns `this.revealMaterials = []` (line 318) — it does not call `.dispose()` on
  its contents. Actual disposal happens in the `contentGroup.traverse(...)` loop at
  lines 319–325. The earlier draft wording ("push materials to revealMaterials so
  clearContent disposes them") was inaccurate and has been corrected in item 2.2.
  `revealMaterials`' real role is grouping clip-plane-bound materials (visible from
  the `material.clippingPlanes = [this.revealPlane]` line immediately before each
  push). We still push to it to match `buildSlabSet`/`buildDiscs`/`buildSpheres`.
- **Test file is new**: `tests/ThreeDRenderer.test.ts` does not currently exist;
  Phase 1 creates it. The earlier `(new or existing)` hedge in Proposed file changes
  has been replaced with an unambiguous `(NEW FILE)`.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| ~~Headless `ThreeDRenderer` import fails in Node/Vitest~~ (RESOLVED 2026-07-25) | — | — | Verified directly with a scratch Vitest test under the default Node environment; scene graph is reachable via `renderer.contentGroup.children`. No helper extraction needed. |
| Phase 2 bucketing subtly changes geometry determinism for exports/manifests | low | high | Bucketing is renderer-only and non-persisted; mapper output is byte-identical. Add a test asserting `map3DGeometry` output is unchanged across phases. |
| WebGL2 driver returns non-zero for the missing `color` attribute, masking the Phase 1 bug on some machines | med | high | The Phase 1 unit test asserts the material flags directly, independent of driver behaviour, so any machine that reverts the fix fails CI. |
| Bucketing adds draw calls (up to 4) that regress dense-score playback | low | low | 4 draw calls vs 1 is still trivial; benchmark during manual check 2.9 and reconsider only if a regression is measured. |
| Shared `BoxGeometry` in Phase 2 causes double-dispose GPU state mismatch (per Antigravity assessment) | med | med | Per-bucket geometry instantiation is an explicit checklist item (2.2) guarded by a distinct-instance test in Verification. |
| Phase 1 alone makes `depthWrite: false` for the first time for boxes; previously-blended boxes change render order | low | low | Phase 1 boxes were black (invisible), so there is no visual baseline to preserve. Manual check 1.6 catches any new artefacts before ship. |
