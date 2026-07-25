# Changelog

All notable **user-facing / template-consumer** changes are documented here.
Developer-only detail (hooks internals, inventory menus, tests/CI) lives in
[`CHANGELOG.dev.md`](CHANGELOG.dev.md). See [`policies/changelog-conventions.md`](policies/changelog-conventions.md).

The format follows [Keep a Changelog](https://keepachangelog.com/), and this project
uses [Semantic Versioning](https://semver.org/).

## Unreleased

### Added
- Per-voice color palettes, compact Canvas/SVG palette swatches, and visual-only semitone
  transposition (including reproducible CLI `--hue` and `--transpose` options). SemVer: **MINOR**.
- Stronger default 3D bloom and color-matched Canvas glow for 2D line paths and note halos.
  SemVer: **MINOR**.
- A 3D Playback Cue selector: retain the now-plane or cumulatively reveal score geometry
  through the playhead without rebuilding WebGL buffers. SemVer: **MINOR**.
- 3D piano-roll slab mode plus free orbit/pan/zoom navigation, deterministic depth grid and
  particle field, onset pulses, playback auto-follow/chase camera, idle turntable, and
  six-second WebM capture for all 3D score modes. SemVer: **MINOR**.
- 3D score modes (`3D line paths`, `3D note halos`): the existing line-path and note-halo geometry threads through depth, with musical time mapped to the Z axis. Rendered with Three.js — glowing bloom, atmospheric depth fog, a sweeping "now-plane" that marks the current playback moment, and fixed camera angles (Isometric / Front / Side / Bird's eye). New "Time depth", "Glow", and "Camera angle" controls. PNG export is supported; SVG/plotter export is not yet available for 3D. Three.js loads on demand, so 2D-only sessions are unaffected. SemVer: **MINOR**.
- Configurable auto-zoom windowing modes (Musical bars vs Time seconds vs Full track) with symmetric time/bar sampling window slider controls, HUD status mode indicator, and preset reset actions. SemVer: **MINOR**.
- On-demand full SoundFont library download: a first-launch prompt and a "SoundFont library" panel (Refine section) let you cache all 128 FluidR3 GM instruments (~320 MB) for offline use, with live progress, cancel, cache-count status, and a clear-cache action. SemVer: **MINOR**.
- Engine-aware voice controls with dynamic per-track UI switching between General MIDI instrument selection (SoundFont mode) and oscillator waveform selection (Synth mode). SemVer: **MINOR**.

### Changed
- The app now opens with the Bach Prelude in C study instead of the generative study, and every bundled demo MIDI's instruments ship as local samples so the included studies play from SoundFont offline. SemVer: **MINOR**.

### Fixed
- SoundFont preview no longer fades sustained notes to silence mid-hold: a shared ADSR envelope
  replaces the old attack-then-fade-over-the-whole-note gain curve on both sample and oscillator
  engines. SemVer: **PATCH**.
- CC64 sustain pedal now extends note duration on the oscillator/fallback path (parity with
  SoundFont playback). SemVer: **PATCH**.
- Playback no longer cuts off at visual score end while the sustain pedal is still down or release
  tails are ringing: `playbackEndTime` allows audio to finish before stop. SemVer: **PATCH**.
- Sustained GM instruments (strings, organs, pads) keep sounding for held/pedaled notes: goldst
  loop metadata enables `AudioBufferSourceNode` looping by default when bundled or CDN metadata
  exists. SemVer: **PATCH**.
- Voice controls now distinguish a MIDI file's source instrument from the active preview
  route, and changing a route during playback restarts the preview at the current playhead.
  Solo is exclusive, mutes the other voices, and is mutually exclusive with mute on the
  same voice. SemVer: **PATCH**.
- Switching the 3D Playback Cue from "Now-plane" to "Reveal" no longer leaves one or more
  glowing now-planes stuck in the scene: each geometry rebuild now removes the previous
  plane instead of orphaning it, and cue visibility updates immediately even while paused.
  SemVer: **PATCH**.
- Current score title no longer shows MuseScore's `"control track"` placeholder for bundled full-score MIDIs; the included-study label (or filename) is used instead. SemVer: **PATCH**.
- Non-bundled instruments now load from the CDN instead of silently using the synth: the loader previously accepted the SPA `index.html` that dev servers / static hosts return (with a 200 status) for a missing local asset, so it never tried the CDN and cached the bad response. It now validates that fetched and cached content is a real soundfont script, self-healing any poisoned cache entries. SemVer: **PATCH**.
- Playback no longer cuts off partway through dense scores: notes are now scheduled a short window ahead of the playhead instead of allocating every Web Audio source node up front (thousands at once tripped a Chrome scheduling limit and silenced playback). SemVer: **PATCH**.
- SoundFont patches no longer silently fall back to the synth: the midi-js patch parser now tolerates the trailing comma present in the real soundfont scripts, which previously made every patch fail to load. SemVer: **PATCH**.
- Per-track General MIDI instrument override support in `VoiceRouter` and `SoundfontPlayer`. SemVer: **MINOR**.
- Persistent SoundFont patch caching via browser `CacheStorage` (`soundfonts-v1`) to accelerate audio loading and work offline after initial fetch. SemVer: **MINOR**.
- Real-time patch load status badges (`✓ Loaded`, `⚡ Synth Fallback`, `⏳ Loading…`) and engine-aware status summary during audio playback. SemVer: **MINOR**.
- Interactive canvas preview zoom and pan controls with mouse wheel, click-drag, touch pinch/pan, HUD overlay (`+`/`-`/`Reset`/`Auto`), keyboard shortcuts (`+`/`-`/`R`/`A`), and sidebar section 05. SemVer: **MINOR**.
- Dynamic playback auto-zoom tracking active note / band bounding boxes during MIDI preview, with lerp-out during silence. SemVer: **MINOR**.
- Viewport framing preservation across SVG, PNG, and pen-plotter exports with proportional pan resolution scaling. SemVer: **MINOR**.
- General MIDI SoundFont audio preview with selectable engines (Sample SoundFont / Oscillator synth) and banks (FluidR3 GM, MusyngKite, FatBoy), supporting CC64 sustain pedal windows and voice-router mixing. SemVer: **MINOR**.
- Line-path **chord layout** control (`polyphony` | `chain`): polyphonic branching with
  time-true joins and 40 ms onset clustering; legacy sequential chain available.
  SemVer: **MINOR**.
- Export title feature: MIDI filename (or embedded header name) displays as a visible title on canvas previews and SVG/PNG exports, with an editable text field for manual override. SemVer: **MINOR**.
- CLI `--title` flag to override export title and `--include-plotter-title` flag to force title inclusion in plotter mode (stroke-only styling). SemVer: **MINOR**.
- Spiral bias slider (−20°…+20°) so line/circle paths can take optional constant
  curvature without changing the default mapping.
- Included-studies dropdown: public-domain Joplin *Maple Leaf Rag* and Bowman
  *12th Street Rag*, plus original blues / jazz / funk / electronic / hip-hop /
  rock / house style-study MIDIs (commercial songs stay out of the bundle for
  copyright).
- README pointer to the third-party license inventory and regeneration commands.
- “Find more MIDI online” links to FreeMIDI.org, BitMidi, Mutopia, Wikimedia
  Commons, and an MIT chord-pack repo (download locally; drop into the studio).
  SemVer: **PATCH**.

### Changed
- Default line mapping uses polyphonic joins/fans instead of sequential chaining when
  notes overlap. Choose **Chain (legacy)** to restore the previous look. SemVer: **MINOR**.
- Default `spiralBias` is `0` (was `2`) so interval turns map ascending/descending
  pitch to opposite heading directions without a constant skew. SemVer: **MINOR**.
- Circle (note halo) paths use the shared Interval turns control: on → turn by melodic
  interval (same sign rule as lines); off → advance straight on the origin heading.
  Removes the former fixed +15° per-note turn. SemVer: **MINOR**.
- Turn scale is now **degrees per octave** (`angleScale`, default `180`, UI 0–360 step
  15). Semitone contribution is `angleScale / 12` (default still 15°/semitone).
  SemVer: **MINOR** (config unit change).
- Local synth defaults assign distinct oscillator timbres by voice order (sine →
  triangle → sawtooth → square, then wrap), not by MIDI program family. SemVer: **PATCH**.

## [0.4.4] - 2026-07-09

### Added
- Advisory open-PR check for agents after push / about once a day
  (`ci/scripts/check_open_prs.py`, guidance in commits policy and session prompts).
  Optional non-blocking daily workflow example; not a git hook.
  Agents check `.context/open-prs-check.stamp` first and skip the script when
  the stamp is fresh (saves tokens vs always launching the check).

## [0.4.3] - 2026-07-09

### Added
- Inventory: Archon harness builder; Pantheon (K-Dense) multi-persona brainstorming;
  cross-IDE handoff pattern links; expanded Sphinx/Pandoc docs guidance.

## [0.4.2] - 2026-07-09

### Added
- Inventory: AI code-wiki / repo-doc tools (Google Code Wiki, DeepWiki, deepwiki-open,
  RepoWiki, FSoft CodeWiki, repowise) plus Ry Walker code-intelligence survey.

## [0.4.1] - 2026-07-09

### Added
- Policy and script for GitHub Actions minutes/storage stewardship
  (`policies/github-actions-usage.md`, `ci/scripts/check_gha_usage.py`).

### Changed
- Firecrawl inventory entry is product-only (no API-key dashboard link).

## [0.4.0] - 2026-07-09

### Added
- Conventions for dual changelogs, plans/TODO lifecycle and archiving, and clearer
  agent entry stubs (`AGENTS.md` / `GEMINI.md` / `QWEN.md` / `CLAUDE.md`).
- Pre-commit policy hook for oversized living `to_do` / `TODO` backlogs; documented
  secret-scan and lint hooks already in the example config.
- Expanded harness and code-mapping inventory (agent quality patterns, Graphify,
  security plugin, license compliance, crawl tooling).

### Changed
- Default source-file soft warn raised to **600** lines (hard **1000**); see
  [`policies/file-size-and-counts.md`](policies/file-size-and-counts.md).

## [0.3.0] - 2026-07-09

### Changed
- Fixed Obra inventory pointers: replace dead `obraunsdorf/obra-superprompts` with
  `obra/superpowers`, `obra/superpowers-skills`, and `obra/superpowers-marketplace`.

### Added
- Harness reading: Loop Engineering (Addy Osmani) and Agent Patterns catalog links.
- OpenCode permission/config links for constraining filesystem writes.
- SonarQube Community menu entries (security-quality + github-apps).
- `datalab-to/lift` under RAG document parsing (schema-constrained PDF/image JSON).
- `genius-code-review` skill pointer in skills-index.
- `backups/` gitignore entry; optional prune-hook note in `hooks/README.md`.

## [0.2.0] - 2026-06-26

### Added
- Initial published template baseline (prompts, policies, hooks, CI examples, inventories).
