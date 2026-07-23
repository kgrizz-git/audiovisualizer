# Plan: Local Audio File Input and Transcription

Last reviewed: 2026-07-22
Date: 2026-07-22
Author: Codex
Status: draft (revised 2026-07-22 after codebase-fact-check assessment)
Linked issue/PR: n/a

> Revision note: incorporates the 2026-07-22 assessment
> (`tmp/2026-07-22T2350-audio-file-input-plan-assessment.md`). Key corrections:
> the browser exporters have **no** existing manifest (net-new, not an
> "extension"); `TrackScore`/`Score.bpm` force synthetic MIDI-shaped values in
> the adapter; Vite needs explicit worker+WASM config; rule #2 doc updates are
> now checklist items; `setScore` is private and the ownership of score
> ingestion is decided below; `sourceKind` is encoded once as a typed contract.

## Goal

Let a user load a local audio recording—initially MP3, WAV, and browser-decodable M4A/AAC—and
turn its estimated note events into the same visual scores, playback timeline, and exports that
MIDI uses today. The app remains local-only: neither the audio file nor its analysis is uploaded.

The first shipping implementation will use `@spotify/basic-pitch` (the maintained TypeScript
implementation of Basic Pitch) for polyphonic audio-to-note estimation. It is a better fit than
building a custom pitch detector because it produces multi-pitch note events and runs in a
browser. The analysis model must be loaded lazily and run in a Worker. Browser-native
`AudioContext.decodeAudioData()` will decode complete local files before transcription.

This is explicitly **offline-first and desktop-bundle-ready**. The browser app remains a useful
delivery target, but the same Vite frontend must be able to ship inside a Tauri desktop bundle.
All analysis code, WebAssembly, and model data must be included in the installed artifact; the
app must not require a cloud API, a hosted inference backend, a CDN import, or an account.

## Scope and user-facing contract

- Accept `.mp3`, `.wav`, `.m4a`, `.aac`, `.flac`, `.ogg`, and `.opus` only when the current
  browser can decode the supplied file; advertise MP3 and WAV as the cross-browser baseline.
- Treat M4A as a container, not a codec promise: typical Apple AAC-in-M4A should work in Safari;
  ALAC and some AAC profiles may not decode in every browser.
- Show an explicit **“estimated from audio”** badge, analysis progress/cancel state, duration,
  and a confidence control. Do not present inferred notes as source-of-truth MIDI.
- Convert accepted Basic Pitch note events through a single adapter to the existing `Score` /
  `TrackScore` / `NoteEvent` contract, then reuse every existing mapper and exporter. Because
  `TrackScore` requires `channel`, `program`, and `instrumentName`, and `Score` requires `bpm`
  (all MIDI-shaped, non-optional in `src/core/types.ts`), the adapter fabricates deterministic
  placeholders (e.g. `channel: 0`, `program: 0`, `instrumentName: "Estimated"`, a nominal `bpm`)
  and records the real analysis facts in the separate `AudioAnalysisMetadata`, never in the
  rendering contract. `confidence`-derived velocity stays internal to the adapter (no
  `confidence` field is added to `NoteEvent`).
- Introduce a single typed `sourceKind` (`'midi' | 'audio'`) contract used everywhere source
  provenance matters — app state, legend/export labeling, and the export manifest — rather than
  scattering ad-hoc booleans/strings.
- Audition original audio through an `HTMLAudioElement`, synchronized with the visual scrubber.
  Keep the existing oscillator voice controls MIDI-only.

## Out of scope

- Perfect transcription, stem separation, key/chord naming, lyrics, or copyrighted-source
  acquisition.
- Server-side processing, storage, telemetry, or upload.
- A required cloud service or live internet connection after the application/assets have been
  installed. Optional update checks must not block any creative workflow.
- A guarantee that every Apple audio format works in every browser; support is decoder-dependent.
- Audio-file input for the Node CLI in this first plan. The CLI currently has no general audio
  decoder or ML runtime; add it only after the browser workflow is accepted.
- Replacing the existing MIDI parser or its deterministic rendering contract.

## Approach

Create an audio-input boundary parallel to the MIDI parser. It will decode a `File` locally,
downmix/resample only as required by the model, run Basic Pitch in a dedicated Worker, and adapt
the returned notes to one estimated `TrackScore`. The adapter will preserve generated ids,
onsets, durations, MIDI pitches, and confidence-derived velocities, while retaining analysis
metadata separately from the stable rendering contract.

Basic Pitch will be lazily imported only after an audio file is selected; model and worker assets
will be bundled with explicit Vite URLs and cached for the browser session. In a desktop build,
those same assets must be packaged as application resources rather than fetched remotely. Analysis happens in
bounded chunks or a worker protocol that reports progress and supports cancellation, so the UI
never freezes on full songs. The original decoded/playable audio remains only in browser memory
and object URLs are revoked when replaced.

The offline fallback is honest rather than artificial: if a codec cannot be decoded or the local
transcription model cannot initialize, retain local audio audition and offer a clear MP3/WAV
conversion recommendation; do not silently send the file to a service or fabricate note events.
Evaluate an entirely bundled Essentia.js monophonic/onset fallback only if the Basic Pitch spike
shows a material platform gap; it must carry the same local-only guarantee and be labelled
melody-estimated.

### Alternatives considered

| Option | Why not chosen for the first shipping path |
|---|---|
| `@spotify/basic-pitch` in a Worker | Chosen: purpose-built polyphonic audio-to-MIDI, TypeScript/browser implementation, note-event output fits `Score`. |
| Essentia.js WebAssembly (`PitchYinProbabilistic` + onset detection) | Valuable future analysis tool, but assembling reliable polyphonic note segmentation ourselves is more work and lower fidelity for full songs. |
| Web Audio analyser only | Suitable for spectrum-reactive artwork, but does not produce the note events needed by existing score mapping. |
| Server/Python Basic Pitch | Would simplify some processing but violates the local-only product boundary and adds operations/privacy work. |
| `ffmpeg.wasm` as the default decoder | Too large for the primary path when `decodeAudioData()` already handles common local audio formats; retain only as a fallback decision after telemetry-free manual compatibility testing. |
| Cloud transcription API | Rejected: conflicts with offline-first use, privacy, cost, and reliable desktop packaging. |
| Electron desktop shell | Viable, but defer unless a Tauri feasibility spike fails; Tauri retains the existing web frontend while offering narrow native file/dialog capabilities. |

## Proposed file changes

```text
package.json / package-lock.json          — add pinned @spotify/basic-pitch + pinned model bundle; no eager load
vite.config.ts                            — NET-NEW worker+WASM config: worker.format='es', optimizeDeps.exclude / assetsInclude for the ONNX/WASM runtime (distinct from the asset-path/no-remote-URL rule)
src/core/audio/types.ts                   — analysis result, confidence, source metadata contracts; sourceKind enum ('midi' | 'audio')
src/core/audio/audioScoreAdapter.ts       — pure Basic-Pitch-event → Score normalization
src/audio/audioDecoder.ts                 — File / ArrayBuffer decoding and browser capability errors
src/audio/audioTranscriptionWorker.ts     — lazy model initialization, progress, cancellation, result transfer
src/audio/audioTranscriber.ts             — Worker client and lifecycle boundary for the UI
src/audio/audioPlayback.ts                — HTMLAudioElement time, seek, play/pause adapter
src/ui/app.ts                             — source-kind state, input routing, status, scrubber/playback hand-off; owns transcriber result handling (setScore stays private, called from within app.ts)
index.html / src/ui/styles/main.css       — audio upload affordance (widen `accept` from MIDI-only), estimated badge, confidence and cancel UI
src/core/types.ts                         — no mapper duplication; sourceKind lives in src/core/audio/types.ts, referenced here only if the render contract needs it
tests/audioScoreAdapter.test.ts           — normalization, confidence filter, deterministic ids/timing (pure, no DOM env)
tests/audioTranscriber.test.ts            — Worker protocol, cancellation, typed failures via injected interfaces (no real Worker/AudioContext; see test approach below)
tests/fixtures/audio-analysis/            — small synthetic analysis JSON in a NEW subdir (tests/fixtures/ already holds license-inventory/); no copyrighted recordings
ARCHITECTURE.md                           — rule #2: new AudioAnalysisMetadata domain contract + source-kind routing / HTMLAudioElement path (planned → active)
DESIGN.md / README.md                     — rule #2: estimated marker in exports + source-aware legend behavior; support matrix, local-only/privacy statement, limitations and workflow
dev-docs/TO_DO.md                         — milestone status
src-tauri/ (follow-up)                    — Tauri configuration, scoped file/dialog capabilities, local resources
```

## Phases & checklist

### Decisions locked before implementation

- **Score-ingestion ownership:** `setScore` stays `private` (`src/ui/app.ts`). The transcriber
  boundary (`src/audio/audioTranscriber.ts`) returns an adapted `Score` to a handler *inside*
  `app.ts`, which calls `setScore`. Nothing outside `app.ts` calls it.
- **`sourceKind` contract:** a single `'midi' | 'audio'` type in `src/core/audio/types.ts`,
  referenced by app state, legend/export labeling, and the export manifest.
- **Test approach for the Worker:** `tests/audioTranscriber.test.ts` stays pure-protocol via
  injected `Worker`/`AudioContext`-shaped interfaces — no jsdom or real DOM/Worker env is added
  (there is no `vitest.config.ts` or DOM test env today, and adding one is out of scope). The
  adapter test is already pure.
- **Adapter id/ordering scheme:** Basic Pitch events are sorted deterministically by
  `(onset, pitch)` before id assignment, then given stable ids following the existing MIDI
  convention shape (e.g. `a-n${index}` where `a` marks audio-source). This makes re-runs of the
  same fixture reproducible (Verification below depends on it).
- **Model pinning:** pin `@spotify/basic-pitch` in `package.json` **and** pin the model
  bundle by fixed identifier + checksum recorded in `AudioAnalysisMetadata`, so a re-run is
  attributable to an exact model version.
- **`lint`:** there is no `lint` script in `package.json`; the quality gate is `npm run validate`
  (= `test` + `build`). Do not add "run lint" steps unless a lint script is created first.

### Phase 0: Compatibility / feasibility spike (spike-only)

Goal: decide whether the approach can ship at all before spec/acceptance work is front-loaded.

- [ ] Pin and inspect `@spotify/basic-pitch` and its browser model/runtime requirements; record
  bundle/model size, license, local asset path, Worker compatibility, and any network request
  before wiring it into UI.
- [ ] Land the net-new Vite worker+WASM config (`worker.format: 'es'`, `optimizeDeps.exclude` /
  `assetsInclude` for the ONNX/WASM runtime) and prove Basic Pitch initializes in a Worker in
  this build.
- [ ] Build a throwaway local spike that decodes a short owned MP3, WAV, and AAC-in-M4A file in
  current Safari and Chromium using `decodeAudioData()`; record failures by codec/profile, not
  filename alone.
- [ ] Set practical limits for first release (maximum file duration/size, cancellation behavior,
  expected analysis time) and decide whether chunks are required before full-song demos.
- [ ] Prove a cold-start run after disabling the network, using packaged/local model assets only.

(Acceptance-example definition and clip inventory moved to the Definition of Done section near
Verification — they are DoD, not spike work.)

### Phase 1: Domain adapter and local decoding

- [ ] Add `AudioAnalysisMetadata` outside the visual mapper contract: source name/type, decoded
  duration/sample rate, model/version, thresholds, and analysis state.
- [ ] Implement a pure adapter from Basic Pitch events to a single estimated track with MIDI
  pitch `0..127`, clamped positive duration (`Math.max(0.01, duration)`, matching the MIDI
  parser convention), deterministic `(onset, pitch)`-ordered stable ids, velocity derived from
  confidence, and synthetic `channel`/`program`/`instrumentName`/`bpm` placeholders (real
  analysis facts go in `AudioAnalysisMetadata`, not the render contract).
- [ ] Update ARCHITECTURE.md (rule #2): document `AudioAnalysisMetadata` under "Domain contracts"
  and the source-kind routing rule under "Playback and source boundaries."
- [ ] Apply a user-adjustable confidence threshold before adaptation; retain the raw event count
  and threshold in metadata/manifest for reproducibility.
- [ ] Implement browser decode with a closed `AudioContext`, mono mixdown/resampling only at the
  model boundary, useful decode errors, and MIME/extension as hints rather than trust signals.
- [ ] Unit test empty results, overlapping notes, invalid model events, confidence filtering,
  deterministic ordering, and duration derivation.

### Phase 2: Background transcription and UI integration

- [ ] Implement a typed Worker request protocol: `initialize`, `analyze`, `cancel`, `progress`,
  `result`, and `error`; terminate/revoke resources on replacement, navigation, or cancellation.
- [ ] Lazy-load Basic Pitch and its model after user action; keep initial app load and MIDI path
  independent of the new dependency. Resolve the model from the shipped artifact, never a CDN.
- [ ] Extend the existing file chooser/drop zone to route MIDI versus audio. Concretely: widen
  the `<input accept>` attribute (`index.html:38`, currently `.mid,.midi,audio/midi`) and replace
  the MIDI-only hard gate in `loadFile` (`src/ui/app.ts`, currently `/\.(mid|midi)$/i`) with an
  explicit MIDI-vs-audio routing decision (extension hint + MIME sniff, treating both as hints
  not trust signals). Retain the current MIDI error and selection behavior.
- [ ] Add estimated-source badge, progress percentage/stage, cancel control, confidence slider,
  and a summary of inferred notes. Disable exports until analysis yields a `Score`.
- [ ] Define the degraded UI state explicitly: when a codec cannot be decoded or the model fails
  to initialize, fall back to audio-only audition with exports disabled and a clear MP3/WAV
  recommendation — never an empty/fabricated score and never a silent upload.
- [ ] Feed the adapted score through `setScore` from *inside* `app.ts` (setScore stays private)
  via the existing geometry flow without a parallel renderer, and label legends/exports as
  estimated when the active `sourceKind` is `audio`.

### Phase 3: Audio audition and reproducibility

- [ ] Add original-audio playback, seek, and ended events that drive the existing render time and
  scrubber. Preserve local-synth playback for MIDI and clearly switch controls by source kind.
- [ ] Avoid duplicate audio: stop/release the prior `HTMLAudioElement`, Web Audio nodes, Worker,
  and object URLs whenever a new source is loaded.
- [ ] **Introduce** an export manifest/metadata concept in the browser exporters — there is no
  existing manifest today (`SvgOptions` in `src/renderers/svg/svgBuilder.ts` carries no metadata;
  the browser PNG path is a bare `canvas.toBlob`; the only existing manifest is the unrelated CLI
  sidecar JSON). The new manifest carries `sourceKind`, source file name, pinned model
  version/checksum, thresholds, decoding facts, and a clear `estimated: true` marker; never
  serialize raw audio samples or write them to disk automatically.
- [ ] Update DESIGN.md (rule #2): document the `estimated` marker/badge in exports under "Canvas
  and export aesthetic" and the source-aware legend behavior under legend behavior.
- [ ] Document that re-running a neural model/version can change inferred notes, whereas
  rendering is deterministic once the adapted score and configuration are fixed.

### Phase 4: Quality gate and follow-up decision

- [ ] Add a browser smoke test/manual test matrix for MP3, WAV, Safari AAC-M4A, cancellation,
  unsupported/invalid files, long-file limit, scrub sync, and no-network analysis.
- [ ] Measure first-use model load, processing time, peak memory, and output note counts on the
  acceptance clips; tune thresholds and limits before enabling full-song input by default.
- [ ] Run `npm run validate`, production-build inspection for model/Worker asset URLs, and a
  manual privacy audit (no fetch after initial static app/model assets; no uploaded file data).
- [ ] Decide whether a second plan should add Node CLI audio conversion using an explicit pinned
  decoder plus the same Basic Pitch runtime, or deliberately keep audio input browser-only.

### Phase 5: Offline desktop packaging follow-up

- [ ] Run a Tauri 2 feasibility spike around the existing Vite build; bundle the frontend,
  transcription Worker/WASM/model, and demo assets into a macOS application with no localhost or
  cloud backend dependency.
- [ ] Use the native dialog plugin for open/save only if the existing browser file picker cannot
  meet desktop UX needs. Scope file access to user-selected paths and app-owned export folders;
  do not grant broad home-directory access.
- [ ] Confirm export, local audio playback, MIDI parsing, and model initialization work with
  network disabled after installation. Add Windows/Linux packaging only after the macOS path is
  validated, including each platform's bundled webview/media-runtime requirements.
- [ ] Write a separate release/distribution plan covering code signing, installers, update policy,
  and offline install assets; packaging must not introduce a hosted backend.

## Definition of Done (acceptance clips)

Defined here (not Phase 0) so spec work does not front-load the feasibility spike:

- [ ] Curate owned acceptance examples: a clean monophonic melody, a simple piano chord
  progression, silence, a malformed file, and an unsupported Apple lossless (ALAC) file.
- [ ] Each acceptance clip has an expected outcome (renders / graceful specific error) that the
  Verification matrix below checks.

## Verification

- [ ] Adapter tests prove the same model-event fixture produces identical normalized score data
  and SVG geometry on repeated runs.
- [ ] MIDI unit tests and current CLI generation remain unchanged and passing.
- [ ] Browser test proves a local MP3 and WAV can decode, analyze, render, export, seek, and play
  without network upload.
- [ ] A disconnected desktop-bundle test proves analysis and export run after installation with
  no network access, CDN model load, localhost server, or cloud request.
- [ ] Safari test proves typical AAC-in-M4A works or gives a specific supported-browser failure;
  ALAC failure is handled gracefully rather than misreported as transcription failure.
- [ ] Cancellation leaves no active worker/audio playback and the next MIDI or audio load works.
- [ ] `npm run validate` passes.

## Open questions

- [ ] Should the first public release allow full-song files immediately, or cap at 3–5 minutes
  until device-memory and Worker benchmarks are known? Owner: product/user.
- [ ] What confidence default best balances clean melody coverage against dense-song noise?
  Owner: implementation review after acceptance clips.
- [ ] Should the app retain/download the inferred MIDI alongside visual exports? Owner: product/user.
- [ ] Is browser-only audio input acceptable for the first release, with CLI audio conversion as
  a separate follow-up? Owner: product/user.
- [ ] Should macOS be the first bundled target, with Tauri 2 as the default shell unless its
  model/worker or media compatibility spike fails? Owner: product/user.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Full mixes infer incorrect/missing notes | high | high | Use honest estimated labeling, threshold controls, acceptance clips, and never overwrite source MIDI. |
| Model download/analysis freezes or exhausts memory | medium | high | Lazy Worker loading, progress/cancel, file limits, chunking spike, and benchmark gate. |
| M4A codec support differs by browser | high | medium | Decode capability test, Safari/Chromium matrix, clear fallback to WAV/MP3, no extension-only promise. |
| Model/package asset integration breaks Vite build | medium | medium | Isolate it behind a Worker, pin versions, and test production asset paths before UI rollout. |
| Raw audio leaks or persists | low | high | Local File/object URLs only, no telemetry/upload, explicit resource cleanup, and export metadata without samples. |
| Neural model updates alter results | medium | medium | Record model/version/thresholds; treat adapted score as the reproducible artifact. |
| Bundled model or platform webview changes desktop behavior | medium | high | Offline Tauri spike, pinned assets, macOS-first support, and a platform compatibility matrix. |
