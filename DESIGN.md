# AudioVisualizer Design

Last reviewed: 2026-07-21

## Purpose and boundary

AudioVisualizer is a browser application that turns a MIDI file into deterministic
geometric artwork. Version 1 accepts MIDI only; it does not transcribe audio, use a
server, persist uploads, or include a desktop wrapper. A given normalized score,
mapping configuration, and canvas size must always yield the same geometry and SVG.

The browser can also audition a score through a local Web Audio preview synth. This is
timing-synchronized with the visual scrubber, but is not General MIDI playback: it uses
simple oscillator timbres and does not yet reproduce program changes or sustain. Each
voice exposes a local timbre, volume, mute, and solo control; parsed MIDI program names
are retained as metadata for future soundfont routing.

## Architecture

```text
MIDI ArrayBuffer
  -> parseMidiData() -> Score
  -> mapScoreToGeometry() -> RenderedGeometry
  -> CanvasRenderer (preview) | buildSvg() (download)
```

`src/core/` is pure domain logic except for `@tonejs/midi` parsing. Renderers consume
already calculated geometry. `src/ui/app.ts` owns browser events, selected score and
configuration; it must not duplicate mapping rules.

## Domain contracts

`Score` contains its title, total duration in seconds, first tempo in BPM, and ordered
tracks. Each `TrackScore` contains the display name, MIDI channel (or track index when
the channel is absent), and onset-sorted `NoteEvent`s.

Each `NoteEvent` has a stable parser-local id, MIDI pitch `0..127`, onset and duration
in seconds, velocity `0..127`, voice, and pitch class `pitch % 12`. MIDI tracks with no
notes are omitted. Missing/zero durations are clamped to `0.01` seconds by the parser.

`RuleConfig` is the complete rule set recorded in `RenderedGeometry`. Current shipping
controls are variation, origin, hue mode, length scale, angle scale, base stroke width,
voice hue offset, spiral bias, interval-angle enablement, voice filtering, quantization,
and gap treatment. Quantization snaps onsets to a sixteenth-note grid derived from the
score tempo. A null voice filter includes every voice.

## Mapping rules

For every nonempty track, map notes in onset order independently. The mapper creates a
separate `GeometryVoicePath` for that track; path order matches `Score.tracks` order.

| Musical input | Rule | Result |
|---|---|---|
| Pitch class | `(pitchClass / 12) * 360` | Hue in `pitch_class` mode |
| Register | `(pitch * 7) % 360` | Hue in `register_spiral` mode |
| Voice | `voice * hueOffsetPerVoice` | Added to hue, modulo 360 |
| Duration | `max(minSegmentLength, duration * lengthScale)` | Segment length; circle radius is 40% of this, minimum 5 |
| Velocity | `strokeWidthBase + velocity / 127 * strokeWidthScale` | Line width |
| Melodic interval | `(pitch - previousPitch) * angleScale` | Heading change for line paths |
| Spiral bias | Constant degrees per mapped note | Additional curvature |
| Rest gap | Lift, faint connector, or dashed ghost | Cursor advance with optional visual trace |

When quantization is enabled, onset is rounded to `60 / bpm / 4` seconds before mapping.
For `lines` and `circles`, a rest advances the cursor by `restSeconds * lengthScale`.

Colors are emitted as `hsl(hue, 85%, 60%)`; line opacity is `0.9`, circle opacity is
`0.75`, and vertical-tone opacity is `0.85`.

### Variations and origins

- `lines`: starts at the origin cursor, turns for each interval after the first note,
  then emits one segment per note.
- `circles`: emits one circle per note at the current heading, advances the heading by
  `spiralBias + 15` degrees, then moves the cursor to that circle.
- `vertical_tone`: maps onset to x and pitch to y inside a 50px inset. Its segment runs
  horizontally by mapped length; origin mode does not affect this variation.
- `left_to_right`: starts at x=50 with a channel-dependent y offset and a rightward heading.
- `center_outward`: starts at canvas center with a channel-dependent radial heading.
- `outside_inward`: starts at 45% of the minimum canvas dimension from center and faces inward.

## Rendering and export

Canvas is the live preview. It scales its backing buffer for device pixel ratio and uses
score seconds—not segment count—for playback and scrubbing. A note segment reveals over
its actual duration; a circle appears at its onset. PNG export captures the completed
canvas with its legend.

SVG export uses the same `RenderedGeometry` at 1000×1000 by default. Standard SVG has a
background rectangle and can include the rule legend. Pen-plotter SVG omits both the
background and legend, uses black 1px strokes, and leaves circles unfilled. SVG is built
as data only; it must not serialize untrusted MIDI text into markup.

Before preview or export, geometry receives one uniform, deterministic fit transform.
The transform measures all segment and circle bounds, applies a 56px safe padding, and
centers the result without changing the mapped note data or rule configuration.

## Verification contract

Run `npm run validate` after any change. The command runs Vitest plus strict TypeScript
and the Vite production build. Tests should assert deterministic geometry, variation
selection, and SVG export modes; add parser fixtures when changing MIDI normalization.

## Deferred work

- Add configuration presets and a machine-readable export manifest.
- Add video or frame-sequence export.
- Consider audio input only as a separately designed transcription feature.
