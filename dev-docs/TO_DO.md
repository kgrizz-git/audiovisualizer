# AudioVisualizer Development TODOs

Last updated: 2026-07-21

## High Priority Backlog

- [ ] **Clean up `notes_and_ideas/` folder**: Requires an explicit deletion decision because it removes 2,206 tracked files.
- [ ] **Purge `notes_and_ideas/` from Git history**: Requires explicit approval for a destructive history rewrite and coordination with any existing clones/forks.
- [x] **Define `DESIGN.md`**: Added the canonical architecture and design specification covering domain contracts, mapping algorithms, renderer pipelines, and export behavior.
- [x] **Set up repo harness engineering**: Added a project-specific agent entry point, lightweight workflow, and `npm run validate` local gate. The chosen orchestration tier is `none` because this small app does not benefit from multi-agent infrastructure.
- [x] **Update `README.md`**: Update project `README.md` to describe AudioVisualizer, feature set, stack architecture, local setup (`npm run dev`), build commands, and vector/SVG export usage.
