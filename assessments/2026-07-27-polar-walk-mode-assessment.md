# Plan Assessment: Polar Walk Mode (Updated)

Last reviewed: 2026-07-27
Date: 2026-07-27
Reviewer: Antigravity (agent)
Scope: [plans/2026-07-27-polar-walk-mode.md](plans/2026-07-27-polar-walk-mode.md)
Status: approved

## Executive Summary

The plan to implement a `polar_walk` visualization mode has been successfully updated. We have reviewed the revised plan against our previous assessment and confirm that the design decisions and technical recommendations have been fully incorporated. The plan is now **approved** and ready for implementation.

The key design considerations have been resolved as follows:
1. **Symmetric Fitting**: Polar walk geometry will use symmetrical centering (mirroring `polar_fan`'s logic) in [fitGeometry.ts](src/core/layout/fitGeometry.ts). This ensures the visual origin remains fixed at the canvas center, preserving the pitch-class absolute angle relation.
2. **Dedicated Polyphony Helper**: The mapping will use a dedicated polar walk mapper in [scoreMapper.ts](src/core/mapper/scoreMapper.ts) (reusing only the onset-clustering helper from `polyphonicLines.ts`) instead of overloading relative-angle mapping logic.
3. **Gap/Rest Advancement**: Silence segments will advance the drawing cursor in the direction of the last played note's heading/angle, maintaining continuity.
4. **3D Lift**: The `3d_polar_walk` mode is planned for concurrent delivery by mapping the 2D layout through the existing `map3d.ts` Z-axis lifter.

---

## Detailed Technical Review

### 1. Variation Type & 3D Lift Integration
The revised plan properly integrates `polar_walk` and `3d_polar_walk` into the core systems:
* Extends `Variation` in [types.ts](src/core/types.ts).
* Configures `is3DVariation()` to support `3d_polar_walk`.
* Integrates `'3d_polar_walk' -> 'polar_walk'` in `base2DVariation()` within [map3d.ts](src/core/mapper/map3d.ts).
This is clean, robust, and leverages existing framework properties.

### 2. Geometry Fitting and Center Alignment
By adopting Option B (Symmetrical Centering) in [fitGeometry.ts](src/core/layout/fitGeometry.ts):
* The canvas center will act as the fixed origin of the polar system.
* The absolute mappings (e.g., C = 0°, E = 120°, G = 210°) remain visually consistent with the radial wind-rose aesthetic.
* This resolves the risk of off-center drift breaking the user's ability to read absolute pitch-to-angle relationships.

### 3. Rest & Gap Policy Behavior
The revised plan specifies:
* Gap direction = last heading angle (the polar angle of the last note).
* `lift_pen`, `faint_line`, and `ghost` gap policies are correctly mapped to this baseline.
This ensures silence segments extend naturally along the previous note's trajectory, matching the behavior of the `lines` mode.

### 4. Polyphony & Chord Layout
To handle simultaneous notes in a single voice:
* The plan avoids contaminating [polyphonicLines.ts](src/core/mapper/polyphonicLines.ts) (which relies on relative angles).
* It introduces a dedicated mapper block in [scoreMapper.ts](src/core/mapper/scoreMapper.ts).
* Chords under `'polyphony'` layout will fan out from the current cursor position, track active tips, and join at the centroid for the next chord, while `'chain'` layout maps them sequentially.
This is highly modular and keeps the code clean.

---

## Assessment of Phase Deliverables & Risks

The proposed plan is structured into five logically separated phases, starting with core mapping/tests, moving to polyphonic layout/gaps, then 3D/rendering, followed by UI/CLI wiring, and finishing with verification/release.

### Key Risk Mitigations Addressed:
* **Off-center drift**: Mitigated by symmetrical bounds fitting in `fitGeometry.ts`.
* **Code contamination**: Mitigated by writing a dedicated polar walk mapper in `scoreMapper.ts`.
* **Testing coverage**: Explicit test assertions for single voice, pitch-to-angle, chord polyphony, chord chain, gap policies, and 3D Z-extent are scheduled.

---

## Conclusion

The updated plan is excellent, thorough, and completely addresses all architectural, design, and structural concerns raised in the initial review. No further adjustments are required. We approve the implementation of the Polar Walk feature set as described.
