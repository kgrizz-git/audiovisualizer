# NEEDS REVIEW

# Plan: Export Title — MIDI Filename Default with Manual Override

Last reviewed: draft
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

1. The `Score` type already carries a `title` field populated from the MIDI filename in
   `parseMidiData`.
2. `RenderedGeometry` is extended with an optional `title?: string` field.
3. The SVG export renders a compact title bar above the artwork when a title is set.
4. The Canvas preview renders the title as an overlay on every frame.
5. The browser UI exposes a text input pre-filled with the current score title; editing it
   before export changes the title in the output.
6. The CLI accepts `--title` to override the filename-derived default.

## Out of scope

- Persisting title preference across sessions.
- Title embedded in the plotter legend text — legend text is rule-set documentation.
- Automatic key or composer detection from MIDI metadata.

## Proposed file changes

```text
src/core/types.ts                 — add title?: string to RenderedGeometry
src/renderers/svg/svgBuilder.ts   — accept title in SvgOptions; render title bar
src/renderers/canvas/...          — pass title to canvas renderer; render overlay
src/ui/app.ts                     — add title input; thread through export calls
src/cli/renderMidi.ts             — add --title CLI option
src/core/mapper/scoreMapper.ts    — pass score.title into RenderedGeometry
tests/svg.test.ts                 — test title rendering when set and omitted
```

## Approach

### RenderedGeometry

`title` is optional so existing callers that don't set it produce identical output. The
mapper populates it from `score.title`; UI and CLI callers can override before rendering.

### SVG

The title bar is a modest overlay at the top of the canvas, outside art geometry. In
standard SVG it is a semi-transparent pill above the artwork; in plotter mode it is
stroke-only text centered at the top. The legend (if present) remains bottom-right.

### Canvas

Title is rendered as a small, high-contrast label at the top-left so it does not obscure
the artwork. PNG capture uses the same labeled frame.

### CLI

`--title "My Custom Title"` overrides `score.title` for this export without modifying the
source file or score object.

## Phases & checklist

### Phase 1: Domain and mapper

- [ ] Add `title?: string` to `RenderedGeometry` in `src/core/types.ts`.
- [ ] Thread `score.title` through `mapScoreToGeometry` into `RenderedGeometry`.

### Phase 2: SVG renderer

- [ ] Add `title?: string` to `SvgOptions`.
- [ ] Add a `buildTitleSvg` helper that renders a title bar (standard and plotter variants).
- [ ] Call it in `buildSvg` when `options.title` is set.

### Phase 3: Canvas renderer

- [ ] Add `title?: string` to canvas render options.
- [ ] Render title overlay in `CanvasRenderer.render`.

### Phase 4: UI

- [ ] Add a text input (or contenteditable label) pre-filled with `score.title` in the
  export control strip.
- [ ] On export, use the current value of this input as the title regardless of
  `score.title`.

### Phase 5: CLI

- [ ] Add `--title` to `parseCli` and `CliOptions`.
- [ ] Pass `--title` value to `buildSvg` options.

### Phase 6: Verification

- [ ] Unit test title in SVG output (present and absent cases).
- [ ] Run `npm run validate`.

## Open questions

- Should the title bar be omitted in plotter mode by default, since plotter paper may
  already have a handwritten or pre-printed title area? Owner: user preference toggle.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Long titles overflow the title bar | low | low | Truncate with ellipsis at a reasonable character limit; show full title on hover in SVG. |
| Canvas overlay competes with artwork | low | low | Use a small font and corner placement away from dense note regions. |