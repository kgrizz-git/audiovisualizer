# AudioVisualizer Development TODOs

Last updated: 2026-07-29

## Next product milestones

- [ ] **Additional 3D score layouts**: Chromagram columns, voice-ribbon grid, and velocity spires, sharing the existing 3D camera/cue infrastructure. See [`plans/2026-07-24-3d-score-layouts.md`](../plans/2026-07-24-3d-score-layouts.md).
- [ ] **3D frozen 2D frame stack mode**: Volumetric stack of discretized existing 2D variation frames (e.g., tonal-time-lines bands) viewed as a 3D volume. Deferred from 3D brainstorm; high complexity, needs GPU voxel approach; see spec for pros/cons.
- [ ] **Add scrolling piano roll / sheet music display**: Show a piano roll or sheet music view beneath the main image that scrolls in sync with playback, giving users a traditional notation reference alongside the visualizer.
- [ ] **Improve UI layout to reduce overlapping elements**: Audit and redesign control panel, legend, and export overlays to prevent visual overlap, especially on smaller screens or with dense score data. Covered by Phases 2 and 5 of [`plans/2026-07-29-ui-layout-and-usability.md`](../plans/2026-07-29-ui-layout-and-usability.md); remove this bullet when that plan completes.
- [ ] **Add local audio-file input and estimated transcription**: Decode local audio → stem separation (Demucs) → Basic Pitch per pitched stem → one estimated track per stem (per-instrument colored voices), preserving the MIDI path. **Desktop (Tauri) is the primary target; browser is the fallback.** See [`plans/2026-07-22-audio-file-input.md`](../plans/2026-07-22-audio-file-input.md).
- [ ] **Bundle the offline desktop app (PRIMARY target for audio)**: Package the Vite frontend + native Demucs + Basic Pitch (models, WASM/ONNX, inference sidecar) in a macOS-first Tauri app with scoped native file dialogs and no cloud backend. This is a first-class release gate of the audio plan (Phase 6), not a follow-up. See [`plans/2026-07-22-audio-file-input.md`](../plans/2026-07-22-audio-file-input.md).
- [ ] **Investigate ONNX Runtime Web for audio transcription (future-proofing only)**: Motivation is escaping the old/unmaintained tfjs 3.x (2021) — NOT security (tfjs has no advisories; the earlier "vuln" claim was mis-attributed to vite/vitest). The 2026-07-22 spike showed the official full-graph `nmp.onnx` is not a drop-in (non-equivalent outputs; thresholds don't transfer). **Concrete recipe from NeuralNote:** convert only the CQT + harmonic-stacking front-end via tf2onnx with manually-fixed batch-norm weights, and run the CNN separately — the front-end is exactly where the naive conversion diverged. Parity is achievable with this approach. Low priority; revisit alongside desktop-bundle work. See `tmp/2026-07-22-phase0-spike-findings.md`.
- [ ] **Explore a desktop-only high-fidelity polyphonic tier (frontier transcribers)**: For the offline desktop bundle, evaluate large multi-instrument transformers that beat Basic Pitch on real mixes — e.g. MuScriptor (2026, 1.3B open-weight), YourMT3+/MIROS (2025 AMT winners, MusicFM encoder), MT3. All are heavy GPU-oriented PyTorch (multi-GB), so not browser-viable and only feasible in a heavy Tauri bundle (ONNX/Python sidecar). Research-tier, not v1. Surveyed 2026-07-23.
- [ ] **Export inferred audio transcription as downloadable MIDI**: v1 audio input ships visual exports only; add a `.mid` writer so users can take the estimated notes into a DAW, with the same estimated/model-version manifest metadata. Deferred follow-up to [`plans/2026-07-22-audio-file-input.md`](../plans/2026-07-22-audio-file-input.md).
- [ ] **Deterministic offline WAV audio export**: Render score audio directly to downloadable WAV file offline.

- [ ] **UI layout and usability overhaul**: Mode-aware controls, larger canvas, accordion, legend toggle, geometry picker, session restore, and related UX. See [`plans/2026-07-29-ui-layout-and-usability.md`](../plans/2026-07-29-ui-layout-and-usability.md) and [`dev-docs/ui-suggestions.md`](ui-suggestions.md).

## Bugs and UX issues

- [ ] **Play not working first time pressed**: Playback fails to start on the first press of the play button. See [`plans/2026-07-27-playback-and-transport-fixes.md`](../plans/2026-07-27-playback-and-transport-fixes.md).
- [ ] **Continue playback when skipping ahead/back**: Playback should keep running when the user scrubs the timeline forward or backward during playback. See [`plans/2026-07-27-playback-and-transport-fixes.md`](../plans/2026-07-27-playback-and-transport-fixes.md).

## 3D camera interaction

- [ ] **Allow panning on 3D as well as zoom and rotate**: Add pan (two-finger or modifier-key drag) to the 3D camera alongside existing zoom and rotate. See [`plans/2026-07-27-playback-and-transport-fixes.md`](../plans/2026-07-27-playback-and-transport-fixes.md).
