# AudioVisualizer — Music → Visual Score Art

This repository was bootstrapped and cloned from the [template-repo-v1](https://github.com/kgrizz-git/template-repo-v1) seed template.

AudioVisualizer parses MIDI music files into deterministic, reproducible geometric artwork and animations driven by explicit pitch, duration, interval, velocity, and voice mappings.

---

## Quick Start

```bash
# Install dependencies
npm install

# Start local development server (Vite)
npm run dev

# Run the full local verification gate (tests, type-checking, and production build)
npm run validate
```

The studio includes local classical MIDI studies and links to freely licensed/public-domain
folk, ancient, and traditional MIDI sources. Source links open their license page before
you download and load a file locally; uploaded MIDI never leaves the browser.

---

# Core Concept & Vision

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
| Angle scale | semitones → degrees |
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
