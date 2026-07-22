# AudioVisualizer Development TODOs

Last updated: 2026-07-22

## High Priority Backlog

- [x] **Clean up `notes_and_ideas/` folder**: Removed from the working tree on 2026-07-21.
- [x] **Purge `notes_and_ideas/` from Git history**: Rewrote and pruned local history on 2026-07-21; verified no reachable commit contains the path, then published the new private origin.
- [x] **Define `DESIGN.md`**: Added the canonical architecture and design specification covering domain contracts, mapping algorithms, renderer pipelines, and export behavior.
- [x] **Set up repo harness engineering**: Added a project-specific agent entry point, lightweight workflow, and `npm run validate` local gate. The chosen orchestration tier is `none` because this small app does not benefit from multi-agent infrastructure.
- [x] **Update `README.md`**: Update project `README.md` to describe AudioVisualizer, feature set, stack architecture, local setup (`npm run dev`), build commands, and vector/SVG export usage.

## Next product milestones

- [x] **Add tonal time-lines display mode**: Map score time from top to bottom as full-width horizontal bands, colored by the circular, velocity-weighted average hue of active notes. See [`plans/2026-07-22-tonal-time-lines.md`](../plans/2026-07-22-tonal-time-lines.md).
- [x] **Add a reproducible MIDI-to-SVG CLI**: `npm run render -- --input song.mid` uses the shared parser, mapper, fitter, and SVG renderer; it supports rule options and an optional JSON manifest.
- [ ] **Finalize robust MIDI playback and voice routing**: Current local synth supports per-track timbre, volume, mute, solo, and program metadata. Add selectable General MIDI soundfonts, program-change handling, sustain support, and deterministic audio-export policy.
- [ ] **Extend the dynamic composition layout engine**: Current uniform bounds-fit, centering, safe padding, and overflow prevention apply to preview and exports. Add optional pan/zoom and composition-aware placement controls.
