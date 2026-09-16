# AudioVisualizer — Music → Visual Score Art

Last reviewed: 2026-09-16

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

## Vision

The founding concept, mapping thesis, variations, and roadmap live in
[`docs/vision.md`](docs/vision.md). The normative visual rules live in
[DESIGN.md](DESIGN.md); the per-mode/control reference in
[docs/modes.md](docs/modes.md).
