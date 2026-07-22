# NEEDS REVIEW

# Plan: Export Title — MIDI Filename Default with Manual Override

Last reviewed: draft (addressing assessment)
Date: 2026-07-22
Author: agent
Status: draft
Linked issue/PR: n/a

## Goal

Show the MIDI filename (or a user-supplied title) as a visible heading on canvas previews
and SVG/PNG exports. The default title comes from the loaded MIDI file name; users can
replace it before export. PNG exports and plotter SVG include the title as part of the
rendered artwork.

## Definition

1. `Score.title` is already populated from the MIDI filename in `parseMidiData` (`src/core/midi/parser.ts` line 49).
2. Title is passed through render options (`SvgOptions`, `CanvasRenderOptions`) only — **not** added to `RenderedGeometry`. This avoids duplicating `Score.title` and keeps the domain model clean.
3. The SVG export renders a compact title bar at the **top-left** when a title is set.
4. The Canvas preview renders the title as a small, high-contrast overlay at the **top-left** on every frame, consistent with the existing `score-title` element placement.
5. The browser UI exposes a text input in the export control strip, pre-filled with the current `score.title`; editing it before export changes the title in the output.
6. The CLI accepts `--title` to override the filename-derived default for this export; the resolved title is included in the optional manifest JSON.

## Out of scope

- Persisting title preference across sessions.
- Title embedded in the plotter legend text — legend text is rule-set documentation.
- Automatic key or composer detection from MIDI metadata.
- Changes to `RenderedGeometry` — title is a render-time concern, not a geometry concern.

## Proposed file changes

```text
src/renderers/svg/svgBuilder.ts   — accept title in SvgOptions; render title bar (top-left)
src/renderers/canvas/canvasRenderer.ts — accept title in canvas render options; render overlay (top-left)
src/ui/app.ts                     — add title input; thread through export calls
index.html                        — add title text input in the export control strip
src/cli/renderMidi.ts             — add --title CLI option; include resolved title in manifest
styles/ (or inline)               — minimal styling for the title input and export pill
tests/svg.test.ts                 — test title rendering (present/absent/truncated/plotter)
tests/canvas.test.ts              — test title overlay position and contrast
```

## Approach

### Title propagation

`score.title` is read-only domain data. The UI and CLI hold a mutable local override
(`exportTitle`) initialized from `score.title`. That override is passed directly to
`buildSvg` and `canvasRenderer.render` via options — never into `RenderedGeometry`. The
mapper produces identical geometry regardless of title.

**Key constraint**: the live canvas preview renders with the same title as exports, so the
user sees exactly what they will get. Both `render()` (live preview) and `downloadPng()`
share the same render call shape.

### SVG

The title bar sits at the **top-left corner**, using a small semi-transparent dark pill
background with light text. When `--plotter` is set, the title bar is **omitted by default**
(since physical plots often have a pre-printed or handwritten title field); a future
`--include-plotter-title` flag could override this. Legend remains at bottom-right and does
not conflict with top-left title.

Title is truncated at **40 characters** (`title.length > 40 ? title.slice(0, 37) + '…' : title`).

### Canvas

Title is rendered as a small, high-contrast label at the top-left — matching the existing
`score-title` `h2` placement in `index.html`. It does not compete with the artwork since
the geometry is uniformly fitted with safe inset padding (path/circle modes) or fills the
full canvas (tonal time-lines). PNG `downloadPng()` captures the labeled canvas frame
directly; the legend is rendered alongside the title in the same capture.

### CLI

`--title "My Custom Title"` sets the export title for this run only; it does not modify
the score object. When `--manifest` is provided, the resolved title is written into the
manifest JSON under `output.title` for reproducibility.

## Phases & checklist

### Phase 1: SVG renderer

- [ ] Add `title?: string` to `SvgOptions`.
- [ ] Add `buildTitleSvg` helper: top-left pill in standard mode; omitted in plotter mode.
- [ ] Call it in `buildSvg` after background, before voice paths, when `options.title` is set.
- [ ] Reserve 40px top margin when title is present (legend stays bottom-right).

### Phase 2: Canvas renderer

- [ ] Add `title?: string` to `CanvasRenderOptions`.
- [ ] Add `drawCanvasTitle` method: renders title at top-left, 16px font, semi-transparent dark pill background, truncated at 40 chars.
- [ ] Call `drawCanvasTitle` in `render()` after background fill, before bands/paths.
- [ ] Ensure PNG capture via `downloadPng()` uses the same titled frame as the live preview.

### Phase 3: UI

- [ ] Add a text input in the export control strip (`export-group`) in `index.html`,
  pre-filled with `score.title`.
- [ ] In `app.ts`, track `exportTitle` (initialized from `score.title`); update on input change.
- [ ] **Pass `exportTitle` to every `canvasRenderer.render()` call** — including the live
  preview in `render()` — so the GUI shows exactly what PNG export produces.
- [ ] Pass `exportTitle` to `buildSvg` in all SVG export paths.
- [ ] Add minimal CSS for the export title input (compact, inline with export buttons).

### Phase 4: CLI

- [ ] Add `--title` to `valueOptions` in `parseCli` and to `CliOptions`.
- [ ] Resolve title: `options.title ?? score.title`.
- [ ] Pass resolved title to `buildSvg` options.
- [ ] Include `output.title` in the manifest JSON.

### Phase 5: Verification

- [ ] Unit test: title absent → no title bar in SVG.
- [ ] Unit test: title present → SVG contains expected title elements.
- [ ] Unit test: title truncation at 40 chars.
- [ ] Unit test: plotter mode → title omitted.
- [ ] Unit test: canvas title renders at top-left, correct contrast.
- [ ] Run `npm run validate`.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Long titles overflow the title bar | low | low | Truncate at 40 chars with ellipsis. |
| Canvas overlay competes with artwork | low | low | Small font, top-left corner, high contrast on dark bg. |
| Plotter title wastes plotter media | low | medium | Omit title in plotter mode by default. |