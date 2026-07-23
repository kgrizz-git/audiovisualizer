# AudioVisualizer Architecture

Last reviewed: 2026-07-23

## Purpose and deployment boundary

AudioVisualizer is a browser-first TypeScript/Vite application. It accepts local MIDI,
normalizes it to a score, maps it to deterministic geometry, previews it on Canvas, and
exports SVG or PNG. It has no server, account, upload pipeline, database, analytics, or
cloud inference backend.

The codebase must remain compatible with a future offline Tauri desktop bundle. All
rendering, planned audio analysis, and model assets must work locally after installation;
remote services and CDN-only runtime dependencies are not part of the architecture.

## Stack and libraries

| Area | Current choice | Responsibility |
|---|---|---|
| Application | TypeScript + Vite | Browser build, development server, strict type checking |
| MIDI parsing | `@tonejs/midi` | MIDI binary to normalized score |
| Live rendering | Canvas 2D | Device-pixel-ratio-aware preview and PNG capture |
| Vector export | Internal SVG builder | Deterministic SVG and plotter output |
| CLI rasterization | `@resvg/resvg-js` | SVG-to-PNG in Node CLI |
| SoundFont playback | Custom patch loader + Gleitz soundbank audio | Sample-based General MIDI soundbank playback with oscillator fallback |
| Testing | Vitest | Core mapping, parser, layout, and SVG behavior |
| Planned audio transcription | `@spotify/basic-pitch` in a Worker | Local, estimated audio-to-note events; not yet installed |
| Planned desktop shell | Tauri 2 | Offline macOS-first package with scoped native file access; not yet installed |

`package.json` is authoritative for installed dependencies. Planned entries must not be
treated as shipped features until they are added, bundled, and verified.

## Runtime data flow

```text
Local MIDI ArrayBuffer
  -> parseMidiData() -> Score
  -> mapScoreToGeometry() -> RenderedGeometry
  -> ViewportController (gestures / playback auto-zoom) -> ViewportTransform
  -> CanvasRenderer (preview/PNG) | buildSvg() (SVG/CLI PNG)
```

`src/ui/app.ts` owns DOM events, active source/configuration, playback state, and export
actions. `src/core/` owns normalized domain types and pure visual mapping. Renderers only
consume calculated geometry; they must not recalculate note rules. The CLI reuses parser,
mapper, fitter, and SVG builder rather than copying browser behavior.

## Domain contracts

`Score` contains title, duration, first tempo, and tracks. `TrackScore` contains display
name, channel, MIDI program metadata, onset-sorted notes, and optional CC64 sustain pedal events (`sustainEvents`).
`NoteEvent` has a stable parser-local id, MIDI pitch `0..127`, onset/duration in seconds, velocity `0..127`,
voice, and pitch class. `SustainEvent` records pedal state changes (`time` in seconds, CC64 `value` `0..127`, where values >= 64 indicate pedal down). Empty tracks are omitted and zero durations are clamped to
`0.01` seconds. Offline sustain helpers (`buildSustainWindows`, `getSustainedDuration`, `sustainEventsForChannel` in `src/audio/soundfont/sustainWindows.ts`) calculate sustained note release times from CC64 events for playback synthesis without altering visual geometry mapping.

`RuleConfig` is the complete reproducible mapping configuration, including
`chordLayout` (`polyphony` | `chain`) for line-path polyphony. Line-path polyphony
is resolved in the mapper (`mapScoreToGeometry`), producing export-identical geometry
for preview and SVG/PNG; the canvas scrubber does not recalculate joins or fans.
`RenderedGeometry` contains per-voice segments/circles or full-width tonal bands plus
the configuration used to create them. Its public semantics are defined in
[DESIGN.md](DESIGN.md).

`ViewportTransform` defines interactive canvas/export framing (`zoom` clamped to `0.25..10.0`, `panX`, `panY`, `autoZoom`). `ViewportController` (`src/core/layout/viewportController.ts`) manages viewport state, gesture math, and per-frame lerped active-note auto-zoom (`AUTO_ZOOM_LERP = 0.15`). During playback, `stepAutoZoom()` calculates active note/band bounding boxes from `RenderedGeometry` and lerps toward target framing (with 75% canvas padding), easing back to default full-score framing (`DEFAULT_VIEWPORT`) during silence. Manual drag, wheel, or zoom interactions set `autoZoom = false` until reset (`resetView()`) or re-enabled. Both `CanvasRenderer` and `buildSvg` wrap score geometry inside a viewport matrix (`translate(w/2 + panX, h/2 + panY) scale(zoom) translate(-w/2, -h/2)`), leaving title, legend, and background elements screen-fixed. Export paths adjust pan offsets proportionally (`panX * EXPORT_SIZE / PREVIEW_SIZE`) so vector and raster exports reproduce the active preview framing without re-running note mapping. CLI rendering remains identity-framed (unzoomed).

## Playback and source boundaries

MIDI playback supports dual engines: a sample-based General MIDI SoundFont player and a local Web Audio oscillator preview. The `VoiceRouter` maps score tracks and user mix settings (timbre, volume, mute, solo) to the active playback engine.

Sample SoundFont playback resolves General MIDI program numbers to Gleitz audio JS soundbanks. Patches are loaded from local `public/soundfonts/{bank}/{instrument-mp3.js}` files (bundled offline for standard instruments via `npm run bundle:soundfonts`) with fallback to CDN fetch. If sample loading fails or the oscillator engine is selected, playback seamlessly falls back to per-track web audio synthesis.

Playback is synchronized with the visual scrubber and uses offline sustain helpers (`sustainWindows.ts`) to compute active pedal windows from CC64 events, extending sample release times without mutating visual note geometry.

Planned audio files enter through a separate local decode/transcription boundary. The adapted estimated score will reuse the same mapper/renderers, while original-audio playback will use an `HTMLAudioElement`. No raw audio leaves local memory or is included in exports.

## Export and offline behavior

Browser exports use Canvas and SVG. `npm run render` creates SVG or PNG from MIDI in
Node; it bundles the CLI with esbuild and uses `@resvg/resvg-js` as a Node runtime
external because it loads a platform-native rasterizer binary.

The browser may fetch its own static application assets during a normal web visit. A
future packaged app must contain those assets—including any Worker, WASM, and model
files—so its core workflow succeeds with the network disabled. Any optional update check
must never gate file loading, analysis, rendering, playback, or export.

## Verification and change ownership

Run `npm run validate` after implementation changes; it runs Vitest, strict TypeScript,
and a Vite production build. Add focused tests whenever parser normalization, mapping,
layout fitting, SVG/PNG serialization, or source boundaries change.

| Change | Primary documents and tests |
|---|---|
| Visual semantics or legend wording | `DESIGN.md`, mapper/SVG tests |
| Score/domain contracts | this file, `src/core/types.ts`, parser tests |
| Dependency, build, CLI, or desktop behavior | this file, `package.json`, build/CLI checks |
| Audio input/transcription | this file and [`plans/2026-07-22-audio-file-input.md`](plans/2026-07-22-audio-file-input.md) |
