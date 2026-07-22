# AudioVisualizer Development TODOs

Last updated: 2026-07-21

## High Priority Backlog

- [x] **Clean up `notes_and_ideas/` folder**: Removed from the working tree on 2026-07-21.
- [x] **Purge `notes_and_ideas/` from Git history**: Rewrote and pruned local history on 2026-07-21; verified no reachable commit contains the path, then published the new private origin.
- [x] **Define `DESIGN.md`**: Added the canonical architecture and design specification covering domain contracts, mapping algorithms, renderer pipelines, and export behavior.
- [x] **Set up repo harness engineering**: Added a project-specific agent entry point, lightweight workflow, and `npm run validate` local gate. The chosen orchestration tier is `none` because this small app does not benefit from multi-agent infrastructure.
- [x] **Update `README.md`**: Update project `README.md` to describe AudioVisualizer, feature set, stack architecture, local setup (`npm run dev`), build commands, and vector/SVG export usage.

## Next product milestones

- [ ] **Build robust MIDI playback and voice routing**: Replace the local preview synth with selectable General MIDI soundfonts/instruments, per-track volume/mute/solo controls, channel/program-change handling, sustain support, and deterministic audio-export policy.
- [ ] **Create a dynamic composition layout engine**: Fit and center every mode to the available canvas while retaining its mapping semantics; add bounds analysis, scale-to-fit, safe padding, overflow handling, and optional pan/zoom rather than letting long scores drift off-canvas.
