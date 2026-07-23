# Plan: Export Title — MIDI Filename Default with Manual Override

Last reviewed: 2026-07-22T17:45 (addressed second assessment)
Date: 2026-07-22
Author: agent
Status: ready
Linked issue/PR: n/a

## Goal

Show the MIDI filename (or a user-supplied title) as a visible heading on canvas previews
and SVG/PNG exports. The default title is the resolved `Score.title` (the MIDI's embedded
header name, or the filename if no embedded name); users can replace it before export.
PNG exports and plotter SVG include the title as part of the rendered artwork.

## Definition

1. `Score.title` is populated in `parseMidiData` as `midi.header.name || fileName`
   (`src/core/midi/parser.ts:49`). The embedded header name wins when present.
2. Title is passed through render options (`SvgOptions`, `CanvasRenderOptions`) only —
   **not** added to `RenderedGeometry`. This avoids duplicating `Score.title` and keeps the
   domain model clean.
3. The SVG export renders a compact title bar at the **top-left** when a title is set.
4. The Canvas preview renders the title as a small, high-contrast overlay at the
   **top-left** on every frame. The title is a new on-canvas element; it mirrors but does
   not replace the existing DOM `<h2 id="score-title">` above the canvas.
5. The browser UI exposes a text input in the export control strip, pre-filled with the
   current `score.title`; editing it before export changes the title in the output.
6. The CLI accepts `--title` to override the resolved title for this export; the
   `--include-plotter-title` flag forces the title into plotter output; the resolved title
   is included in the optional manifest JSON.

## Out of scope

- Persisting title preference across sessions.
- Title embedded in the plotter legend text — legend text is rule-set documentation
  (`VISUAL SCORE · <rule-set label>`, unrelated to `score.title`).
- Automatic key or composer detection from MIDI metadata.
- Changes to `RenderedGeometry` — title is a render-time concern, not a geometry concern.

## Proposed file changes

```text
src/renderers/svg/svgBuilder.ts   — accept title in SvgOptions; render title bar (top-left)
src/renderers/canvas/canvasRenderer.ts — accept title in canvas render options; render overlay (top-left)
src/ui/app.ts                     — exportTitle state; pass to all render calls; enumerate call sites
index.html                        — add title text input in the export control strip
src/ui/styles/main.css            — minimal styling for the export title input
src/cli/renderMidi.ts             — add --title and --include-plotter-title CLI options; include
                                    resolved title in manifest under output.title
tests/svg.test.ts                 — test buildTitleSvg directly (present/absent/truncated/plotter
                                    with/without --include-plotter-title)
```

Note: No canvas test file is created. `CanvasRenderer` requires a real `HTMLCanvasElement`
and the repo has no DOM environment (`jsdom`/`happy-dom` not in devDeps). Test the
title-drawing logic at the SVG layer — `buildTitleSvg` is exported and testable as a pure
function. Canvas rendering is verified manually.

## Approach

### Title propagation

`score.title` is read-only domain data. The UI and CLI hold a mutable local override
(`exportTitle`) initialized from `score.title`. That override is passed directly to
`buildSvg` and `canvasRenderer.render` via options — never into `RenderedGeometry`. The
mapper produces identical geometry regardless of title.

When the user loads a new MIDI file, `exportTitle` is reset to the new `score.title`
(simpler, matches "default = resolved title" mental model).

**Key constraint**: the live canvas preview renders with the same title as exports, so the
user sees exactly what they will get. Both `render()` (live preview) and `downloadPng()`
share the same render call shape.

### Render call sites

All three must receive `exportTitle`:
1. `render()` line 131 — live preview, called on every config/control change.
2. `downloadPng()` line 137 — export PNG frame; re-renders then snapshots.
3. `downloadSvg()` line 136 — SVG export; passes title to `buildSvg` options.

### SVG

The title bar sits at the **top-left corner**, using a small semi-transparent dark pill
background with light text. When `--plotter` is set, the title bar is **omitted by default**
(since physical plots often have a pre-printed or handwritten title field); `--include-plotter-title`
overrides this. Legend remains at **bottom-right** (svgBuilder.ts:84) and does not conflict
with top-left title.

Title is rendered as a **semi-transparent overlay** — no margin reservation, no geometry
shift. The pill floats above the artwork. This keeps `RenderedGeometry` unchanged and avoids
re-fitting.

Title is truncated at **40 characters** (`title.length > 40 ? title.slice(0, 37) + '…' : title`).

### Canvas

Title is rendered as a small, high-contrast label at the **top-left**, above and away from
the canvas legend which is at the **bottom-left** (`canvasRenderer.ts:106`). The title
does not overlap the legend. PNG `downloadPng()` captures the labeled canvas frame directly;
the legend is rendered alongside the title in the same capture.

### CLI

`--title "My Custom Title"` sets the export title for this run only. `--include-plotter-title`
forces the title into plotter output. When `--manifest` is provided, the resolved title is
written into the manifest JSON under `output.title` alongside the existing `score.title`.
When `--title` is not set, `output.title === score.title` (they are identical). When set,
`output.title` is the override and `score.title` is the original — both are recorded for
reproducibility.

### Filename vs. visible title

`filename()` (app.ts:141) derives the export filename from `score.title`, not `exportTitle`.
The visible on-canvas title and the download filename may therefore diverge when the user
edits the export title. This is intentional: the filename reflects the source material's
identity, while the visible title reflects the user's labeling intent for the output.

## Phases & checklist

### Phase 1: SVG renderer

- [ ] Add `title?: string` to `SvgOptions`.
- [ ] Add `--include-plotter-title` as a flag (in `flags` path, not `valueOptions`) and to `CliOptions`; expose in CLI help.
- [ ] Export `buildTitleSvg(width: number, title: string, isPlotter: boolean, includePlotterTitle: boolean): string` helper:
  top-left pill in standard mode; omitted in plotter mode unless `includePlotterTitle` is true.
- [ ] Call it in `buildSvg` after background, before voice paths, when `options.title` is set.
  No margin reservation — render as floating overlay.
- [ ] Truncate title at 40 chars in the helper.
- [ ] Call `escapeText` on title before embedding in SVG `<text>` to prevent XML injection.

### Phase 2: Canvas renderer

- [ ] Add `title?: string` to `CanvasRenderOptions`.
- [ ] Add `drawCanvasTitle` method: renders title at top-left, 16px font, semi-transparent
  dark pill background, truncated at 40 chars. No margin reservation — overlay.
- [ ] Call `drawCanvasTitle` in `render()` **after all artwork** (after `drawCanvasLegend`, at the end of render),
  not before bands/paths. This ensures the title overlay floats above the artwork.
- [ ] Ensure PNG capture via `downloadPng()` uses the same titled frame as the live preview
  by passing `title: this.exportTitle` in the render options.

### Phase 3: UI

- [ ] Add a text input in the export control strip (`export-group`) in `index.html`,
  pre-filled with `score.title`. Use a layout wrapper (`div.export-title-field`) containing
  label+input above the existing `button-grid` to avoid disrupting the button row on narrow sidebars.
- [ ] In `app.ts`, track `exportTitle` (initialized from `score.title`); update on input change.
- [ ] On new file load (`setScore`), reset `exportTitle` to `score.title`.
- [ ] Enumerate all three render call sites and pass `exportTitle` to each:
  - `render()` — live preview.
  - `downloadPng()` — export PNG frame.
  - `downloadSvg()` — SVG export via `buildSvg` options.
- [ ] Keep `<h2 id="score-title">` in the DOM as the accessible name; the on-canvas
  overlay is purely decorative.
- [ ] Add `role="img"` and `aria-label="[title]"` to the canvas element (`index.html:76`),
  updated when `exportTitle` changes, for screen reader accessibility.
- [ ] Add CSS in `src/ui/styles/main.css` for the title input (compact, inline with buttons).

### Phase 4: CLI

- [ ] Add `--title` to `valueOptions` in `parseCli` and to `CliOptions`.
- [ ] Add `--include-plotter-title` as a flag.
- [ ] Update HELP text to document `--title` and `--include-plotter-title` options.
- [ ] Resolve title: `options.title ?? score.title`.
- [ ] Pass resolved title to `buildSvg` options; pass `includePlotterTitle` to `buildTitleSvg`.
- [ ] Include `output.title` in the manifest JSON (Phase 4 line 115).
- [ ] When `isPlotter` is true and `includePlotterTitle` is set, render title as stroke-only
  (no fill on the pill background) to maintain plotter mode's stroke-only aesthetic.

### Phase 5: Verification

- [ ] Unit test `buildTitleSvg` directly (exported from svgBuilder.ts):
  - title absent → no title element.
  - title present → SVG contains expected title pill at top-left.
  - truncation at 40 chars (including boundary case: exactly 40 chars).
  - XML special characters (`&`, `<`, `>`) are properly escaped via `escapeText`.
  - empty string → no title element (same as absent).
  - whitespace-only string → no title element (trimmed/empty check).
  - plotter mode without flag → title omitted.
  - plotter mode with `--include-plotter-title` → title present (stroke-only styling).
- [ ] Unit test `filename()` derivation logic indirectly through SVG pathway:
  - When `exportTitle` differs from `score.title`, verify filename uses `score.title`.
  - When `exportTitle` equals `score.title`, verify filename matches.
- [ ] Manual verification:
  - Canvas title draws last (overlay above all artwork) during playback animation.
  - PNG export includes title by checking `downloadPng()` passes title in render options.
  - Accessibility: verify canvas element has `role="img"` and `aria-label` updated on title change.
- [ ] Run `npm run validate`.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Title pill overlaps artwork in dark regions | medium | low | Semi-transparent bg; high-contrast text; no margin reservation. |
| `exportTitle` stale after file reload | medium | medium | Reset `exportTitle` to `score.title` on each new file load. |
| Canvas testing blocked by missing DOM env | high | medium | Test at SVG layer only; extract pure helper; manual canvas verification. |
| Filename vs. visible title mismatch | medium | low | Intentional — document that filename reflects source, title reflects output label. |

## Optional polish (deferred to follow-up)

The following improvements from the assessment can be folded in during implementation or deferred:

1. **Debounce title input → render**: Debounce the render call by ~150ms on input events to avoid re-running the mapper on every keystroke for large MIDI files.
2. **Character count display**: Show a live "N/40" counter next to the input for user feedback.
3. **Consistent pill styling**: Ensure SVG and canvas title pills use identical visual appearance (padding, font-size, border-radius, opacity) for WYSIWYG consistency.
4. **CLI filename behavior**: Consider having `--title` affect the default output filename when `--output` is not specified (optional).
5. **Manifest completeness**: Record `output.includePlotterTitle: true` in the manifest when the flag is set for full reproducibility.