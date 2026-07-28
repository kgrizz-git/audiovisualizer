# Absolute-pitch radial spokes and voice towers

Last updated: 2026-07-28

## Intent

Keep the existing register-directed radial voice paths, while offering a clearer tonal
alternative in which a note's direction is absolute and octave-equivalent. Add a related
3D view that places each voice on a fixed tower through time. Both views must remain local,
deterministic, and reproducible from score + rule configuration.

## 2D `radial_pitch_spokes`

- A pitched voice keeps the existing register-derived radial placement: the note start is
  on the voice spoke at a radius proportional to onset time.
- The note segment direction is independent of that placement and of prior notes. With
  transposed C at 90 degrees (screen up), each pitch class advances clockwise by 30 degrees:
  `direction = 90 + 30 * (visualPitch mod 12)` in y-up degrees.
- Thus every C is parallel and points up; every G is parallel and points down-right; pitch
  classes six semitones apart are antiparallel. Segment length is proportional to visual
  duration, using the radial time scale.
- Pitch-class color is also absolute: transposed C is yellow (`hsl(60, 85%, 60%)`) and hue
  advances 30 degrees per pitch class. Voice palette/offset choices do not override this
  mode, so equal pitch classes remain visually equivalent.
- Percussion remains concentric family-colored time rings underneath pitched strokes.

## 3D `3d_voice_towers`

- Each pitched voice receives one fixed XY tower base from the register-directed radial
  layout. Musical onset maps upward on Z; notes begin at their voice tower at that onset.
- A note extends horizontally from the tower in the same absolute pitch-class direction and
  uses the same pitch-class color and duration-driven length as `radial_pitch_spokes`.
- This is a Three.js-only raster mode. The existing 3D camera, playback cue, PNG, and WebM
  facilities apply; SVG and the CLI remain 2D-only.
- Percussion uses the established time-ring/disc treatment at onset depth.

## Dynamics

- The new `Velocity opacity` option is off by default, preserving prior non-percussion
  opacity. When enabled, each normal note primitive uses
  `0.6 + 0.4 * clamp(velocity, 0, 127) / 127`. Aggregate tonal-time bands use the
  overlap-weighted mean active velocity with the same formula. 3D renderers preserve the
  per-primitive value.
- Radial percussion rings always use their own rule, updated to thickness interpolated from
  a 1/64 note at velocity 0 to a 1/32 note at velocity 127, and opacity
  `0.35 + 0.45 * clamp(velocity, 0, 127) / 127`.
