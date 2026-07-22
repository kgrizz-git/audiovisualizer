# AudioVisualizer Development TODOs

Last updated: 2026-07-22

## High Priority Backlog

- [x] **Clean up `notes_and_ideas/` folder**: Removed from the working tree on 2026-07-21.
- [x] **Purge `notes_and_ideas/` from Git history**: Rewrote and pruned local history on 2026-07-21; verified no reachable commit contains the path, then published the new private origin.
- [x] **Define design and architecture references**: `DESIGN.md` documents visual language and mapping semantics; `ARCHITECTURE.md` documents domain contracts, stack, runtime boundaries, and export pipeline.
- [x] **Set up repo harness engineering**: Added a project-specific agent entry point, lightweight workflow, and `npm run validate` local gate. The chosen orchestration tier is `none` because this small app does not benefit from multi-agent infrastructure.
- [x] **Update `README.md`**: Update project `README.md` to describe AudioVisualizer, feature set, stack architecture, local setup (`npm run dev`), build commands, and vector/SVG export usage.

## Next product milestones

- [x] **Add tonal time-lines display mode**: Map score time from top to bottom as full-width horizontal bands, colored by the circular, velocity-weighted average hue of active notes. See [`plans/2026-07-22-tonal-time-lines.md`](../plans/2026-07-22-tonal-time-lines.md).
- [ ] **Explore 3D time-slice modes**: Map each time bin to an XY-plane slice and advance musical time along the positive Z axis; define projection, navigation, export, and readable pitch/voice encodings before implementation.
- [ ] **Add transposition with color-aware remapping**: Let users shift pitch by semitones before mapping, and shift pitch-derived hues by the same interval so the visual remains musically consistent; record the transpose setting in exports/manifests.
- [x] **Add a reproducible MIDI-to-SVG CLI**: `npm run render -- --input song.mid` uses the shared parser, mapper, fitter, and SVG renderer; it supports rule options and an optional JSON manifest.
- [ ] **Add local audio-file input and estimated transcription**: Support browser-decodable MP3, WAV, and typical AAC-in-M4A through a worker-backed audio-to-note pipeline while preserving the MIDI path. See [`plans/2026-07-22-audio-file-input.md`](../plans/2026-07-22-audio-file-input.md).
- [ ] **Bundle an offline desktop app**: Package the Vite frontend and local analysis assets in a macOS-first Tauri application with scoped native file dialogs and no cloud backend. See [`plans/2026-07-22-audio-file-input.md`](../plans/2026-07-22-audio-file-input.md).
- [ ] **Finalize robust MIDI playback and voice routing**: Current local synth supports per-track timbre, volume, mute, solo, and program metadata. Add selectable General MIDI soundfonts, program-change handling, sustain support, and deterministic audio-export policy.
- [ ] **Extend the dynamic composition layout engine**: Current uniform bounds-fit, centering, safe padding, and overflow prevention apply to preview and exports. Add optional pan/zoom and composition-aware placement controls.
