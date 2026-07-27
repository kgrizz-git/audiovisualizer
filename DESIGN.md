# AudioVisualizer Visual Design

Last reviewed: 2026-07-23

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

The color source can instead be a stable per-voice palette, giving each channel one
recognizable hue across the score. A visual transpose (`−24…+24` semitones) shifts pitch
placement and pitch-derived hue without changing MIDI data or audio playback; the active
legend records both choices. Canvas and standard SVG legends include compact palette
swatches, while plotter SVG remains color-free.

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
- `polar_fan`: pitch class maps to spoke angle (an octave spans 360°, so 30° per semitone, with transposed C pointing right at 0° and rotating clockwise) and duration maps to segment length, all radiating from the canvas center. Chords fan as multiple spokes simultaneously, and voices share the origin instead of walking forward. In standard Canvas, segments receive a color-matched line glow. Ignored by `gapPolicy` and `originMode`. See [`plans/specs/2026-07-26-polar-octave-fan-modes.md`](plans/specs/2026-07-26-polar-octave-fan-modes.md).
- `polar_walk`: pitch class maps to absolute direction (30° per semitone, with transposed C pointing right at 0° and rotating clockwise) and duration maps to segment length. The voice path starts at the center and walks continuously, where each note starts at the endpoint of the previous note or gap segment. In standard Canvas, segments receive a color-matched line glow. Ignored by `originMode`.
- `radial_voice_paths`: each pitched voice owns a fixed radial spoke direction derived from its register — the lowest median pitch points down (270°), the highest points up (90°), and intermediate voices alternate between the right and left branches so the vertical component rises with register (a single voice points laterally right at 0°). Voices sharing a median pitch fan ±2° apart, and more than 12 distinct registers group into 12 spoke slots with per-spoke opacity scaled by `1/n`. Each note is a segment along its voice's spoke: radial start/end encode onset/offset as a fraction of the score duration, and pitch offsets the angle ±1° per semitone from the voice median, clamped to ±5°. Percussion voices (channel 10 / percussion flag) render instead as stroke-only concentric rings centered on the canvas with radius proportional to onset time, stroke width from velocity, and stroke color from the General MIDI family (kick red, snare/clap orange, hi-hat cyan, cymbals yellow, toms green, other grey). In standard Canvas, segments receive a color-matched line glow. Ignored by `gapPolicy` and `originMode`.
- `3d_polar_fan`: the `polar_fan` geometry lifted into three dimensions. XY coordinates are identical to 2D `polar_fan` (fitted symmetrically around the canvas center), and musical time onset maps along the Z axis, turning spokes into a fanning calligraphic ribbon threading into depth.
- `3d_polar_walk`: the `polar_walk` geometry lifted into three dimensions. XY coordinates are identical to 2D `polar_walk` (fitted symmetrically around the canvas center), and musical time onset maps along the Z axis, turning the continuous walk path into a winding calligraphic ribbon threading into depth.
- `3d_radial_voice_paths`: the `radial_voice_paths` geometry lifted into three dimensions. XY coordinates are identical to the fitted 2D layout, and musical time onset maps along the Z axis, so time reads both as distance from the center (XY) and depth (Z). Percussion rings lift to discs at their onset depth, colored from the ring's family stroke color (their 2D fill is transparent).
- `3d_lines` / `3d_note_halos`: the `lines` and `circles` geometry lifted into three
  dimensions. X/Y are identical to their 2D counterparts (so the Front camera reproduces
  the 2D image); musical time advances along the positive Z axis, turning a path into a
  calligraphic ribbon and note halos into discs threading into depth. Notes are Z-extruded
  along their onset→offset so they read as solid strokes/fat rings from the side and the
  Time-up view; a dimmer tail slab over the release fraction gives long notes a gradual
  fade-out. Total Z depth is normalized to the geometry's fitted X/Y span (≈ fitted span ×
  `zScale`/100, default `zScale = 100` so depth matches the on-screen X/Y extent), so a long
  piece stays a legible, cube-proportioned solid rather than an unviewable tunnel. Rendered
  with Three.js: pitch-hued geometry glows via bloom against a graded dark field with
  exponential depth fog, and the camera uses fixed preset angles (Time up, Isometric, Front,
  Side, Bird's eye). These modes export to PNG only; SVG/plotter and
  free-orbit navigation are available through drag / wheel / pan controls: left-drag
  rotates, the wheel or pinch zooms, and panning is always enabled via right-click drag,
  shift+left-drag, or a two-finger swipe. Manual zoom gestures are folded into the
  viewport zoom when the gesture ends, so repeated pan/zoom cycles never drift. The default camera
  orientation is **Time up**: world Z (time) renders as the screen's vertical axis (time
  advances upward), with `Reveal through time` as the default playback cue. Other camera
  presets (Isometric, Front, Side, Bird's eye, Free orbit) remain available. The **Z / time
  stretch** slider (the 3D `zScale`, range 10–1200, default 100) stretches or compresses the
  Z (time) axis in real time. `3d_note_spheres` is the note-halo path rendered as
  instanced spheres — one per note — whose diameter equals the note's duration on the time
  axis (so long notes read as larger orbs threading through time), each wrapped in a soft,
  dimmer outer halo for glow. The `3d_piano_roll`
  mode maps pitch to X, voice to Y, and onset/duration to Z boxes, with velocity modulating the box opacity (quantized to 4 bands) to visualize note dynamics. A deterministic grounding
  grid and particle field support depth perception; playback can auto-follow active notes or
  chase the now-plane, while manual navigation deliberately suspends those modes. PNG and a
  six-second WebM capture are available. Playback Cue selects either the sweeping now-plane or
  the default cumulative Reveal through time, which clips future geometry at the playhead.
  SVG/plotter remain 2D-only. See
  [`plans/specs/2026-07-23-3d-time-slice-modes.md`](plans/specs/2026-07-23-3d-time-slice-modes.md).

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

2D `lines` and `circles` receive a color-matched Canvas glow: line strokes use a compact
soft shadow and note halos use a radius-scaled bloom. It is a rendering treatment only and
does not alter their deterministic geometry or SVG/plotter output.

The score canvas supports interactive zoom and pan (mouse wheel, click-drag, touch pinch/pan, keyboard shortcuts `+`/`-`/`R`/`A`, and HUD overlay). An overlay HUD (`+`, `-`, `Reset`, `Auto`, mode badge `Auto · 1 bar`) is anchored inside the canvas wrapper at the bottom-left (`z-index: 5`) with frosted glass styling, remaining clear of top-right `.stage-corner` metadata. Title headers, legend overlays, and background atmosphere remain screen-fixed while score geometry transforms within the viewport matrix.

During MIDI playback, dynamic auto-zoom is active by default and configurable across **Musical** bars (`1/16` to `16` bars, default `1`), **Time** seconds (`0` to `30s`, default `3s`), or **Full track** (`Infinity`). Active note/band bounding boxes are calculated over a symmetric sampling window `[t - W/2, t + W/2]` around current playback time `t` (where $W=0$ gives instantaneous framing) and lerp (`AUTO_ZOOM_LERP = 0.15`) to keep active performance regions centered with 75% canvas padding, easing back to full score view during silence. Musical bar durations convert to seconds assuming a fixed 4/4 meter (`4 * 60 / bpm`) via `RenderedGeometry.bpm`. Clicking the HUD mode badge cycles between Musical, Time, and Full track modes, while sidebar section 05 ("Viewport & Framing") exposes discrete step sliders and mode toggles. Manual pan/zoom interactions suspend auto-zoom so viewers can explore score detail without interference; pressing `Reset` or toggling `Auto` restores tracking.

SVG and PNG exports preserve the active preview framing using proportional pan scaling (`panX * EXPORT_SIZE / PREVIEW_SIZE`). Standard SVG can include the explanatory legend; plotter SVG removes background and legend and uses single-color strokes while maintaining the selected zoom and pan crop. Legends describe the active rule set, not implied musicological conclusions. They are mode-aware: line paths explain distance/weight/rests, note halos explain radius plus path advance and the non-semantic fill/outline treatment, pitch timelines explain axes, and tonal time-lines explain aggregate active-pitch color and silence.

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
