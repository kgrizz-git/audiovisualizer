# AudioVisualizer — Music → Visual Score Art

Last reviewed: 2026-07-31

This repository was bootstrapped and cloned from the [template-repo-v1](https://github.com/kgrizz-git/template-repo-v1) seed template.

AudioVisualizer parses MIDI music files into deterministic, reproducible geometric artwork and animations driven by explicit pitch, duration, interval, velocity, and voice mappings.

Alongside the 2D SVG-capable modes, the studio includes Three.js 3D line paths, note
halos, a piano-roll slab, and voice towers. The radial pitch-spokes mode places voices by
register and time while making every octave-equivalent pitch parallel and the same color.
Drag to orbit, wheel to zoom, right-drag/two-finger pan to
frame the score, choose a now-plane or cumulative playback reveal, and capture the active
3D view as PNG or a six-second WebM. 3D views are browser raster output; SVG and the CLI
intentionally remain 2D-only.

The visual language and rule semantics live in [DESIGN.md](DESIGN.md); the stack, data flow,
offline boundary, CLI, and planned desktop packaging live in [ARCHITECTURE.md](ARCHITECTURE.md).
For an exact, mode-by-mode and control-by-control mapping reference, see
[docs/modes.md](docs/modes.md). In the studio, select **Summary** beneath the Compose controls
to inspect the currently active rule set and values.

---

## Quick Start

```bash
# Install dependencies
npm install

# Start local development server (Vite)
npm run dev

# Run the full local verification gate (lint, tests with coverage, type-check, production build)
npm run validate
```

## Contributing

Suggestions, bug reports, and feature requests via **[GitHub Issues](https://github.com/kgrizz-git/audiovisualizer/issues)** are welcome.

**Pull requests are not solicited right now.** The project is in an early public phase and
maintainer bandwidth is limited; unsolicited PRs may be closed without merge. If you have a
concrete change in mind, open an issue first so we can decide whether to take it on.

Security vulnerabilities: see [`SECURITY.md`](SECURITY.md) (private reporting only — do not
file public issues for vulns).

### SoundFont audio preview

AudioVisualizer includes a sample-based General MIDI SoundFont engine alongside its oscillator preview. Multi-program tracks on shared channels load distinct instrument patches automatically based on their assigned programs. Percussion tracks (MIDI channel 10, zero-indexed channel 9) render using the bundled FluidR3 Standard drum kit. Support for additional drum kit variants (Room, Power, Electronic, Jazz, Brush, etc.) is deferred to the upcoming SF2 synth engine plan.

To bundle standard FluidR3 GM soundfont samples and the Standard drum kit for offline use, run:

```bash
npm run bundle:soundfonts
```

Other soundbank presets (MusyngKite, FatBoy) fetch audio samples on demand from CDN when selected in the studio controls.

Bundled soundfont audio samples and the FluidR3 Standard drum kit are derived from the Fluid R3 SoundFont by Frank Wen, licensed under [Creative Commons Attribution 3.0 (CC-BY 3.0)](https://creativecommons.org/licenses/by/3.0/). See [`public/soundfonts/LICENSE.txt`](public/soundfonts/LICENSE.txt) for details.

Each voice row identifies both the MIDI file's source instrument and the effective preview
route. Changing a voice route while playing restarts the preview at the current playhead so
the audible result matches the controls. Solo is exclusive and mutes the other voices; a
voice cannot be muted and soloed at the same time.

The studio includes local classical and ragtime MIDI scores, original modern-genre
style studies (blues, jazz, funk, electronic, hip-hop, rock, house), and **Find more
MIDI online** links to FreeMIDI.org, BitMidi, Mutopia, Wikimedia Commons, and similar
catalogs. Download a `.mid` there and drop it into the studio; rights vary by file and
site. Commercial songs are not redistributed with the app. Uploaded MIDI never leaves
the browser.

## Programmatic SVG generation

Use the CLI to generate deterministic SVG or PNG without starting the studio:

```bash
npm run render -- --input ./song.mid --output ./song.svg --mode tonal_time_lines --height 2400 --legend --manifest ./song.json
```

Use a `.png` output filename to rasterize the same SVG composition at the requested
dimensions:

```bash
npm run render -- --input ./song.mid --output ./song.png --width 2400 --height 2400
```

It shares the studio's MIDI parser, mapping rules, fitting, and SVG renderer. Run
`npm run render -- --help` for all options, including voice filtering, pitch-color and
origin rules, plotter SVG, custom dimensions, and tonal time-line density. The optional
manifest records the normalized score and exact rule configuration for reproducibility.

## Third-party licenses

Direct and transitive npm dependency licenses are cataloged in
[`inventory/third-party-licenses.md`](inventory/third-party-licenses.md) (policy:
[`policies/third-party-licenses.md`](policies/third-party-licenses.md)). Regenerate after
dependency changes with:

```bash
python hooks/scripts/check_license_inventory.py --update
python hooks/scripts/check_license_inventory.py --human-review
```

---

## Core Concept & Vision

*The following vision is copied from `music-to-visual-score-art.md`:*

Generate **visual representations from music**: geometric figures driven by pitch, duration, interval, and voice, with clearly documented rules and multiple configurations.

## Core thesis

Parse a piece (MIDI first; audio later) into note events per voice/channel, then draw according to a **published rule set** so the same input + config always yields the same art (or a controlled random seed is recorded).

The artwork should be **legible as a system**: a viewer can read the legend and roughly understand why a stroke looks the way it does—not only “AI pretty.”

## Primary mapping: colored lines per voice

One **polyline (or stroke sequence) per voice**:

| Musical attribute | Visual attribute |
|-------------------|------------------|
| Pitch / note (tone) | **Color** on a **rainbow** scale that **loops** (hue cycles with pitch class or MIDI note) |
| Note duration | **Segment length** |
| Interval to next note (optional) | **Turn angle** of the next segment |
| Velocity (optional) | Stroke **weight** and/or **alpha** |
| Voice / channel | Separate stroke (layer), optional distinct dash style or weight bias |

### Growth / origin modes (configurations)

Lines may:

1. **Start at the left** and generally progress **right** (time ≈ horizontal reading order).
2. **Start at the center** and grow **outward**.
3. **Start at the outside** (frame/ring) and grow **inward**.

These are first-class options—keep all three as presets. Optional submodes:

- **Time-driven advance:** x (or radius) follows onset time even if path turns.
- **Path-length advance:** cursor only moves by drawn length (more “turtle graphics”).
- **Spiral bias:** small constant curvature added each note (ornament, documented).

### Color

- Prefer continuous **rainbow / HSV hue** so the palette **loops**.
- Candidate defaults (pick one per preset; document exactly):
  - **Pitch-class loop:** `hue = (midi % 12) / 12 * 360` — same chroma merges across octaves.
  - **Register spiral:** `hue = (midi * k) % 360` — climbs through the rainbow as notes rise, still loops.
  - **Key-relative:** map scale degrees in a declared key to equally spaced hues; chromatic outsiders get a marked hue (e.g. desaturated).
- Optional: velocity → saturation or value; channel → slight hue offset so voices separate without leaving the rainbow family.
- Accessibility: offer **pattern overlays** (dots/dashes per pitch class) so color isn’t the only cue.

## Variations (keep as options)

| Variation | Geometry | Pitch | Duration |
|-----------|----------|-------|----------|
| **A — Lines** (primary) | Polyline segments | Rainbow color | Length |
| **B — Circles** | Disk/ring per note | Rainbow color (fill/stroke) | **Radius / size** |
| **C — Vertical tone** | Horizontal time (or spiral) | **Y position** = pitch; color may encode pitch class or velocity | Length or thickness |
| **D — Hybrid** (later) | Line path with circle “beads” at noteheads | Color on both | Length + bead size |

Optional hybrids: lines whose vertical offset also tracks pitch; circles centered along a line path; interval angle only where heading exists (A/D).

### Further geometric ideas (do not discard)

- **Mirror / kaleidoscope:** reflect the finished path across N axes (post-process; document order).
- **Chord fan:** same-onset notes draw as a fan of short segments from one point (or concentric arcs).
- **Gap policy:** rests → lift pen (break), faint connector, or “ghost” length proportional to rest.
- **Pedal / sustain:** extend segment or draw a translucent wash under held harmony.
- **Staff ghost:** very light horizontal guides at C4/octave lines for Variation C (off by default).

## Inputs

- **v1 target:** MIDI files (multi-track / multi-channel → voices); optional Type 0 vs 1 handling documented
- **Later:** audio files (transcription / onset+pitch estimate → same event model)
- **Also interesting:** live MIDI (render grows while playing); CA-exported MIDI from the sister idea

Quantize option: snap onsets to a grid before drawing (cleaner geometry; document as a toggle).

## Product requirements (non-negotiable for “done” of a tool)

1. **Rules clearly documented** — human-readable rule book (and machine-readable config) per preset
2. **Multiple configurations / options** — origin mode, variation A/B/C, interval-angle on/off, hue formula, scale/zoom, voice filters
3. **Reproducibility** — config + input (+ seed if any) → identical output
4. **Export** — image (SVG/PNG) and/or animation (frames/video); optional overlay of legend explaining the mapping
5. **Legend** — every export can include or attach “how to read this image”

## Interaction & output ideas

- Offline `midi → svg` CLI (best first slice)
- Viewer: scrub **animation** of the path drawing in musical time
- **Batch gallery:** folder of MIDIs × preset matrix → contact sheet
- **Pen-plotter-friendly SVG** (stroke-only mode, no fills) for physical prints
- Side-by-side **A/B preset compare** for the same piece
- “Explain stroke” hover: show note name, duration, interval that caused a turn

## Aesthetic controls (still rule-bound)

| Knob | Effect |
|------|--------|
| Length scale | ms or beats → pixels |
| Angle scale | degrees of path turn per octave (semitone = scale / 12) |
| Min/max segment | clamps so 64th notes remain visible |
| Voice filter | include/exclude channels |
| Background | flat, subtle gradient, or soft key-colored wash (documented) |
| Stroke cap/join | visual style only; must not change geometry semantics |

## Possible shapes

- CLI or notebook: `midi → svg`
- Small desktop/web viewer with live config panel
- Batch gallery generator for albums / portfolios
- Print pipeline (plotter / high-res PNG)

## Success criteria (early)

- MIDI → SVG (or canvas) for variation A with all three origin modes
- Documented rule sheet for each shipping preset
- At least one of B (circles) or C (vertical tone) as a second preset
- Legend export path works
- Audio input listed on roadmap, not required for v1
