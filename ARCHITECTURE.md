# AudioVisualizer Architecture

Last reviewed: 2026-07-27

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
| 3D rendering | `three` (dynamically imported) | WebGL renderer for the 3D score modes; loaded only when a 3D variation is first selected |
| Vector export | Internal SVG builder | Deterministic SVG and plotter output (2D modes only) |
| CLI rasterization | `@resvg/resvg-js` | SVG-to-PNG in Node CLI |
| SoundFont playback | Custom patch loader + Gleitz soundbank audio | Sample-based General MIDI soundbank playback with CacheStorage caching and oscillator fallback |
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

`Score` contains title, duration, first tempo, and tracks. Title resolution prefers the
MIDI sequence/header name, then the caller-supplied fallback (included-study label or
filename); blank names and known placeholders such as MuseScore's `"control track"` are
ignored so the fallback is used. `TrackScore` contains display
name, channel (`0..15`), boolean `isPercussion` (`true` for zero-indexed MIDI channel 9, corresponding to 1-indexed MIDI channel 10), MIDI program metadata (`program`), onset-sorted notes, and optional CC64 sustain pedal events (`sustainEvents`). Type-0 multi-program tracks are split into distinct split-tracks by `@tonejs/midi` `splitTracks`. `NoteEvent` has a stable parser-local id, MIDI pitch `0..127`, onset/duration in seconds, velocity `0..127`,
voice, and pitch class. `SustainEvent` records pedal state changes (`time` in seconds, CC64 `value` `0..127`, where values >= 64 indicate pedal down). Empty tracks are omitted and zero durations are clamped to
`0.01` seconds. Offline sustain helpers (`buildSustainWindows`, `getSustainedDuration`, `sustainEventsForChannel` in `src/audio/soundfont/sustainWindows.ts`) calculate sustained note release times from CC64 events for playback synthesis without altering visual geometry mapping.

`RuleConfig` is the complete reproducible mapping configuration, including
`chordLayout` (`polyphony` | `chain`) for line-path polyphony, `radialSpokeScale` (the
serializable user multiplier after the deterministic per-score radial-spoke baseline), and `zScale` (3D Z/time
stretch factor; total Z depth ≈ fitted X/Y span × `zScale`/100, default 100 → depth matches
the on-screen X/Y extent). Line-path polyphony
is resolved in the mapper (`mapScoreToGeometry`), producing export-identical geometry
for preview and SVG/PNG; the canvas scrubber does not recalculate joins or fans.
Color configuration includes pitch-class, register-spiral, and stable per-voice palette
sources plus a visual-only `transposeSemitones` shift. The mapper applies that shift only
to pitch placement and pitch-derived hue, preserving source `NoteEvent` data and playback;
CLI manifests serialize the full `RuleConfig` for reproducibility.
`RenderedGeometry` contains per-voice segments/circles or full-width tonal bands, the
score's initial tempo `bpm` (propagated from `Score.bpm` or 120 default; `RuleConfig` remains BPM-free), plus the configuration used to create them. Its public semantics are defined in
[DESIGN.md](DESIGN.md).

`ViewportTransform` defines interactive canvas/export framing (`zoom` clamped to `0.25..10.0`, `panX`, `panY`, `autoZoom`, `autoZoomMode` (`'musical'` | `'time'`), `autoZoomWindowBars` default `4`, `autoZoomWindowSeconds` default `3`). `ViewportController` (`src/core/layout/viewportController.ts`) manages viewport state, gesture math, and per-frame lerped active-note auto-zoom (`AUTO_ZOOM_LERP = 0.15`). During playback, `stepAutoZoom()` calculates active note/band bounding boxes from `RenderedGeometry` over a symmetric sampling window `[t - W/2, t + W/2]` around playhead time `t`, lerping toward target framing (with 75% canvas padding) and easing back to default full-score framing (`DEFAULT_VIEWPORT`) during silence. `calculateWindowSeconds()` converts musical bar windows to seconds (`autoZoomWindowBars * 4 * 60 / bpm`, assuming a fixed 4/4 meter and single score BPM) or returns explicit seconds / `Infinity` (Full Track mode). A window of `0` retains instantaneous active-note framing. Manual drag, wheel, or zoom interactions set `autoZoom = false` until reset (`resetView()`) or re-enabled. Both `CanvasRenderer` and `buildSvg` wrap score geometry inside a viewport matrix (`translate(w/2 + panX, h/2 + panY) scale(zoom) translate(-w/2, -h/2)`), leaving title, legend, and background elements screen-fixed. Export paths adjust pan offsets proportionally (`panX * EXPORT_SIZE / PREVIEW_SIZE`) so vector and raster exports reproduce the active preview framing without re-running note mapping. CLI rendering remains identity-framed (unzoomed).

The 3D score modes (`3d_lines`, `3d_note_halos`, `3d_note_spheres`, `3d_piano_roll`, `3d_polar_fan`, `3d_polar_walk`, `3d_radial_voice_paths`, `3d_voice_towers`; `is3DVariation()` in `src/core/types.ts`) use a separate pure mapper, `map3DGeometry()` (`src/core/mapper/map3d.ts`). Path modes run the corresponding 2D mapper (`lines` / `circles` / `polar_fan` / `polar_walk` / `radial_voice_paths`), fit it to the canvas, then lift each primitive into `RenderedGeometry3D` by attaching Z from note time; `3d_voice_towers` is a direct mapper with fixed register-derived XY tower anchors, absolute octave-class note spokes, and faint non-note tower guides through time; piano roll maps pitch × voice × onset/duration to instanced boxes. Geometry builders group primitives by mapped opacity so the optional velocity-opacity rule carries into Three.js as well as Canvas/SVG. Box materials default to `FrontSide` to ensure solid rendering of closed geometry, whereas other builders use `DoubleSide` for open shells. `3d_note_spheres` reuses the same disc geometry as `3d_note_halos` (`base2DVariation()` routes both to `circles`); `3d_polar_fan` routes to `polar_fan` (which ignores `gapPolicy` and `originMode`), and `3d_radial_voice_paths` routes to `radial_voice_paths`, whose stroke-only percussion rings lift to `GeometryDisc3D` entries colored from the ring stroke (family) color. The renderer discriminates by `config.variation` and instanced spheres (radius = `GeometryDisc3D.czExtent`, so a sphere's diameter spans the note's onset→offset on the time axis) wrapped in a dimmer outer halo sphere. Z depth is normalized against the geometry's fitted X/Y span (`effectiveZScale()` + `computeFittedSpan()`: total depth ≈ fitted span × `zScale`/100; default `zScale = 100` → depth matches the on-screen X/Y extent) so any-length score reads as a cube-proportioned solid rather than a tunnel. Notes carry Z extent (`GeometrySegment3D.startZ/endZ`; `GeometryDisc3D.czExtent` = half of note duration × effZ), which `ThreeDRenderer` extrudes along Z for side/Time-up visibility (axis-aligned instanced slabs for line segments; Z-aligned cylinders for note halos) with a dimmer release tail slab over the trailing 30% (`RELEASE_BODY_FRACTION = 0.7`) for a gradual long-note fade. Rendering is owned by `ThreeDRenderer` (`src/renderers/three/`), which implements the `I3DRenderer` interface and is the only module that imports `three`. `src/ui/app.ts` dynamically imports it on first 3D activation, swaps the visible `<canvas>` (2D vs WebGL), and drives it with serializable `ViewportTransform3D` framing (preset/free-orbit azimuth, elevation, zoom, pan, bloom, follow/chase/turntable flags). The renderer is on-demand (each mutator renders one frame; during playback only the sweeping now-plane and optional follow camera update) and must release GPU resources through `dispose()`. The `revealMaterials` array registers clip-plane-bound materials for convenience, but resource disposal is driven strictly by traversing `contentGroup` in `clearContent()`. 3D modes export to PNG or a bounded browser-native WebM capture; SVG/plotter export and the CLI remain 2D-only. See [`plans/2026-07-24-3d-calligraphic-modes.md`](plans/2026-07-24-3d-calligraphic-modes.md) and [`plans/specs/2026-07-28-absolute-pitch-radial-and-tower-modes.md`](plans/specs/2026-07-28-absolute-pitch-radial-and-tower-modes.md).

For 3D playback, `ViewportTransform3D.playbackCue` selects `now_plane` or `reveal`
(the default). Reveal updates a shared WebGL clipping plane at the playhead, hiding future
primitives without rebuilding geometry buffers. The default `ViewportTransform3D.preset` is
`3d_time_up`, which orients world Z (time) as the screen's vertical axis (time advances
upward); `ThreeDRenderer.frameCamera` sets `camera.up` to world Z and looks along world −Y
for this preset.

## Playback and source boundaries

MIDI playback supports dual engines: a sample-based General MIDI SoundFont player and a local Web Audio oscillator preview. The `VoiceRouter` maps score tracks, user mix settings (timbre, volume, mute, solo), and per-channel General MIDI program overrides (`setProgram`, `getProgram`, `clearPrograms`) to the active playback engine.

Sample SoundFont playback resolves General MIDI program numbers to Gleitz audio JS soundbanks via `SoundfontPatchLoader`, which loads local `public/soundfonts/{bank}/{instrument-mp3.js}` files (bundled offline via `npm run bundle:soundfonts`) or CDN fallback, persisting fetched scripts in browser `CacheStorage` (`soundfonts-v1`). Non-percussion patches are cached in `patchByChannelProgram` keyed by `${channel}:${program}` using the track's resolved program (combining score `track.program` with active `VoiceRouter` overrides) so multi-program tracks sharing a channel load distinct patches without collisions. Percussion tracks (channel 9, 0-indexed MIDI channel 10) load drum samples via `loadDrumKitPatch()` in `src/audio/soundfont/drumkitLoader.ts` using the bundled `drumkit-standard` slug (`public/soundfonts/FluidR3_GM/percussion/Standard-mp3.js`). Matching goldst SF2 loop metadata (`{goldstSlug}-loop.json`, bundled for the FluidR3 core/demo set or fetched from `goldst.dev`) is attached to melodic patches keyed by MIDI note number; when loop points exist for the chosen sample, `SoundfontPlayer` enables `AudioBufferSourceNode.loop` by default (no UI toggle) so sustained instruments keep sounding through pedal-held notes. Slug mismatches between gleitz and goldst filenames are resolved in `gmLoopSlugs.ts`; missing metadata soft-fails to one-shot playback. `SoundfontPlayer` tracks real-time per-track patch loading status (`getStatusMap()` returning `'loading'`, `'loaded'`, `'drumkit'`, `'drumkit-missing'`, or `'fallback'`) and honors `VoiceRouter` program overrides during playback setup. If a track's patch fails to load or the oscillator engine is selected, playback falls back to web audio synthesis for that specific track (track-scoped miss fallback prevents note doubling when one track on a shared channel fails to load). For missing drumkit patches, the Web Audio oscillator engine includes a percussion carve-out that synthesizes drum notes directly without program-based melodic sample lookup.

Both engines share a four-stage ADSR amplitude envelope (`noteEnvelope.ts`: attack `0.008` s, decay `0.04` s, sustain level `1.0`, release `0.08` s) instead of fading gain over the entire note hold. CC64 sustain pedal windows (`buildSustainWindows`, `getSustainedDuration`) extend note release on **both** the SoundFont and oscillator paths. Visual `Score.duration` stays note-based; `playbackEndTime(score)` (max of note ends and pedal-up times) governs open-pedal clamping and playhead completion so audio tails are not cut at the last note-off.

The voice-control UI distinguishes each track's MIDI source instrument from its effective
preview route. A route change during playback restarts the preview at its current playhead
so scheduled audio cannot drift from the selected controls. Solo is exclusive: it mutes the
other voices while active, and a voice is never both muted and soloed.

Playback is synchronized with the visual scrubber and uses offline sustain helpers (`sustainWindows.ts`) to compute active pedal windows from CC64 events, extending sample release times without mutating visual note geometry. Playhead stop/completion uses `playbackEndTime` so sustain-pedal tails can finish after the last written note-off.

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
