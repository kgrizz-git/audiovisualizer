# Plan: Local Audio File Input and Transcription

Last reviewed: 2026-07-23
Date: 2026-07-22
Author: Codex
Status: ready for Phase 1 — revised 2026-07-23; architecture: desktop-primary, stems → Basic Pitch, per-instrument tracks
Linked issue/PR: n/a

> Revision note (2026-07-23): architecture reshaped after decisions —
> **desktop (Tauri) is the primary target, browser is the fallback**; the pipeline
> is **stem separation (Demucs) → Basic Pitch per stem → one `TrackScore` per stem**
> (per-instrument colored voices, fixed vocals/drums/bass/other ceiling); monophonic
> tier dropped; single-model multi-instrument transformers (MuScriptor/YourMT3+)
> deferred to a desktop-only high-fidelity follow-up. Earlier corrections still hold:
> the "tfjs vuln" was a mis-attribution to vite/vitest devDeps (tfjs has zero
> advisories); the ONNX spike showed the official `nmp.onnx` is not a drop-in
> (NeuralNote's split-model recipe is the path to parity); browser exporters have no
> existing manifest (net-new); `setScore` stays private; `sourceKind` is one typed
> contract.

## Goal

Let a user load a local audio recording—initially MP3, WAV, and browser-decodable M4A/AAC—and
turn its estimated note events into the same visual scores, playback timeline, and exports that
MIDI uses today. The app remains local-only: neither the audio file nor its analysis is uploaded.

**Pipeline (v1):** local audio file → decode → **stem separation (Demucs)** → **Basic Pitch per
pitched stem** → adapter → **one estimated `TrackScore` per stem** → the existing multi-voice
geometry / render / export. Separating first is what yields distinct colored instrument voices
(Basic Pitch alone emits one flat stream) and also improves transcription accuracy by reducing
polyphony per stem. `@spotify/basic-pitch` remains the transcriber (only browser-viable
polyphonic engine); Demucs (htdemucs) is the separator.

**Desktop is the primary target; browser is a graceful fallback (decided 2026-07-23).** The same
Vite frontend ships inside a **Tauri desktop bundle** as the primary artifact, where analysis runs
natively (GPU-capable Demucs + Basic Pitch) for best quality/speed. The **browser fallback** runs
the same pipeline with WASM Demucs + Basic Pitch; if separation is too heavy/unavailable in a
given browser, it degrades to a single flat Basic Pitch track. All analysis code, WebAssembly, and
model data are bundled in the installed artifact; no cloud API, hosted backend, CDN import, or
account — on either target. The analysis model(s) load lazily and run off the main thread
(Worker in browser; native sidecar/thread on desktop). Local decoding uses
`AudioContext.decodeAudioData()` (browser) or a native decoder (desktop).

Higher-fidelity single-model multi-instrument transformers (MuScriptor, YourMT3+) are a **deferred
desktop-only high-fidelity engine** — tracked in `dev-docs/TO_DO.md`, not v1.

## Scope and user-facing contract

- Accept `.mp3`, `.wav`, `.m4a`, `.aac`, `.flac`, `.ogg`, and `.opus` only when the current
  browser can decode the supplied file; advertise MP3 and WAV as the cross-browser baseline.
- Treat M4A as a container, not a codec promise: typical Apple AAC-in-M4A should work in Safari;
  ALAC and some AAC profiles may not decode in every browser.
- Show an explicit **“estimated from audio”** badge, analysis progress/cancel state, duration,
  and a confidence control. Do not present inferred notes as source-of-truth MIDI.
- Convert accepted Basic Pitch note events through a single adapter to the existing `Score` /
  `TrackScore` / `NoteEvent` contract, then reuse every existing mapper and exporter. The adapter
  emits **one `TrackScore` per stem** (e.g. `instrumentName: "Vocals"/"Bass"/"Other"`), with the
  stem name driving `instrumentName` and a distinct `channel` per stem so the existing multi-voice
  color/legend flow applies. Because `TrackScore.program` and `Score.bpm` are MIDI-shaped and
  non-optional (`src/core/types.ts`), the adapter fabricates deterministic placeholders (e.g.
  `program: 0`, nominal `bpm`) and records real analysis facts in the separate
  `AudioAnalysisMetadata`, never in the rendering contract. `confidence`-derived velocity stays
  internal to the adapter (no `confidence` field is added to `NoteEvent`).
- Introduce a single typed `sourceKind` (`'midi' | 'audio'`) contract used everywhere source
  provenance matters — app state, legend/export labeling, and the export manifest — rather than
  scattering ad-hoc booleans/strings.
- Audition original audio through an `HTMLAudioElement`, synchronized with the visual scrubber.
  Keep the existing oscillator voice controls MIDI-only.

## Out of scope

- Perfect transcription, key/chord naming, lyrics, or copyrighted-source acquisition.
- **Arbitrary-instrument granularity.** Stem separation yields fixed categories (vocals / drums /
  bass / other), not an arbitrary N instruments — "other" stays a mix, and drums is unpitched
  (skipped or handled as percussion). True per-instrument transcription (piano vs guitar within
  "other") needs the deferred multi-instrument transformer, not v1.
- Server-side processing, storage, telemetry, or upload.
- A required cloud service or live internet connection after the application/assets have been
  installed. Optional update checks must not block any creative workflow.
- A guarantee that every Apple audio format works in every browser; support is decoder-dependent.
- Audio-file input for the Node CLI in this first plan. The CLI currently has no general audio
  decoder or ML runtime; add it only after the desktop/browser app workflow is accepted.
- Replacing the existing MIDI parser or its deterministic rendering contract.

## Approach

Create an audio-input boundary parallel to the MIDI parser. It decodes a `File` locally, then runs
the pipeline **decode → stem separation (Demucs) → Basic Pitch per pitched stem → adapter**. The
adapter emits **one estimated `TrackScore` per stem**, preserving generated ids, onsets,
durations, MIDI pitches, and confidence-derived velocities, while retaining analysis metadata
separately from the stable rendering contract. Downmix/resample happens only as each model
requires.

The pipeline is backend-agnostic behind one interface. On **desktop (primary)** it runs natively
(GPU-capable Demucs + Basic Pitch via a bundled sidecar/thread); in the **browser (fallback)** it
runs WASM Demucs + Basic Pitch in a Worker, degrading to a single flat track if separation is too
heavy. Models are lazily initialized after an audio file is selected and are packaged as
application/asset resources (explicit Vite URLs in browser; app resources on desktop) — never
fetched remotely. Analysis reports progress and supports cancellation so the UI never freezes on
full songs; decoded/playable audio stays in local memory and object URLs are revoked when
replaced.

The offline fallback is honest rather than artificial: if a codec cannot be decoded or a model
cannot initialize, retain local audio audition and offer a clear MP3/WAV conversion recommendation
(and, if only separation fails, fall back to a single flat transcribed track labeled "not
separated"); never silently send the file to a service or fabricate note events.

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

### Transcription-engine alternatives (polyphonic focus)

Surveyed 2026-07-23. Constraints: the engine must run **natively in the desktop bundle (primary)
and as a browser fallback**, all offline (JS/WASM/ONNX/native). The browser fallback is the harder
bar — under it, Basic Pitch is still the only genuinely browser-viable polyphonic engine; every
higher-quality option is a large GPU-oriented PyTorch transformer (desktop-only at best).
Note: tfjs 3.21.0 is old/unmaintained but has **no** npm advisories (the earlier "vuln" was a
mis-attribution to vite/vitest devDeps).

| Engine | Polyphonic quality | Browser-viable? | Notes |
|---|---|---|---|
| `@spotify/basic-pitch` on tfjs 3.x (**chosen v1**) | good, instrument-agnostic | **yes** (0.9 MB) | The only browser-runnable polyphonic option. Works offline today. |
| Basic Pitch via ONNX Runtime Web | = Basic Pitch | yes (needs work) | Escapes old tfjs. Not a naive full-graph swap (Phase 0.5). **NeuralNote's recipe:** convert only the CQT+harmonic-stacking front-end via tf2onnx *with manually fixed batch-norm weights*, run the CNN separately — the front-end is exactly where the naive `nmp.onnx` diverged. Parity achievable; tracked investigation. |
| **MuScriptor** (2026, open-weight) | SOTA multi-instrument on real mixes | **no** | **1.3B params** (multi-GB, GPU PyTorch). Future desktop-only high-fidelity tier at best. |
| **YourMT3+ / MIROS** (2025 AMT winners) | very high (MIROS F=0.83 Slakh2100 multi-instrument) | **no** | Large transformers (MusicFM conformer encoder). Server/GPU. Future desktop tier / research. |
| **MT3** (Google Magenta) | strong multi-instrument baseline | **no** | Heavy transformer; the benchmark reference. Not local-friendly. |
| Essentia.js (WASM) | partial (DIY segmentation) | yes | YIN/Melodia + onsets; lower polyphonic fidelity, more hand-assembly. Backup only. |
| NeuralNote | = Basic Pitch | no (native C++ DAW plugin) | Not a new model — a proof that Basic Pitch runs offline via split ONNX+RTNeural; source of the ONNX recipe above. |

Recommendation: **ship v1 on Basic Pitch (tfjs)** — it is the only browser-viable polyphonic
engine. Treat the frontier transformers (MuScriptor / YourMT3+) as a **future desktop-only
high-fidelity tier** (heavy PyTorch/ONNX, GPU) tracked in `dev-docs/TO_DO.md`, not part of v1.
ONNX-on-Basic-Pitch stays a tracked investigation with a concrete recipe.

## Proposed file changes

```text
package.json / package-lock.json          — add pinned @spotify/basic-pitch + pinned model bundle; no eager load
vite.config.ts                            — NET-NEW worker.format='es'; bundle Basic Pitch model.json+weights as assets (?url or public/model; tfjs GraphModel, not ONNX). Browser fallback also bundles the WASM Demucs model + runtime (assetsInclude); native Demucs is packaged on desktop, not via Vite
src/core/audio/types.ts                   — analysis result, confidence, source metadata contracts; sourceKind enum ('midi' | 'audio')
src/core/audio/audioScoreAdapter.ts       — pure Basic-Pitch-event → Score normalization
src/audio/audioDecoder.ts                 — File / ArrayBuffer decoding and browser capability errors
src/audio/stemSeparator.ts                — Demucs separation boundary: native (desktop sidecar) or WASM (browser); returns per-stem PCM; progress/cancel; degrades to no-op passthrough
src/core/audio/stems.ts                   — stem taxonomy (vocals/drums/bass/other), which stems are pitched, stem→channel/instrumentName mapping (pure)
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
src-tauri/ (PRIMARY target)               — Tauri config, scoped file/dialog capabilities, bundled Demucs+Basic Pitch models, native inference sidecar/thread
tests/stems.test.ts                       — stem taxonomy + stem→track mapping; pitched-stem selection
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
  - **Polyphonic-only, Basic Pitch (revised 2026-07-23).** A deterministic monophonic (YIN) tier
    was considered and dropped — monophonic-only input is not useful enough. Basic Pitch is the
    only browser-viable polyphonic transcriber.
- **Pipeline = stems → Basic Pitch (decided 2026-07-23).** Separate with Demucs first, transcribe
  each pitched stem with Basic Pitch, emit one `TrackScore` per stem. Chosen over a single-model
  multi-instrument transformer because the two-stage route uses proven parts and degrades to the
  browser fallback (WASM Demucs + Basic Pitch). Ceiling: fixed vocals/drums/bass/other categories.
  The high-fidelity transformer route (MuScriptor / YourMT3+) is **deferred and tracked in
  `dev-docs/TO_DO.md`**, not v1.
- **Desktop-primary, browser-fallback (decided 2026-07-23).** The Tauri desktop bundle is the
  primary artifact (native, GPU-capable Demucs + Basic Pitch). The browser runs the same pipeline
  via WASM Demucs + Basic Pitch, degrading to a single flat Basic Pitch track if separation is
  unavailable. Desktop packaging moves from a late stretch to a primary concern (see phases).
- **CLI scope:** Node CLI audio input stays a separate later plan (out of scope here).
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
- [ ] **Stem-separation feasibility (Demucs):** prove htdemucs runs offline both (a) natively on
  desktop (Rust `ort`/onnxruntime or bundled sidecar, GPU-capable) and (b) as WASM in the browser
  fallback. Record model size, per-minute separation time, memory, and stem quality on an owned
  clip. Decide the desktop inference host (sidecar process vs in-proc).
- [ ] **Desktop feasibility (Tauri, primary target):** spike a Tauri 2 shell around the Vite build
  that invokes native Demucs + Basic Pitch with the network disabled — de-risk the primary
  artifact early, before full packaging (Phase 6).

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
- [ ] Implement a pure adapter from Basic Pitch events to **one estimated `TrackScore` per stem**
  (stem name → `instrumentName`, distinct `channel` per stem) with MIDI pitch `0..127`, clamped
  positive duration (`Math.max(0.01, duration)`, matching the MIDI parser convention),
  deterministic `(onset, pitch)`-ordered stable ids (namespaced per stem), velocity derived from
  confidence, and synthetic `program`/`bpm` placeholders (real analysis facts go in
  `AudioAnalysisMetadata`, not the render contract). Adapter must also accept a single-track input
  (browser degrade path where separation is unavailable).
- [ ] Update ARCHITECTURE.md (rule #2): document `AudioAnalysisMetadata` under "Domain contracts"
  and the source-kind routing rule under "Playback and source boundaries."
- [ ] Apply a user-adjustable confidence threshold before adaptation; retain the raw event count
  and threshold in metadata/manifest for reproducibility.
- [ ] Implement browser decode with a closed `AudioContext`, mono mixdown/resampling only at the
  model boundary, useful decode errors, and MIME/extension as hints rather than trust signals.
- [ ] Unit test empty results, overlapping notes, invalid model events, confidence filtering,
  deterministic ordering, and duration derivation.

### Phase 2: Stem separation pipeline (core)

Separate the mix into stems *before* transcription — the route to distinct colored voices and to
better per-stem accuracy.

- [ ] Implement `stemSeparator.ts` as a backend-agnostic boundary: **native Demucs on desktop**
  (primary; GPU-capable via sidecar/`ort`) and **WASM Demucs in the browser** (fallback), behind
  one interface with progress/cancel. Reject any cloud-backed option.
- [ ] Implement `stems.ts` taxonomy (pure): vocals/drums/bass/other, which stems are pitched
  (skip/flag drums as percussion), and stem → `channel`/`instrumentName` mapping. Unit-tested.
- [ ] Feed each pitched stem through the Basic Pitch → adapter path → one `TrackScore` per stem,
  so the existing multi-voice geometry/legend/color flow applies unchanged.
- [ ] **Degrade path:** if separation is unavailable/too heavy in a given browser, skip it and
  transcribe the whole mix as a single flat track (explicitly labeled "not separated").
- [ ] Label honestly. **Known ceiling:** fixed stem categories, not arbitrary N instruments;
  "other" stays a mix; realistic output ~2–3 pitched tracks. Surface this in UI + exports.
- [ ] Record separator name + version per stem in `AudioAnalysisMetadata` / the manifest.

### Phase 3: Background transcription and UI integration

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

### Phase 4: Audio audition and reproducibility

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

### Phase 5: Quality gate and follow-up decision

- [ ] Test matrix across **both targets**: desktop (native Demucs + Basic Pitch) and browser
  fallback (WASM Demucs / degrade-to-flat). Cover MP3, WAV, Safari AAC-M4A, a polyphonic
  multi-instrument mix, cancellation, unsupported/invalid files, long-file cap, scrub sync, and
  no-network analysis.
- [ ] Measure first-use model load, **separation + transcription** time, peak memory, per-stem
  note counts, and stem quality on the acceptance clips (desktop vs browser); tune thresholds and
  limits before lifting the 3–5 min cap.
- [ ] Run `npm run validate`, production-build inspection for model/Worker/native-asset URLs, and
  a manual privacy audit (no fetch after initial static app/model assets; no uploaded file data)
  on both targets.
- [ ] Decide whether a second plan should add Node CLI audio (decode + separate + transcribe), or
  keep audio input to the desktop/browser app only.

### Phase 6: Offline desktop packaging (PRIMARY target — release gate)

Desktop is the primary artifact, not a follow-up: this phase is a first-class release gate, and
the desktop path must ship the native (GPU-capable) Demucs + Basic Pitch pipeline. (Feasibility
was de-risked in Phase 0; this phase productionizes it.)

- [ ] Package the Vite frontend + native Demucs + Basic Pitch (models, WASM/ONNX, inference
  sidecar/thread) into a macOS Tauri 2 app with no localhost or cloud backend dependency.
- [ ] Use the native dialog plugin for open/save. Scope file access to user-selected paths and
  app-owned export folders; do not grant broad home-directory access.
- [ ] Confirm the full pipeline (decode → separate → transcribe → render → export → audition)
  runs with the **network disabled** after installation. Verify the browser fallback still works
  as the secondary target. Add Windows/Linux only after macOS is validated, including each
  platform's webview/media-runtime and native-inference requirements.
- [ ] Write a separate release/distribution plan covering code signing, installers, update policy,
  and offline install assets; packaging must not introduce a hosted backend.

## Definition of Done (acceptance clips)

Defined here (not Phase 0) so spec work does not front-load the feasibility spike:

- [ ] Curate owned acceptance examples: a clean monophonic melody, a simple piano chord
  progression, a **polyphonic multi-instrument mix** (e.g. vocals + bass + backing — exercises
  stem separation into distinct tracks), silence, a malformed file, and an unsupported Apple
  lossless (ALAC) file.
- [ ] Each acceptance clip has an expected outcome (renders / graceful specific error). The mix
  clip's expected outcome includes **separate per-stem tracks** (vocals/bass/other as distinct
  colored voices), not one flat track — verified on both desktop and the browser fallback.

> **Deferred (tracked in `dev-docs/TO_DO.md`):** a single-model multi-instrument transcription
> engine (MuScriptor / YourMT3+) as a desktop-only high-fidelity upgrade. It would replace the
> stems → Basic Pitch route with finer instrument granularity, but is a large GPU PyTorch model
> and a significant packaging lift — out of scope for v1.

## Verification

- [ ] Adapter tests prove the same model-event fixture produces identical normalized score data
  and SVG geometry on repeated runs, for both single-track and multi-stem inputs.
- [ ] `stems.ts` tests prove stem→track mapping and pitched-stem selection (drums excluded).
- [ ] MIDI unit tests and current CLI generation remain unchanged and passing.
- [ ] **Desktop (primary) test:** the full pipeline (decode → native Demucs separation →
  Basic Pitch per stem → render → export → audition) runs on a polyphonic mix with the **network
  disabled** after installation — no CDN model load, localhost server, or cloud request — and
  produces separate per-stem tracks.
- [ ] **Browser fallback test:** a local MP3/WAV decodes, separates (WASM) or degrades to a flat
  track, renders, exports, seeks, and plays without network upload.
- [ ] Safari test proves typical AAC-in-M4A works or gives a specific supported-browser failure;
  ALAC failure is handled gracefully rather than misreported as transcription failure.
- [ ] Cancellation mid-separation or mid-transcription leaves no active worker/sidecar/audio
  playback, and the next MIDI or audio load works.
- [ ] `npm run validate` passes.

## Open questions

Resolved 2026-07-22 (see "Product decisions locked" above):

- [x] Full song vs. cap → **cap at 3–5 min** for v1.
- [x] Retain/download inferred MIDI → **no in v1**; tracked follow-up.
- [x] Engine before Phase 1 → spiked ONNX (Phase 0.5); **not a drop-in → ship v1 on tfjs**, ONNX deferred.

Resolved 2026-07-23:

- [x] **Engine architecture** → **polyphonic-only, Basic Pitch** for v1. A deterministic
  monophonic (YIN) tier was considered and dropped — monophonic-only isn't useful enough.
- [x] **Separation** → **stems → Basic Pitch** (Demucs pre-pass, one `TrackScore` per stem).
  Single-model multi-instrument transformer deferred to a desktop-only high-fidelity follow-up.
- [x] **Delivery target** → **desktop (Tauri) is primary; browser is the fallback.** macOS is the
  first bundled target. Node CLI audio remains a separate later plan.

Still open:

- [ ] What confidence default best balances clean melody coverage against dense-song noise?
  Owner: implementation review after acceptance clips.
- [ ] Should stem separation ever run by default in the **browser** fallback, or be desktop-only /
  explicit-opt-in there given its WASM cost? Owner: implementation review after Phase 0 Demucs
  benchmarks.

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
| Stem separation is heavy (size/memory/time), esp. WASM in browser | high | medium | Native Demucs on desktop (primary); browser separation opt-in/gated by benchmark; progress/cancel; degrade to a single flat track. |
| Stem categories oversell "per-instrument" (fixed vocals/drums/bass/other; "other" stays mixed) | medium | medium | Label stems honestly in UI + exports; document the ceiling; frontier transformer deferred for finer granularity. |
| Desktop native-inference packaging (sidecar/ort, code signing) is complex | medium | high | De-risk in Phase 0 Tauri spike; macOS-first; treat desktop as a first-class release gate; separate distribution plan. |
| Browser fallback diverges from desktop (separation absent → flat track) | medium | medium | Shared pipeline/adapter across backends; explicit "not separated" labeling; fallback covered in the test matrix. |
