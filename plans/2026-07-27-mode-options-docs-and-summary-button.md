# Plan: Mode/Option Docs, README Redraft, and Summary Button

Last reviewed: 2026-07-27
Date: 2026-07-27
Author: 
Status: draft

## Goal

Make it easy for a user to understand exactly what each visual mode and option does, both
in the app UI and in the repo docs. Split the visual-semantics content so DESIGN.md stays
focused on aesthetics and design rationale, and the modes/options get their own reference.
Add an in-app button that opens a detailed summary of the currently active configuration.

## Out of scope

- Changing the actual mapping logic or visual output
- Adding new visual modes or options
- Updating ARCHITECTURE.md (contracts unchanged)
- Creating audio transcription or playback features

## Approach

Three work streams run in parallel:

### A. Docs restructuring

1. **Create `docs/modes.md`** — a focused reference that explains every visual mode
   (lines, circles, vertical_tone, tonal_time_lines, polar_fan, polar_walk,
   radial_voice_paths, and 3D variants) and every option (chordLayout, gapPolicy,
   originMode, pitchHueMode, intervalAngleEnabled, lengthProportionalTo,
   velocityGlow, constantStrokeWidth, ringFlashes3D, zScale, camera presets,
   playback cue, auto-zoom, etc.) in detail, with the concrete formulas from the
   source code. Each mode section has a table of "Musical input → Visual output"
   plus the relevant parameters and their defaults. This is written for a reader
   who wants to understand exactly what the image will look like.

2. **Trim DESIGN.md** — remove the detailed mode-by-mode descriptions (they move
    to `docs/modes.md`). Keep the visual grammar table, color system, palette
    rules, velocity-driven options, canvas/export aesthetic, and design
    guardrails. Replace each removed mode section with a pointer to `docs/modes.md`.
    Keep the 3D mode descriptions in DESIGN.md since they are tightly coupled to
    rendering aesthetics (bloom, fog, camera presets, Z-depth normalization) and
    belong in the design doc.

    **Trimming criterion:** Remove any section whose content is derivable from the
    source (`scoreMapper.ts`, `map3d.ts`) and could be read from those files;
    preserve sections that explain color rationale, canvas aesthetic choices,
    export philosophy, and generative patterns. A one-time inventory via
    `grep -n "^## \|^### " DESIGN.md` can identify candidate sections before trimming.

3. **Update README.md** — simplify the "Primary mapping" and "Variations"
   sections to be a concise overview with a pointer to `docs/modes.md` for the
   full reference. Add a "How to read the summary" callout explaining the
   in-app summary button.

### B. In-app summary button

4. **Add a "Summary" button** in the sidebar, section 02 ("Compose the rule set"),
   next to the variation selector — a small `ⓘ` or "Summary" button that opens a
   modal dialog showing the active configuration summary.

5. **Implement the summary modal** — reuse `getLegendContent(config)` from
   `src/core/legend/legendContent.ts` to build the content, since it already
   produces a human-readable `title` + `lines` + `swatches` breakdown. The modal
   shows the mode name, all active rules as bullet lines, and the color swatches.
   The modal is a styled `<dialog>` element (already a pattern in the app via
   `library-prompt`), with a close button and click-outside-to-close.

6. **Style the modal** — consistent with the sidebar frosted-glass aesthetic (`--panel`
   background, `#e9eef8` text, rounded corners). Add CSS to `src/ui/styles/main.css`.

### C. Documentation infrastructure

7. **Update `AGENTS.md`** — add `docs/modes.md` to the docs list so future agents
   know it exists and should keep it in sync when modes or options change.

8. **Add a TO_DO.md entry** for tracking this work as it proceeds.

## Proposed file changes

```
docs/modes.md                              — new file; detailed mode/option reference
DESIGN.md                                  — trim mode descriptions, add pointer to docs/modes.md
README.md                                  — simplify variations section, add summary callout
src/ui/styles/main.css                     — modal styling
src/ui/app.ts                              — add summary button + modal logic
index.html                                 — add summary button element in sidebar
AGENTS.md                                  — add modes.md to docs list
dev-docs/TO_DO.md                          — add tracking entry
plans/2026-07-27-mode-options-docs-and-summary-button.md — this plan
```

## Phases & checklist

### Phase 1: Create docs/modes.md

- [ ] Add a content template for each mode section:
  - **Description** — one paragraph of plain language
  - **Musical input → Visual output table** — at least 3 rows (pitch, time, velocity → x/y/color/shape)
  - **Parameters table** — name, default, range, effect
  - **Formula excerpt** — the key line(s) from source (with file:line reference)
  - **See also** — related modes and options
- [ ] Write all sections using the template — one section per variation case in `legendContent.ts` (18 cases)
- [ ] Verify all formulas match the current source (`scoreMapper.ts`, `polyphonicLines.ts`,
  `noteStyle.ts`, `map3d.ts`, `legendContent.ts`)
- [ ] Verify the doc is reachable from DESIGN.md and README.md via the pointers added in
  Phase 2
- [ ] Verify `docs/modes.md` contains a section for every mode string in `legendContent.ts`

### Phase 2: Restructure DESIGN.md and README.md

- [ ] Remove detailed mode descriptions from DESIGN.md (replace with pointer to
  `docs/modes.md`)
- [ ] Keep visual grammar table, color system, velocity-driven options, and design
  guardrails in DESIGN.md
- [ ] Keep 3D rendering aesthetics (bloom, fog, camera presets, Z-depth) in DESIGN.md
- [ ] Simplify README.md variations section; add pointer to `docs/modes.md`
- [ ] Add "How to read the summary" callout in README.md pointing to the in-app button

### Phase 3: Implement summary button and modal

- [ ] Add summary button element to `index.html` in section 02 with `aria-label="Show active configuration summary"`, `title="Summary"`, and visible focus ring
- [ ] Add modal HTML structure (reuse `<dialog>` pattern from `library-prompt`)
- [ ] Wire button click in `app.ts` to open modal with `getLegendContent(config)` output
- [ ] Add modal HTML structure (reuse `<dialog>` pattern from `library-prompt`)
- [ ] Wire button click in `app.ts` to open modal with `getLegendContent(config)` output
- [ ] Add modal close logic (close button, click-outside, Escape key via
  `dialog.addEventListener('cancel', (e) => { e.preventDefault(); dialog.close(); })`)
- [ ] Add modal CSS to `main.css` (frosted glass, responsive, accessible)
- [ ] Verify modal content updates when config changes (re-render on variation/rule change)
- [ ] Verify summary button has `aria-label`, visible focus ring, and logical tab order
- [ ] Verify summary modal does not trap focus — Escape closes it, clicking overlay closes it

### Phase 4: Documentation metadata and tracking

- [ ] Update `AGENTS.md` to reference `docs/modes.md`
- [ ] Add entry to `dev-docs/TO_DO.md`
- [ ] Update plan status to complete (move to archive after all phases verified)

## Verification

- [ ] `npm run validate` passes (type-check, tests, build)
- [ ] `docs/modes.md` contains a section for every mode string in `legendContent.ts` (18 cases)
- [ ] No broken links: all `docs/modes.md` references in DESIGN.md and README.md resolve
- [ ] Summary modal opens from the button and shows correct content for each mode
- [ ] Summary modal closes via close button, click-outside, and Escape key
- [ ] Summary button has `aria-label`, visible focus ring, and logical tab order in sidebar
- [ ] Summary modal does not trap focus — Escape and overlay click both close it
- [ ] Summary modal content updates when user changes variation selector
- [ ] DESIGN.md trims only mode sections derivable from source; aesthetic rationale sections preserved
- [ ] README.md "How to read the summary" callout is accurate to the current modal behavior
- [ ] Modal styling is consistent with existing `--panel` and `--ink` design tokens

## Completion checklist

- [ ] Update plan `Status:` to `complete` with completion date
- [ ] Move plan to `plans/archive/`
- [ ] Add entry to `CHANGELOG.md` (user-facing: docs, summary button) or `CHANGELOG.dev.md` (internal: doc restructuring)
- [ ] Remove the completed item from `dev-docs/TO_DO.md`

## Open questions

- [ ] Should the summary modal include the full legend swatches or just the rule lines?
  (Default: include both, matching the SVG legend style.)
- [ ] Should the modal show the exact numeric values for sliders (e.g., `angleScale: 180`,
  `lengthScale: 40`) or only the human-readable descriptions? (Default: both —
  `legendContent.ts` gives human-readable lines; slider values can be appended from
  `RuleConfig`.)
- [ ] Should `docs/modes.md` be listed in a top-level docs index or is the `DESIGN.md`
  pointer sufficient? (Default: no separate index; DESIGN.md and README.md are the entry points.)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `docs/modes.md` becomes stale when options change | medium | high | Keep `legendContent.ts` as the single source of truth for the summary modal; add a content template per mode to reduce drift |
| Modal CSS conflicts with existing HUD elements | low | low | Use a dedicated `.modal-overlay` class scoped to the dialog; test on both mobile and desktop viewports |
| Summary button adds visual clutter to section 02 | low | low | Use a small `ⓘ` icon button at the end of the section header; modal occupies overlay space, not inline |
