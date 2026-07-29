# Plan: UI layout and usability overhaul

Last reviewed: 2026-07-29
Date: 2026-07-29
Author: agent
Status: in-progress
Linked issue/PR: n/a
Spec / suggestions: [`dev-docs/ui-suggestions.md`](../dev-docs/ui-suggestions.md)

## Goal

Make Visual Score Studio easier to learn and use, give the canvas more of the viewport,
and modernize the chrome—without changing mapper determinism, export semantics, or the
offline MIDI boundary. Ship clarity (mode-aware controls, live rule caption), space
(narrower sidebar, overlay header, deduplicated framing), and progressive polish
(geometry picker, session restore, paper preview) in phased, reviewable increments.

SemVer impact when shipped: **MINOR** (user-facing UI/UX). Individual polish-only CSS
passes may be **PATCH** if they do not add controls or change behavior.

## Out of scope

- A/B or split-screen compare of two configs
- Floating Figma-style panel as the first layout (Option 3C) — deferred until overlay
  header + HUD framing prove insufficient
- Tabbed sidebar as a replacement for accordion (skip unless scroll remains painful)
- Voice-aware sidebar pulse during playback
- Live canvas aspect-ratio toggle as the primary print path (prefer export review sheet)
- Uploading MIDI, telemetry, or any network sync of user scores
- Changing visual mapping formulas or export geometry (DESIGN.md contracts stay put
  unless a follow-on explicitly revises them)

## Approach

Follow the revised priority in `ui-suggestions.md`: **clarity and canvas first**, then
sidebar structure, then discoverability, then persistence/power tools, then appearance
and tablet.

Prefer small, testable slices that each leave the app usable. Reuse existing patterns
(`supportsRadialSpokeScale()`, Summary phrasing, HUD chrome) rather than introducing a
UI framework.

### Alternatives considered

| Option | Why not chosen |
|---|---|
| Accordion-only first | Helps scroll but leaves irrelevant controls visible; mode-aware surfacing is higher leverage |
| Tabbed sidebar first | Hides section headers; weaker discoverability than accordion + mode-aware |
| Floating panel (3C) first | High layout risk; try overlay header + HUD framing first |
| Live aspect toggle | Export review sheet better matches print/plotter compose without fighting the square preview |

## Proposed file changes

```
dev-docs/ui-suggestions.md     — source suggestions (already updated 2026-07-29)
index.html                     — accordion markup, HUD/caption, geometry picker shell,
                                 playback bar slim-down, first-run strip, dialogs
src/ui/styles/main.css         — sidebar width, overlay header, accordion, paper theme,
                                 tablet bottom sheet, polish pass
src/ui/app.ts                  — legendVisible, mode-aware visibility, caption, framing
                                 consolidation, persistence, undo, export review wiring
src/ui/controlApplicability.ts — NEW: per-variation control applicability map
src/ui/configPersistence.ts    — NEW (optional split): localStorage + #config= codec
src/core/legend/… or summary   — shared plain-English caption strings if reused
tests/ui/… or tests/…          — applicability map, config codec round-trip, legend flag
DESIGN.md / docs/modes.md      — only if user-facing control visibility rules need documenting
ARCHITECTURE.md                — only if a new public UI module boundary is introduced
CHANGELOG.md                   — user-facing entries per shipped phase
```

Exact file splits may vary; keep new modules under ~500 lines and side-effect-free where
possible (applicability map and config codec should be pure).

## Phases & checklist

### Phase 1: Clarity and canvas (P0)

- [x] Add per-variation control applicability map; hide/disable inactive Compose/Refine
      controls and show a short “Ignored by this mode” hint (extend the radial spoke-scale
      pattern; align with DESIGN.md ignore notes)
- [x] Narrow sidebar from 390px to ~320px
- [x] Overlay stage title/meta on the canvas (recover top padding; fade on idle optional)
- [x] User-facing legend show/hide for live preview (HUD control + optional `L`); exports
      keep current legend policy (SVG/PNG include; plotter omits)
- [x] Vitest: applicability expectations for representative modes; legend flag reaches
      `CanvasRenderer.render` options
- [x] Update `CHANGELOG.md` Unreleased for shipped Phase 1 behavior; SemVer **MINOR**

### Phase 2: Sidebar structure and transport (P1)

- [x] Convert control groups to accordion (`<details>`/`<summary>` or equivalent);
      default 01+02 open; optional collapse/expand all
- [x] Deduplicate Viewport & Framing: Musical/Time window living primarily in HUD/flyout;
      shrink or remove redundant section 05
- [x] Move Engine/Bank selects out of the playback bar into Refine (or Audio drawer);
      keep play / time / scrubber primary
- [x] Accordion section badges for key active values (variation name, voice count) if
      cheap after accordion lands
- [ ] Manual/UI smoke: no overlapping HUD vs playback vs caption at desktop widths
- [x] Changelog **MINOR** for structure/transport changes

### Phase 3: Discoverability (P1–P2)

- [ ] Live one-line rule caption under/over the stage, driven by active config; keep
      Summary dialog for full detail
- [ ] Visual geometry picker (tile grid by mode family); preserve accessible selection
      (select or radiogroup semantics)
- [ ] Optional: lightweight first-run 3-step strip (score → geometry → play), dismissible
      via `localStorage`
- [ ] Changelog **MINOR**

### Phase 4: Persistence and power tools (P2)

- [ ] Restore last session (variation + controls; MIDI path only for bundled demos—do not
      persist uploaded file bytes)
- [ ] Optional `#config=` hash encode/decode for shareable looks (no MIDI payload)
- [ ] Config undo/redo ring buffer (`Cmd/Ctrl+Z` / redo); exclude MIDI file swaps in v1
- [ ] Keyboard shortcut overlay (`?`) and/or command palette (`⌘K`) — at least one in
      this phase; both if time allows
- [ ] Tests for config codec round-trip and undo stack
- [ ] Changelog **MINOR**

### Phase 5: Appearance, export compose, tablet (P3)

- [ ] Paper / plotter preview theme toggle (preview chrome only; export semantics
      unchanged)
- [ ] Export review sheet (title, format, legend, optional framing note) before download
- [ ] Surface polish pass from suggestions §7 (glass, typography, slider track, button
      hover)—after layout is stable
- [ ] Tablet: bottom-sheet controls instead of stacking sidebar above canvas at the
      existing mobile breakpoint (or a dedicated 768–1024px band)
- [ ] Changelog **MINOR** (or **PATCH** if polish-only slice)

### Deferred (track in suggestions; not required to complete this plan)

- Collapsible icon-rail sidebar (3B)
- Floating panel layout (3C)
- Preset bookmark chips (6a), focus/presentation mode (6b), mini navigation strip (6d)
- Live canvas aspect-ratio toggle (5d)

## Verification

- [ ] `npm run validate` passes after each phase that changes TypeScript or tests
- [ ] Manual desktop check: canvas larger or equal; no control overlap with HUD/playback
- [ ] Manual: switch among lines, polar_fan, radial_pitch_spokes, and a 3D mode — only
      applicable controls active; caption/summary stay truthful
- [ ] Legend off in preview does not strip legend from SVG/PNG export; plotter still
      omits legend
- [ ] Uploaded MIDI still never leaves the browser; config hash contains no file bytes
- [ ] DESIGN.md / docs/modes.md updated only when control visibility or user-facing
      framing rules change
- [ ] User-facing notes in `CHANGELOG.md`; developer-only harness notes in
      `CHANGELOG.dev.md` if needed

## Completion checklist

When all required phases (1–5) and verification are done:

- [ ] Update plan `Status:` to `complete` with completion date
- [ ] Move plan to `plans/archive/`
- [ ] Confirm `CHANGELOG.md` (and `CHANGELOG.dev.md` if needed) cover shipped work
- [ ] Remove the completed UI overhaul item from `dev-docs/TO_DO.md` (do not leave it
      checked off)
- [ ] Resolve or merge the overlapping “Improve UI layout to reduce overlapping
      elements” backlog item if Phase 2/5 addressed it

## Open questions

- [ ] Geometry picker: static icons vs tiny deterministic SVG thumbnails (thumbnails are
      nicer; icons ship faster)?
- [ ] Config hash: query-style `#config=` vs compact base64url of JSON?
- [ ] First-run strip: ship in Phase 3 with caption/picker, or wait until persistence
      (Phase 4) so dismiss state is consistent?
- [ ] Should Paper theme affect PNG export when enabled, or remain preview-only?

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Applicability map drifts from mapper | med | med | Single module + tests keyed to mode families; cite DESIGN.md ignore lines |
| Overlay header/HUD collide on short screens | med | med | Fade/collapse rules; re-check ≤900px and Phase 5 sheet |
| Accordion + mode-hiding empties sections | low | low | Auto-collapse empty subgroups; badges show why section matters |
| Config restore surprises launch randomizer | med | low | Restore only when hash or explicit “restore session”; else keep randomizer |
| Scope creep into 3C/floating panel | med | high | Keep 3C deferred; ship Phases 1–2 before revisiting |
