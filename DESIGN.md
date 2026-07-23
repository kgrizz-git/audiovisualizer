# AudioVisualizer Visual Design

Last reviewed: 2026-07-22

## Intent

AudioVisualizer makes a musical score readable as a deliberate visual system rather than
an opaque decorative effect. Its visual language is dark, restrained, and high-contrast:
black is the default field; saturated pitch color carries the musical signal; spacing,
weight, direction, and opacity expose timing, dynamics, and voice.

Every shipped image must be reproducible from a normalized score, a rule configuration,
and canvas dimensions. The UI should explain the active rule set plainly enough that a
viewer can understand why the visual changes. Technical ownership, data contracts, and
libraries are documented in [ARCHITECTURE.md](ARCHITECTURE.md).

## Visual grammar

| Musical input | Visual treatment |
|---|---|
| Pitch class | Hue around a continuous rainbow loop |
| Register | Optional alternate hue spiral |
| Duration | Line distance, circle size, or time-band placement |
| Velocity | Stroke weight and aggregate-time weighting |
| Voice | Independent path plus configurable hue offset |
| Interval | Optional directional turn |
| Rest | Lifted pen, faint connector, or ghost trace |

Pitch-class colors are emitted as `hsl(hue, 85%, 60%)`. Voice color offsets retain the
rainbow family while making independent parts easier to distinguish. The optional
average-color background is deliberately dark so it supports rather than competes with
the score.

## Variations and composition

- `lines`: one directional segment per note. It is the primary, calligraphic mode.
  `chordLayout` (`polyphony` default): near-simultaneous onsets (40 ms) fan from one
  join using the Interval turns / `angleScale` rule relative to the cluster median
  pitch; staggered overlaps fork from the time-true point on active tips; with multiple
  active tips the join is their centroid; `'chain'` restores sequential end-to-start
  layout.
- `circles`: note halos whose radius and center-to-center path advance reflect duration,
  for a more punctate composition. Specifically, the center advances by the note's mapped
  length and radius is 40% of that length, with a 5px minimum; mapped length is
  `max(minSegmentLength, duration × lengthScale)`. Path heading follows the same interval
  rule as line paths when Interval turns is on; when off, centers advance straight along
  the origin heading (right / outward / inward). Standard circles have a pitch-colored
  fill at 75% opacity and a white outline. Fill versus outline currently carries no
  musical distinction: unfilled circles occur only in plotter SVG, where fills are
  removed deliberately for pen compatibility.
- `vertical_tone`: onset maps left-to-right and pitch maps vertically, making register and
  timing immediately legible.
- `tonal_time_lines`: time runs from top to bottom as full-width bands. Each band is the
  circular, velocity- and overlap-weighted average of active pitch colors; it is not a
  detected key or chord. Silent time is a low-contrast neutral band.

Origins for path-based modes are left-to-right, center-outward, and outside-inward.
Line and circle paths share Interval turns: ascending intervals always turn one way and
descending the opposite (positive `angleScale`, degrees of turn per octave, default
`180`); each semitone contributes `angleScale / 12`. Optional spiral bias adds a
constant curvature each turn and defaults to `0` so turn direction matches interval
sign unless the viewer opts into ornament. With Interval turns off, both modes advance
straight on the initial heading. Quantization snaps onsets to a sixteenth-note grid for
a deliberately more regular visual rhythm.

## Canvas and export aesthetic

The live canvas is a square framed composition with a black background, subtle atmosphere
for path/circle modes, and an optional live legend. Geometry is uniformly fitted into a
safe inset before preview and export so artwork uses the available canvas without being
cropped. Tonal time-lines deliberately fill every canvas row instead of receiving this
art padding.

SVG and PNG exports use the same calculated geometry as the preview. Standard SVG can
include the explanatory legend; plotter SVG removes background and legend and uses
single-color strokes. Legends must describe the current rule set, not imply harmonic or
musicological conclusions that the renderer does not calculate. They are mode-aware:
line paths explain distance/weight/rests, note halos explain radius plus path advance and
the non-semantic fill/outline treatment, pitch timelines explain axes, and tonal time-lines
explain aggregate active-pitch color and silence.

## Design guardrails

- Keep controls modern and compact; expose meaningful musical choices before cosmetic ones.
- Preserve contrast on black and make color an aid, not the sole explanation—legends and
  visual structure must remain useful without hue discrimination.
- Do not introduce randomness unless it is an explicit recorded configuration value.
- Treat audio-derived notes as estimated in the interface and exports; never visually
  imply they are authoritative source notation.
- Avoid a visual style that depends on a remote image, font, model, or service to function.

## Future visual directions

- Preset families and a machine-readable rule manifest.
- Accessibility patterns for pitch classes and voice paths.
- Mirror/kaleidoscope, chord-fan, bead, and staff-guide treatments as documented modes.
- A comparison view for alternate rule configurations of one score.
