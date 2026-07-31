# Plan: Mode/Option Docs, README Redraft, and Summary Button

Last reviewed: 2026-07-28
Date: 2026-07-27
Status: complete (2026-07-28)

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
    radial_voice_paths, radial_pitch_spokes, and 3D variants including voice towers) and every option (chordLayout, gapPolicy,
    originMode, pitchHueMode, intervalAngleEnabled, lengthProportionalTo,
    velocityGlow, constantStrokeWidth, ringFlashes3D, zScale, camera presets,
    playback cue, auto-zoom, etc.) in detail, with the concrete formulas from the
    source code. Each mode section has a table of "Musical input → Visual output"
    plus the relevant parameters and their defaults. This is written for a reader
    who wants to understand exactly what the image will look like.

    The file must cover all **16** `case` branches in `legendContent.ts:21` — one
    section per mode, no more and no fewer.

2. **Retain DESIGN.md as the visual-rule source of truth**, but make `docs/modes.md`
    the operational reference for exhaustive per-mode and per-control reading. Add clear
    cross-links instead of aggressively deleting established design contracts; keep 3D
    rendering aesthetics (bloom, fog, camera presets, Z-depth normalization) in DESIGN.md.

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

4. **Add a "Summary" button** — append a `<button id="btn-summary" class="btn btn-ghost" type="button" aria-label="Show active configuration summary" title="Summary">Summary</button>` immediately after the `#chord-layout-select` control-item (last element in section 02). This pins the slot explicitly so the implementer does not choose it ad hoc.

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

- [x] Start the file with `Last reviewed: 2026-07-28`; `docs/` is added to the existing
  doc-freshness hook's required directories.
- [x] Add a shared-control/defaults table plus a plain-language description and
  **Musical input → Visual output** table for every mode.
- [x] Write all 16 sections — one per `case` in `legendContent.ts` — with headings that
  match the variation literals exactly.
- [x] Verify all formulas match the current source (`scoreMapper.ts`, `polyphonicLines.ts`,
  `noteStyle.ts`, `map3d.ts`, `legendContent.ts`)
- [x] Verify the doc is reachable from DESIGN.md and README.md via the pointers added in
  Phase 2
- [x] Verify `docs/modes.md` contains a section heading `## <mode-name>` for each of the 16 `case` literals in `legendContent.ts:21`

### Phase 2: Restructure DESIGN.md and README.md

- [x] Add a clear `docs/modes.md` pointer to DESIGN.md without deleting established visual-rule contracts
- [x] Keep visual grammar table, color system, velocity-driven options, and design
  guardrails in DESIGN.md
- [x] Keep 3D rendering aesthetics (bloom, fog, camera presets, Z-depth) in DESIGN.md
- [x] Add an overview pointer to `docs/modes.md` in README.md
- [x] Add "How to read the summary" callout in README.md pointing to the in-app button

### Phase 3: Implement summary button and modal

- [x] Add summary button element to `index.html` in section 02 with `aria-label="Show active configuration summary"`, `title="Summary"`, and visible focus ring
- [x] Add modal HTML structure (reuse `<dialog>` pattern from `library-prompt`)
- [x] Wire button click in `app.ts` to open modal with `getLegendContent(config)` output. Render `gapPolicy` values using `legendContent.ts`'s same formatting (`replaceAll('_', ' ')`) so the modal's right column matches `legendContent.ts` output.
- [x] Add modal close logic (close button, click-outside, Escape key via
  `dialog.addEventListener('cancel', (e) => { e.preventDefault(); dialog.close(); })`)
- [x] Open the modal via `dialog.showModal()` (matching the `library-prompt` idiom in `soundfontLibraryUI.ts:21`) and close via `dialog.close()`
- [x] Add modal CSS to `main.css` (frosted glass, responsive, accessible)
- [x] Verify `gapPolicy` values render as formatted strings (`lift pen`, not `lift_pen`) to match `legendContent.ts` output on both sides of the modal
- [x] Verify modal content updates when config changes (re-render on variation/rule change)
- [x] Verify summary button has `aria-label`, visible focus ring, and logical tab order
- [x] Verify summary modal does not trap focus — Escape closes it, clicking overlay closes it

### Phase 4: Documentation metadata and tracking

- [x] Update `AGENTS.md` to reference `docs/modes.md`
- [x] Add a drift-detection Vitest test (`tests/docs.consistency.test.ts`) that reads every `case '...'` literal from `legendContent.ts` and asserts **set equality** with `## <mode-name>` headings in `docs/modes.md`. This catches additions and removed-mode dangling documentation.
- [x] Add `tests/legendContent.modal.test.ts`, binding each mode table's `Visual output` phrases and legend title to `getLegendContent(config)` without brittle full-prose equality.
- [x] Add `docs` to `REQUIRED_DIRS` in `hooks/scripts/check_doc_freshness.py`; do not add a CI job or ESLint rule because Vitest already runs inside `npm run validate` in CI.
- [x] Run a one-shot `rg` sweep across markdown to confirm the current two new mode names are documented consistently.
- [x] Resolve open questions by recording defaults in the plan body (listed below)
- [x] Add entry to `CHANGELOG.md` for the user-facing reference and summary

## Verification

- [x] `npm run validate` passes (type-check, tests, build)
- [x] `docs/modes.md` headings and `legendContent.ts` case literals have identical 16-mode sets — gate enforceable by `tests/docs.consistency.test.ts`
- [x] `tests/legendContent.modal.test.ts` binds every documented visual-output phrase to the active in-app legend line for that mode
- [x] No broken links: all `docs/modes.md` references in DESIGN.md and README.md resolve
- [x] Summary modal opens from the button and shows correct content for each mode
- [x] Summary modal closes via close button, click-outside, and Escape key
- [x] Summary button has `aria-label`, visible focus ring, and logical tab order in sidebar
- [x] Summary modal content updates when user changes variation selector
- [x] Modal reuses `--ink`, `--line`, `--muted` design tokens (matches `library-prompt`)
- [x] Modal uses `showModal()` / `close()` idiom from `soundfontLibraryUI.ts`
- [x] Numeric `RuleConfig` values render in the modal alongside legend lines (two-column layout)
- [x] `gapPolicy` values shown as formatted strings (`lift pen`, not `lift_pen`) to match `legendContent.ts` output
- [x] README.md "How to read the summary" callout is accurate to the current modal behavior
- [x] Modal styling is consistent with existing `--panel` and `--ink` design tokens

## Completion checklist

- [x] Update plan `Status:` to `complete` with completion date
- [x] Move plan to `plans/archive/`
- [x] Add entry to `CHANGELOG.md` (user-facing: docs, summary button)
- [x] Remove the completed item from `dev-docs/TO_DO.md`

## Open questions — resolved

All three defaults are locked in and recorded here before implementation:

1. **Swatches vs. rule lines?** → Both (matches SVG legend). Strikethrough confirmed.
2. **Numeric values alongside descriptions?** → Both (two-column layout). Left column = legend lines; right column = key/value list of the numeric `RuleConfig` fields that affect the active variation (`angleScale`, `lengthScale`, `strokeWidthBase`, `transposeSemitones`, `zScale` where applicable). `gapPolicy` values shown as formatted strings (`lift pen`, not `lift_pen`) to match `legendContent.ts` output. Strikethrough confirmed.
3. **Separate docs index vs. DESIGN.md pointer?** → No separate index; DESIGN.md and README.md are the entry points. Strikethrough confirmed.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `docs/modes.md` becomes stale when options change | medium | high | Keep `legendContent.ts` as the single source of truth; add a content template per mode; enforce via `tests/docs.consistency.test.ts` (drift-detection test in Phase 4) |
| Modal CSS conflicts with existing HUD elements | low | low | Use a dedicated `.modal-overlay` class scoped to the dialog; test on both mobile and desktop viewports |
| Summary button adds visual clutter to section 02 | low | low | Append the button after the last control in section 02 (`#chord-layout-select`); modal occupies overlay space, not inline |
