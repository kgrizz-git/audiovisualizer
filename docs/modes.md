# Visual modes and controls

Last reviewed: 2026-07-28

This is the operational reference for the studio's visual modes and controls. It describes
what a viewer sees; [DESIGN.md](../DESIGN.md) remains the source for visual intent and
export aesthetics. All mappings are deterministic and apply visual transpose before
pitch-derived position or color.

## Shared controls

| Control | Default | Effect |
|---|---:|---|
| Color source | Pitch-class loop | Pitch class cycles hue each octave; Register spiral uses `(visualPitch × 7) mod 360`; Voice palette assigns a stable voice hue. |
| Visual transpose | 0 st | Shifts visual pitch and pitch-derived hue without changing MIDI or audio. |
| Growth direction | Left to right | Lines and halos begin left-to-right, center-outward, or outside-inward; polar/radial modes ignore it. |
| Duration scale | 40 px/s | Scales duration-driven segment length and halo advance. |
| Length source | Duration | Velocity uses `max(0.05s, velocity / 127 × duration)` for visual length. |
| Spoke length | Auto × 1 · user 1.00× | In Radial pitch spokes and 3D voice towers, scales an automatic baseline that targets a 24px median visible pitched spoke; the shown Auto factor is score-specific. |
| Interval turns | On | Lines and halos turn by melodic interval; off keeps their initial heading. |
| Turn per octave | 180° | A semitone contributes `angleScale / 12`; spiral bias adds a constant −20°…+20° turn. |
| Base weight | 2px | Sets the base stroke width before optional velocity scaling. |
| Velocity glow | Off | Saturation changes from 45% at velocity 0 to 100% at 127; Canvas glow also scales. |
| Velocity opacity | Off | Normal note opacity becomes `0.6 + 0.4 × velocity / 127`; radial percussion retains its own rule. |
| Uniform stroke | Off | Uses the base weight instead of `base + scale × velocity / 127`. |
| Quantize 1/16 | Off | Snaps note onsets to `60 / bpm / 4` seconds. |
| Rest treatment | Lift pen | Lifts, faintly connects, or ghost-traces silence where supported. |
| Chord layout | Polyphony | Lines and polar walk branch from time-true joins; Chain preserves sequential legacy paths. |
| Time-line density | 1× | Samples 0.5–2 tonal-time bands per output pixel row. |
| Z / time stretch | 100 | 3D time depth is normalized to fitted XY span, then multiplied by this percentage. |
| 3D camera | Time up | Selects Time up, Isometric, Front, Side, Bird's eye, or Free orbit framing. |
| Playback cue | Reveal through time | Selects a sweeping now-plane or clipping-based cumulative reveal. |
| 3D playback helpers | Off | Auto-follow, chase camera, idle turntable, and onset ring flashes alter playback presentation, not geometry. |

## lines

**LINE PATHS** are calligraphic voice paths whose turns can follow melodic intervals.

| Musical input | Visual output |
|---|---|
| Pitch class / selected hue source | hue |
| Duration | path distance |
| Velocity | stroke weight |
| Rests | lift pen |

With Interval turns enabled, a semitone turns by `angleScale / 12`; the default 180° per
octave is 15° per semitone. Polyphony branches from a time-true join and continues from the
centroid when several tips remain active.

## circles

**NOTE HALOS** place one filled, outlined circle per note along an interval path.

| Musical input | Visual output |
|---|---|
| Pitch class / selected hue source | hue |
| Duration | radius + path advance |
| Interval | path turn |
| Note event | one note (not separate data) |

The radius is 40% of mapped advance with a 5px minimum. Disable Interval turns to advance
on the initial heading instead.

## vertical_tone

**PITCH TIMELINE** is a direct 2D reading of timing and register.

| Musical input | Visual output |
|---|---|
| Time | left to right |
| Pitch | vertical position + hue |
| Duration | segment length |
| Velocity | stroke weight |

## tonal_time_lines

**AVERAGE ACTIVE PITCH** renders dense time bands rather than individual notes.

| Musical input | Visual output |
|---|---|
| Time | top to bottom |
| Active note hues | circular average of active notes |
| Velocity × overlap | velocity × sounding overlap |
| Silence | silence (not a key/chord) |

Each row is a time bin. Its hue is a circular mean of sounding pitch colors, weighted by
overlap and velocity; it does not infer a key or chord.

## polar_fan

**POLAR OCTAVE FAN** makes an octave a full wind-rose around the shared center.

| Musical input | Visual output |
|---|---|
| Pitch class | spoke angle (octave = 360°) |
| Duration | segment length |
| Velocity | stroke weight |
| Voices | canvas center |
| Chords | fan from the origin |

Transposed C points right at 0° and each semitone advances 30° clockwise. Origin and rest
controls do not apply.

## polar_walk

**POLAR WALK** is a continuous path that changes to an absolute pitch-class direction for each note.

| Musical input | Visual output |
|---|---|
| Pitch class | absolute path direction (30° per st) |
| Duration | segment length |
| Velocity | stroke weight |
| Voice path | starts at center and walks continuously |
| Rests | lift pen |

Unlike polar fan, each voice advances from its previous endpoint. Same-onset notes can fan
from their current join under Polyphony.

## radial_voice_paths

**RADIAL VOICE PATHS** place each pitched voice on a register-derived spoke through time.

| Musical input | Visual output |
|---|---|
| Voice register | spoke direction (bass ↓, treble ↑) |
| Onset / duration | distance from center; duration → length |
| Velocity | stroke weight |
| Percussion | concentric rings (family → color) |

Pitched notes tilt up to ±5° from their voice spoke by distance from its median pitch.
Percussion ring thickness interpolates from a 1/64 note to a 1/32 note and opacity is
`0.35 + 0.45 × velocity / 127`.

## radial_pitch_spokes

**RADIAL PITCH SPOKES** use the same register/time placement as radial voice paths, but
note direction and color are absolute pitch-class mappings.

| Musical input | Visual output |
|---|---|
| Voice register | radial placement |
| Onset | distance from center |
| Pitch class | absolute direction + color |
| C / tritone | yellow + up; 6 st → antiparallel |
| Duration | auto baseline × 1× |
| Percussion | concentric family-color rings |

Transposed C is yellow and points up; every semitone adds 30° clockwise and 30° of hue.
Thus octave-equivalent notes are parallel and identically colored. The generic Color source
control does not override this categorical mapping. The automatic baseline brings the median
visible pitched spoke to 24px, clamped to 1×–96× of literal duration length; the Spoke length
control multiplies that baseline. Stroke width is capped at 28% of final spoke length so short
notes remain lines rather than dots.

## 3d_lines

**3D LINE PATHS** lift the line-path geometry into depth.

| Musical input | Visual output |
|---|---|
| 2D line mapping | interval path (same as line paths) |
| Musical time | musical time |
| Velocity | stroke weight |
| Playback | current playback moment |

X/Y reproduce fitted line paths; Z is onset-to-duration depth. Use camera and playback-cue
controls to frame or reveal the score.

## 3d_note_halos

**3D NOTE HALOS** lift note halos into depth as discs with visible side bodies.

| Musical input | Visual output |
|---|---|
| 2D halo mapping | note-halo path (same as note halos) |
| Onset | onset time |
| Duration | radius |
| Playback | current playback moment |

The front view matches fitted 2D halos; Z exposes timing and duration.

## 3d_note_spheres

**3D NOTE SPHERES** use the halo layout but render each note as a luminous sphere.

| Musical input | Visual output |
|---|---|
| 2D halo mapping | note-halo path (same as note halos) |
| Onset | onset time |
| Duration | note duration |
| Outer shell | outer glow shell |

Sphere diameter follows the note's Z-duration extent, so longer notes form larger orbs.

## 3d_piano_roll

**3D PIANO ROLL** is a pitch × voice-lane slab whose depth reads as time.

| Musical input | Visual output |
|---|---|
| Pitch / voice | pitch; Y → voice lane |
| Onset / duration | onset + duration |
| Velocity | velocity |
| Playback | current playback moment |

Each note is a box. Its color follows the selected hue source; historical box opacity uses
velocity bands, while Velocity opacity applies the shared 0.6–1.0 curve.

## 3d_polar_fan

**3D POLAR OCTAVE FAN** lifts the 2D fan into time depth.

| Musical input | Visual output |
|---|---|
| Pitch class | polar fan (pitch class × 30°) |
| Onset | onset time |
| Duration | segment length |
| Playback | current playback moment |

The XY plane matches polar fan; Z is onset time. C remains at the right-hand 0° direction.

## 3d_polar_walk

**3D POLAR WALK** lifts the continuous polar walk into time depth.

| Musical input | Visual output |
|---|---|
| Pitch class | polar walk (pitch class × 30°) |
| Onset | onset time |
| Duration | segment length |
| Playback | current playback moment |

The XY plane preserves the fitted 2D continuous walk; Z makes its time ordering visible.

## 3d_radial_voice_paths

**3D RADIAL VOICE PATHS** lift register-derived radial paths, including percussion rings.

| Musical input | Visual output |
|---|---|
| Voice register | voice spokes (register → direction) |
| Onset | onset time |
| Percussion | time rings lifted to discs |
| Playback | current playback moment |

The XY view matches 2D radial voice paths; percussion rings become colored discs at onset depth.

## 3d_voice_towers

**3D VOICE TOWERS** give each voice a fixed XY tower and emit absolute pitch-class spokes
at the note's onset height.

| Musical input | Visual output |
|---|---|
| Voice register | fixed XY tower |
| Onset | onset time |
| Pitch class | absolute spoke direction + color |
| C / tritone | yellow + up; 6 st → antiparallel |
| Duration | auto baseline × 1× |
| Playback | current playback moment |

A faint vertical guide marks each tower. This mode shares the C-up/yellow categorical
mapping with `radial_pitch_spokes`; it uses the same 24px-median automatic baseline, 1×–96×
clamp, user Spoke length multiplier, and 28%-of-length stroke cap. Percussion remains
family-colored onset discs.

## 3D viewing and playback

All 3D modes are Three.js raster views: PNG and six-second WebM capture are available, but
SVG, plotter SVG, and the CLI remain 2D-only. Time up is the default camera: world Z is
screen-vertical and advances upward. Playback cue selects a sweeping now-plane or cumulative
Reveal through time; auto-follow, chase camera, and idle turntable affect framing only.
