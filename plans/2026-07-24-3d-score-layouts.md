# Plan: Additional 3D Score Layouts

Last reviewed: 2026-07-24
Date: 2026-07-24
Author: Codex
Status: draft
Linked issue/PR: n/a

## Goal

Extend the established Three.js score family with three complementary, deterministic
encodings: a chromagram column, voice-ribbon grid, and velocity-height spire. These offer
more directly legible pitch-class, orchestration, and dynamics views without changing the
existing 3D path modes.

## Out of scope

- Frozen 2D frame stacks/volumetric rendering, which needs a separate GPU-volume design.
- SVG/plotter or CLI export of 3D geometry.

## Approach

Add one discriminated geometry primitive/mapping branch per variation, but share the
existing normalized Z-depth, camera, cue, export, and instancing infrastructure. Use
`InstancedMesh` for all note-level solids and retain the 3D renderer boundary.

## Proposed file changes

```
src/core/types.ts, src/core/mapper/map3d.ts — variations and pure primitive mappings
src/renderers/three/ThreeDRenderer.ts       — instanced render paths and legends
src/ui/app.ts, index.html                    — variation choices and explanatory controls
tests/map3d.test.ts                          — deterministic coordinates and voice filtering
DESIGN.md, ARCHITECTURE.md, CHANGELOG.md     — visual and contract documentation
```

## Phases & checklist

### Phase 1: Chromagram column

- [ ] Map pitch class to X, octave to Y, and note duration to Z-extruded pillars.
- [ ] Add legend and deterministic mapper coverage.

### Phase 2: Voice ribbon grid

- [ ] Map voice lane to Y, pitch to X, and time/duration to Z solids.
- [ ] Verify filtered voices retain stable lane placement and colors.

### Phase 3: Velocity spire

- [ ] Map pitch to X, velocity to Y, and time/duration to Z spikes.
- [ ] Tune opacity, bloom, and camera defaults for dense scores.

## Verification

- [ ] `npm run validate` passes.
- [ ] Each layout is deterministic and supports now-plane/reveal playback cues.
- [ ] Manual dense-score smoke confirms responsive orbit and bounded GPU memory.
