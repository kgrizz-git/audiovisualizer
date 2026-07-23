# Changelog

All notable **user-facing / template-consumer** changes are documented here.
Developer-only detail (hooks internals, inventory menus, tests/CI) lives in
[`CHANGELOG.dev.md`](CHANGELOG.dev.md). See [`policies/changelog-conventions.md`](policies/changelog-conventions.md).

The format follows [Keep a Changelog](https://keepachangelog.com/), and this project
uses [Semantic Versioning](https://semver.org/).

## Unreleased

### Added
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
