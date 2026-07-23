# Plan: Local Audio File Input and Transcription

Last reviewed: 2026-07-22
Date: 2026-07-22
Author: Codex
Status: ready for Phase 1 — revised 2026-07-22; product decisions locked; ONNX spike done (tfjs chosen)
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

- Perfect transcription, key/chord naming, lyrics, or copyrighted-source acquisition.
- **Per-instrument / per-voice separation in v1.** Basic Pitch emits a single flat polyphonic
  note stream with no instrument/voice/channel field, so v1 renders one estimated track. Voice
  separation is a scoped future phase (Phase 6 below), not part of the first ship.
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

### Transcription-engine alternatives (to Basic Pitch specifically)

The spike (2026-07-22) confirmed Basic Pitch works offline but surfaced one real weakness:
it pins **TensorFlow.js 3.21.0 (2021)**, which carries known npm vulnerabilities and is
effectively unmaintained. Ranked alternatives for the engine itself:

| Engine | Polyphonic | Offline/bundled | Notes |
|---|---|---|---|
| `@spotify/basic-pitch` on tfjs 3.x (**chosen**) | yes | yes (0.9 MB model) | Works today; weakness is the stale tfjs runtime + vulns. |
| **Basic Pitch model on ONNX Runtime Web** (leading alt) | yes | yes | Convert the same model to ONNX, run via `onnxruntime-web` (WASM/WebGPU). Same transcription quality, drops the old-tfjs supply-chain smell, gains WebGPU accel. Cost: model-conversion + a re-implementation of `outputToNotesPoly` post-processing. Worth a spike before committing to tfjs. |
| **SPICE / CREPE (tfjs)** | no (mono) | yes | Lightweight pitch tracking, solo-melody only; no onsets/chords. Candidate for the honest melody-only fallback. |
| **Essentia.js (WASM)** | partial | yes | YIN/Melodia + onset detection; you assemble note segmentation. More DIY, lower polyphonic fidelity. Already in the approach-level table. |
| Custom Web Audio autocorrelation/YIN | no | yes | Zero-dep monophonic fallback tier; lowest fidelity. |
| Magenta MT3 / Onsets-and-Frames | yes (higher quality) | no (heavy/server) | Rejected: too large / server-oriented; violates local-only. |

Recommendation: keep Basic Pitch as the first shipping engine, but **spike the ONNX Runtime Web
port in parallel** — it is the cleanest path off the stale-tfjs dependency without sacrificing
polyphonic quality or the offline-bundle guarantee.

## Proposed file changes

```text
package.json / package-lock.json          — add pinned @spotify/basic-pitch + pinned model bundle; no eager load
vite.config.ts                            — NET-NEW worker.format='es'; bundle model.json + weights as assets (?url or public/model). Runtime is TensorFlow.js (GraphModel), NOT ONNX/WASM — no WASM bundling unless the tfjs-backend-wasm fallback is needed (see spike findings)
src/core/audio/types.ts                   — analysis result, confidence, source metadata contracts; sourceKind enum ('midi' | 'audio')
src/core/audio/monophonicPitch.ts         — deterministic YIN/pYIN pitch+onset detection (default tier; pure, no ML/Worker)
src/core/audio/audioScoreAdapter.ts       — pure note-event → Score normalization, shared by BOTH the deterministic and Basic Pitch tiers
src/audio/audioDecoder.ts                 — File / ArrayBuffer decoding and browser capability errors
src/audio/audioTranscriptionWorker.ts     — lazy model initialization, progress, cancellation, result transfer
src/audio/audioTranscriber.ts             — Worker client and lifecycle boundary for the UI
src/audio/audioPlayback.ts                — HTMLAudioElement time, seek, play/pause adapter
src/ui/app.ts                             — source-kind state, input routing, status, scrubber/playback hand-off; owns transcriber result handling (setScore stays private, called from within app.ts)
index.html / src/ui/styles/main.css       — audio upload affordance (widen `accept` from MIDI-only), estimated badge, confidence and cancel UI
src/core/types.ts                         — no mapper duplication; sourceKind lives in src/core/audio/types.ts, referenced here only if the render contract needs it
tests/monophonicPitch.test.ts             — deterministic YIN pitch/onset on synthetic tones; exact reproducibility
tests/audioScoreAdapter.test.ts           — normalization, confidence filter, deterministic ids/timing (pure, no DOM env)
tests/audioTranscriber.test.ts            — Worker protocol, cancellation, typed failures via injected interfaces (no real Worker/AudioContext; see test approach below)
tests/fixtures/audio-analysis/            — small synthetic analysis JSON in a NEW subdir (tests/fixtures/ already holds license-inventory/); no copyrighted recordings
ARCHITECTURE.md                           — rule #2: new AudioAnalysisMetadata domain contract + source-kind routing / HTMLAudioElement path (planned → active)
DESIGN.md / README.md                     — rule #2: estimated marker in exports + source-aware legend behavior; support matrix, local-only/privacy statement, limitations and workflow
dev-docs/TO_DO.md                         — milestone status
src-tauri/ (follow-up)                    — Tauri configuration, scoped file/dialog capabilities, local resources
```

## Phases & checklist

Two-tier build order: **Phase 1 delivers the deterministic monophonic tier + shared adapter +
local decode — fully shippable with no ML, no Worker, no model bundle.** The opt-in Basic Pitch
polyphonic tier (Worker, lazy tfjs/model) layers on in Phase 2. This lets a reproducible, no-ML
audio path ship first, with polyphony added behind an explicit toggle.

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

Product decisions locked 2026-07-22:

- **File-length cap:** v1 caps input at **3–5 minutes**. Lift the cap only after Phase 4
  memory/time benchmarks; longer files show a clear "too long for this release" message.
- **Export scope:** v1 ships **visual exports only** (SVG/PNG + manifest). Downloadable inferred
  `.mid` export is deferred to a tracked follow-up (see `dev-docs/TO_DO.md`), not built now.
- **Engine:** **ship v1 on Basic Pitch + tfjs (for polyphony).**
  - *Correction (2026-07-22):* an earlier draft claimed tfjs 3.x carried a critical+high npm
    vuln. That was wrong — the critical/high advisories belong to `vite`/`vitest` (pre-existing
    **devDependencies**, not shipped, unrelated to audio). **`@tensorflow/tfjs` and
    `@spotify/basic-pitch` have zero npm-audit advisories.** The real tfjs concern is only that
    it is old/unmaintained (2021), a maintainability smell — not a security hole.
  - Because there is no security urgency, ONNX is **not** needed for v1. The Phase 0.5 spike
    showed the official `nmp.onnx` is not a drop-in *as driven by a hand-rolled harness* (outputs
    didn't match; thresholds don't transfer) — parity is likely achievable but needs real
    preprocessing/threshold work. Deferred as a future-proofing investigation, not a blocker.
  - **Two-tier engine (locked 2026-07-22).** v1 ships **two** transcription engines behind one
    adapter contract:
    1. **Deterministic monophonic tier (default):** YIN/pYIN (or autocorrelation) — no ML, no
       model bundle, no Worker required, fully deterministic and reproducible. Handles single-line
       / solo-melody input. This is the app's reproducible-by-default path and aligns with the
       existing deterministic-rendering contract.
    2. **Polyphonic tier (opt-in):** Basic Pitch + tfjs, lazily loaded only when the user opts into
       polyphony. Handles chords / multiple simultaneous notes.
    Both tiers feed the same `audioScoreAdapter` → `Score`. The `estimated` badge distinguishes
    "estimated (deterministic pitch)" vs "estimated (ML, polyphonic)" so provenance stays honest.
    Note the reproducibility asymmetry in `AudioAnalysisMetadata`: the deterministic tier is
    bit-reproducible; the ML tier can drift across model versions.
- **CLI scope:** v1 is **browser-only**; Node CLI audio input stays a separate later plan.
- **Confidence-slider behavior:** cache the raw model output (frames/onsets/contours) from one
  pass; moving the confidence control re-runs only `outputToNotesPoly` post-processing, **never**
  the model. Fast, and it makes threshold tuning interactive.
- **Tempo:** no tempo/beat inference in v1. Note times stay in seconds; the required `Score.bpm`
  is a nominal **120** placeholder (display-only metadata).

### Phase 0: Compatibility / feasibility spike (spike-only)

Goal: decide whether the approach can ship at all before spec/acceptance work is front-loaded.

**Status: partially executed 2026-07-22 — see `tmp/2026-07-22-phase0-spike-findings.md`.**
Offline model load + inference PROVEN in Node (bundled model → correct pitch, no external
network, native progress). Remaining unproven item: WebGL/OffscreenCanvas-in-Worker in a real
browser (checkbox below).

- [x] Pin and inspect `@spotify/basic-pitch` and its model/runtime requirements. Findings:
  `1.0.1`, deps `@tensorflow/tfjs@^3.2.0` (→ 3.21.0, old) + `@tonejs/midi`; model bundled in
  the package (`model.json` 174 KB + one weight shard 742 KB ≈ 0.9 MB); Apache-2.0 license;
  runtime is TF.js GraphModel (not ONNX/WASM); zero network required for inference. Caveat:
  4 npm-audit vulns (1 critical/1 high) via old tfjs — offline use limits exposure; pin + re-audit.
- [ ] **Prove the browser Worker path**: load tfjs + GraphModel in a dedicated Worker and run
  inference. Prefer the WebGL backend (needs OffscreenCanvas); fall back to `tfjs-backend-wasm`
  (the only case that adds a real WASM asset) or main-thread chunked yielding if WebGL-in-Worker
  fails in Chromium or Safari. Land `worker.format: 'es'` and asset-URL bundling here.
- [ ] Build a throwaway local spike that decodes a short owned MP3, WAV, and AAC-in-M4A file in
  current Safari and Chromium using `decodeAudioData()`, then downmix/resample to 22050 Hz mono
  (the model's required input); record failures by codec/profile, not filename alone.
- [ ] Set practical limits for first release (maximum file duration/size, cancellation behavior,
  expected analysis time). Note: `evaluateModel` has native progress + internal chunking but
  **no built-in cancel** — cancellation = terminate the Worker.
- [x] Prove a cold-start run using packaged/local model assets only (no network). Done in Node;
  re-confirm in-browser as part of the Worker-path checkbox above.

(Acceptance-example definition and clip inventory moved to the Definition of Done section near
Verification — they are DoD, not spike work.)

### Phase 0.5: ONNX Runtime Web engine spike — DONE 2026-07-22 (outcome: tfjs)

Executed. Full results in `tmp/2026-07-22-phase0-spike-findings.md`; scripts in `.context/`.

- [x] Obtained the official `nmp.onnx` (225 KB) and ran it in `onnxruntime-node` offline.
- [x] Mirrored basic-pitch's windowing/`unwrapOutput` and reused the shared post-processing.
- [x] **Outcome:** ONNX is **not a drop-in** — outputs are non-equivalent to the tfjs model
  (tfjs → one clean A4; ONNX → dozens of spurious notes; distributions differ ~6x; thresholds
  don't transfer). Root cause likely tf2onnx conversion of the CQT/signal front-end.
- [x] **Decision:** ship v1 on Basic Pitch + tfjs with the vuln mitigations noted above. ONNX
  parity (preprocessing + threshold re-tune) is deferred to a tracked investigation, not a gate.

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

### Phase 6: Voice separation via optional stem-separation pre-pass (stretch)

Motivation: Basic Pitch produces one undifferentiated polyphonic note stream (no instrument or
voice field — confirmed in the Phase 0 spike), so audio sources render as a single track, unlike
the multi-voice colored output MIDI gives. To recover separate voices, split the mix into stems
*before* transcription and run the existing adapter per stem.

- [ ] Spike an **in-browser, offline** stem separator (e.g. a WASM/ONNX-Runtime-Web Demucs build,
  as used by client-side demixers) that runs with no server and can be bundled into the desktop
  artifact. Reject any option that requires a cloud backend.
- [ ] Run the separator as an optional pre-pass, then feed each pitched stem through the existing
  Basic Pitch → adapter path, emitting one `TrackScore` per stem so the existing multi-voice
  geometry/legend/color flow applies unchanged.
- [ ] Label the result honestly. **Known ceiling:** these models yield fixed stem *categories*
  (typically vocals / drums / bass / other), not arbitrary N instruments. Drums is unpitched
  (skip transcription); "other" remains a mix of the remaining instruments. Realistic output is
  ~2–3 pitched estimated tracks, not true per-instrument transcription — surface this in the UI
  and exports so it is not oversold.
- [ ] Gate on cost: stem separation is heavy (model size, memory, time). Make it explicitly
  opt-in with progress/cancel, and evaluate whether it is desktop-bundle-only rather than a
  default browser feature.
- [ ] Record which separator + version produced each stem in `AudioAnalysisMetadata` / the export
  manifest, alongside the transcription model, for reproducibility.

> Higher-fidelity multi-instrument alternatives (e.g. single-model multi-instrument transcription
> like MT3) are intentionally **not** in this phase: they are large, server/Python-oriented, and
> collide with the offline-bundle boundary. Revisit only if the desktop bundle can carry them —
> tracked in `dev-docs/TO_DO.md`.

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

Resolved 2026-07-22 (see "Product decisions locked" above):

- [x] Full song vs. cap → **cap at 3–5 min** for v1.
- [x] Retain/download inferred MIDI → **no in v1**; tracked follow-up.
- [x] Browser-only first → **yes**; CLI audio is a later plan.
- [x] Engine before Phase 1 → spiked ONNX (Phase 0.5); **not a drop-in → ship v1 on tfjs**, ONNX deferred.

Resolved:

- [x] **Engine architecture** → **two tiers**: deterministic monophonic (YIN/pYIN, no ML) as the
  default + Basic Pitch as an opt-in polyphonic tier (loads tfjs + model lazily only when the user
  opts into polyphony). Locked 2026-07-22.

Still open:

- [ ] **Tier selection UX:** explicit user toggle (default = deterministic mono; "detect chords /
  polyphonic" opt-in loads Basic Pitch) vs. auto-detection of polyphony. Leaning explicit toggle
  for v1 (simpler, keeps ML lazy, honest labeling). Owner: implementation review.
- [ ] What confidence default best balances clean melody coverage against dense-song noise?
  Owner: implementation review after acceptance clips.
- [ ] Should macOS be the first bundled target, with Tauri 2 as the default shell unless its
  model/worker or media compatibility spike fails? Owner: product/user (Phase 5 stretch — not
  blocking v1).

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
