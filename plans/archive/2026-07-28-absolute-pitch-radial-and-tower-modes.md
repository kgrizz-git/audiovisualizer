# Plan: Absolute-pitch radial spokes and voice towers

Created: 2026-07-28
Status: complete (2026-07-28)
Linked issue/PR: n/a
Design spec: [`specs/2026-07-28-absolute-pitch-radial-and-tower-modes.md`](../specs/2026-07-28-absolute-pitch-radial-and-tower-modes.md)

## Goal

Add octave-equivalent, absolute pitch-direction radial spokes, a complementary 3D voice-tower
view, and an optional velocity-to-opacity mapping without changing the existing radial voice
path behavior.

## Out of scope

- SVG or CLI export for the new Three.js-only tower mode.
- Changing MIDI parsing or sending files/data off-device.

## Approach

Add two variations to the typed configuration and UI. Reuse existing deterministic register
spoke assignment and percussion rings for 2D placement; add a direct 3D tower mapper for
the spatial tower anchor. Carry a shared opacity helper through 2D and 3D geometry.

## Phases & checklist

### Phase 1: Mapping contracts

- [x] Add absolute pitch-direction/color radial mapping and updated percussion dynamics.
- [x] Add 3D voice-tower geometry and velocity-opacity configuration.

### Phase 2: Product surfaces

- [x] Add controls, legends, randomizer support, docs, and changelog entry.

### Phase 3: Verification

- [x] Add deterministic mapper and 3D coverage.
- [x] Run `npm run validate`.

## Completion checklist

- [x] Update plan `Status:` to `complete` with completion date
- [x] Move plan to `plans/archive/`
- [x] Add entry to `CHANGELOG.md`
- [x] Remove the completed item from `dev-docs/TO_DO.md`
