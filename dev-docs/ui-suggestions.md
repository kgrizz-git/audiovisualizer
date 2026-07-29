# UI Appearance and Usability Suggestions

Last updated: 2026-07-28

## Current state summary

The app uses a two-column grid: a 390px sidebar with numbered control groups and a
main viewport with canvas, playback bar, and HUD. Controls are all visible at once in
a scrollable sidebar. The canvas is sized to `min(900px, calc(100vh - 210px))` with
a fixed aspect ratio.

## Priority suggestions

### 1. Collapsible accordion control groups

**Problem**: All five numbered sections (Choose a score, Compose the rule set, Refine,
Export, Viewport & Framing) are always visible, creating a long scroll that buries
controls. New users may not know what to focus on; experienced users often only need
one section at a time.

**Proposal**: Convert each `.control-group` into an accordion panel.

- Section headers (`<h2>`) become clickable disclosure triggers using native
  `<details>`/`<summary>` elements (no JS required for open/close, just CSS
  styling). Alternatively, use `aria-expanded` buttons with a lightweight JS toggle
  for more animation control.
- Default state: section 01 (Choose a score) and section 02 (Compose the rule set)
  open; sections 03–05 collapsed.
- Collapsed sections show only the header row with a chevron indicator. On hover or
  focus, a subtle preview (e.g., the current variation name, the export title) could
  appear inline so users can scan without expanding.
- Add a "Collapse all" / "Expand all" action at the top of the sidebar for power
  users.

**CSS sketch**:

```css
.control-group { margin: 14px 0; }
.control-group summary,
.control-group .group-header {
  cursor: pointer;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 12px 16px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: linear-gradient(140deg, rgba(255,255,255,.045), rgba(255,255,255,.015));
  transition: border-color .15s;
}
.control-group summary:hover { border-color: var(--mint); }
.control-group[open] summary { border-radius: 14px 14px 0 0; }
.control-group .group-body { padding: 16px; }
.control-group summary::after {
  content: '▸';
  margin-left: auto;
  transition: transform .2s;
}
.control-group[open] summary::after { transform: rotate(90deg); }
```

**Trade-offs**: Native `<details>` is accessible by default and works without JS.
However, it does not support smooth height animation. A JS-driven accordion with
`max-height` transition or `interpolate-size: allow-keywords` would give smoother
open/close but adds maintenance cost.

---

### 2. Show/hide legend toggle

**Problem**: The legend is rendered directly onto the canvas (via `showLegend: true`
in `CanvasRenderer.render`). Users cannot hide it during preview to see the raw
score, and the legend always occupies canvas real estate.

**Proposal**: Add a user-facing toggle to show/hide the legend on the live preview.

- Add a checkbox toggle in section 05 (Viewport & Framing) or as a HUD overlay
  button (next to the existing zoom/auto controls).
- The toggle controls the `showLegend` flag passed to `canvasRenderer.render()`.
  Default: on (preserving current behavior).
- The legend remains always included in SVG/PNG exports regardless of preview
  toggle, since the export is a standalone artifact. Plotter SVG already omits it.
- Consider a keyboard shortcut (e.g., `L`) to toggle the legend.

**Implementation**: Pass a new `legendVisible: boolean` property on the app instance,
wire it to the toggle, and feed it into `render()` instead of the hardcoded `true`.

```typescript
// In render():
this.canvasRenderer.render(geometry, {
  showLegend: this.legendVisible,
  // ...
});
```

**HUD button sketch** (adds to existing `.viewport-hud`):

```html
<button type="button" id="hud-legend-toggle" class="hud-btn" title="Toggle Legend (L)">
  ☰
</button>
```

---

### 3. Larger main plot area

**Problem**: The canvas is currently `min(900px, calc(100vh - 210px))` and the sidebar
is a fixed 390px. On large monitors the canvas does not grow beyond 900px; on shorter
screens it shrinks quickly. The 390px sidebar is wide relative to the content it
holds.

**Proposal**: Make the canvas fill more available space.

#### Option A: Narrower sidebar (quick win)

Reduce the sidebar from 390px to ~320px. The existing controls fit comfortably in
320px — most selects and range inputs are flexible. This gives the canvas an extra
70px on every screen.

```css
#app-container { grid-template-columns: 320px minmax(0, 1fr); }
```

#### Option B: Collapsible sidebar (medium effort)

Add a collapse/expand toggle to the sidebar. When collapsed, the sidebar shows a
narrow strip (48–64px) with icon-only buttons for each section. Clicking an icon
expands that section in a slide-out overlay without pushing the canvas.

```css
#app-container.is-sidebar-collapsed { grid-template-columns: 56px 1fr; }
#app-container.is-sidebar-collapsed .sidebar > *:not(.sidebar-nav) { display: none; }
```

#### Option C: Full-viewport canvas with floating panel (larger effort)

The sidebar becomes a floating panel (positioned left, semi-transparent background,
`backdrop-filter: blur`) that can be toggled or dragged. The canvas fills the entire
viewport. This matches the aesthetic of tools like Figma or Darktable.

```css
#app-container { grid-template-columns: 1fr; }
.sidebar {
  position: fixed; top: 0; left: 0; bottom: 0;
  width: 380px; z-index: 10;
  transform: translateX(0);
  transition: transform .25s ease;
}
#app-container.is-sidebar-collapsed .sidebar { transform: translateX(-100%); }
.viewport-container { padding-left: 0; }
```

**Recommended path**: Start with Option A (narrow sidebar) as a one-line CSS change,
then evaluate Option B if users want more canvas space. Option C is a larger
restructure and should be planned separately.

---

### 4. Tabbed control layout (alternative to accordion)

Instead of a vertical accordion, group controls into horizontal tabs at the top or
side of the sidebar:

- **Tabs**: Score | Rules | Refine | Audio | Export | Viewport
- The active tab's controls fill the sidebar; inactive tabs are a single clickable
  row.
- This eliminates scrolling entirely and keeps each view focused.

**Implementation**: A `<div role="tablist">` with `<button role="tab">` elements,
and corresponding `<div role="tabpanel">` sections. Only the active tab panel is
visible. No framework needed; plain CSS/JS.

```css
.tab-panel { display: none; }
.tab-panel.is-active { display: block; }
```

**Clarification on tabs**: The "Tabbed control layout" above refers to control-group tabs in the sidebar (Score | Rules | Refine | Audio | Export | Viewport), not display-level split-screen or A/B compare. Accordion is preferred over tabs because it keeps all section headers visible at once (better discoverability) and avoids the extra ~40px tab bar overhead; tabs should only be considered if scrolling remains the dominant pain after accordion is implemented. Accordion keeps all headers visible at once, which is better for discoverability. Tabs are better when each group has many controls and scrolling is the main pain point.

---

### 5. Additional usability improvements

#### 5a. Keyboard shortcut overlay

Add a `?` shortcut that opens a modal listing all keyboard shortcuts (+, -, R, A, L,
Space). Currently only four shortcuts exist and are undocumented in the UI.

#### 5b. Control group live preview badges

Show the current value of key settings as a badge on collapsed section headers:

- Section 02: show current variation name (e.g., "lines", "3D polar fan")
- Section 03: show active voice count
- Section 04: show export format last used

This lets users scan settings without expanding each section.

#### 5c. Responsive sidebar breakpoint

The current `@media (max-width: 900px)` stacks sidebar above canvas. Consider a
dedicated tablet breakpoint (768–1024px) where the sidebar collapses to icons or a
hamburger, rather than stacking vertically and pushing the canvas below the fold.

#### 5d. Canvas aspect ratio toggle

Allow switching between square (1:1) and common print ratios (4:3, 3:2, 16:9) for
the preview canvas, so users can compose for their target output format before
exporting.

#### 5e. Persistent state

Save the last-used variation, MIDI file, and control values to `localStorage` so the
app restores the user's session on reload. Currently every reload picks a random
variation and demo.

---

### 6. Additional usability ideas (not split-screen)

These complement the priority list without restructuring the display. The split-screen/A-B compare was considered but excluded — it competes with the deterministic art goal (one config = one artifact) and adds significant layout complexity.

#### 6a. Preset bookmark chips (horizontal strip)

A narrow horizontal strip above the sidebar showing 5–6 saved configurations as small color thumbnail chips (e.g., the current variation's dominant hue + label). Click to instantly apply the full rule set. Faster than navigating sections for repeat users; acts as visual memory of recent configurations. Effort: low (reuse existing `currentConfig` and `updateCanvasMode`).

#### 6b. Focus / Presentation mode (`F` key)

Hide the sidebar entirely; keep only the canvas + minimal floating playback HUD. Useful for recording the preview, presenting the art, or composing without control clutter. A floating toggle button (or keyboard shortcut) restores the sidebar. This is different from the collapsible sidebar (3B) — it is a temporary presentation state, not a persistent layout change. Effort: low (CSS `display:none` + `F` listener).

#### 6c. Voice-aware sidebar pulse

During playback, subtly tint or highlight the active voice's control section in the sidebar. For example, a soft mint glow on the section 02 header when that voice is audible. Connects abstract controls back to the sounding event without requiring the user to read the audio row. Effort: very low (listen to playback tick, add/remove a CSS class).

#### 6d. Mini navigation strip

A thin horizontal timeline bar at the bottom of the viewport (above the playback bar) showing the full piece length with: a playhead indicator, note-density heatmap (darker = more notes/velocity), and small color swatches per voice. More useful for long MIDI scores than just the progress scrubber; helps users locate dense passages or rests quickly. Effort: medium (new canvas overlay or DOM strip).

---

### 7. Appearance polish and modernization

The current aesthetic (deep navy `#070d19`, mint `#54ebc6`, violet `#9291ff`, coral `#ff9e79`, Manrope + DM Mono) is coherent but can feel slightly static. Suggestions that do not change the domain logic but modernize the surface:

#### 7a. Colors and gradients

- **Reduce gradient noise**: The sidebar uses a 180° linear gradient; switching to a very subtle radial gradient centered near the top-left (matching the viewport background's radial spots at 78% 10% and 28% 90%) would make the two columns feel like one continuous space rather than two flat panels.
- **Glass refinement**: The `.viewport-hud` and playback bar already use `backdrop-filter: blur(8px)` and translucent backgrounds (`rgba(13, 22, 40, 0.82)`). Modernizing to `backdrop-filter: blur(12px) saturate(140%)` and a slightly more transparent background (`rgba(13, 22, 40, 0.65)`) gives a cleaner glass effect without losing readability.
- **Accent balance**: Mint is used heavily for interactive states (hover borders, active buttons, range accents). Consider reserving mint strictly for interactive focus and using violet for selection/highlight states, coral for warnings/export actions. This creates a three-color functional palette instead of mint dominating everything.

#### 7b. Typography and spacing

- **Font sizing**: Section headers (`h2`) at `11px` uppercase with `.1em` letter-spacing are very tight. Increasing to `12px` with `.08em` tracking and adding `line-height: 1.35` improves legibility without increasing vertical footprint.
- **Mono consistency**: `DM Mono` is used well for data values (duration, BPM, coordinates) and badges. Expanding its use to the playback time display (`output`) and the status line (`.status`) would strengthen the "studio instrument" identity.
- **Padding rhythm**: The `.control-group` uses `margin: 14px 0` and `padding: 16px`. Tightening to `margin: 10px 0` and `padding: 14px` (with a slightly larger `border-radius: 18px` instead of `16px`) creates a softer, more modern card shape and recovers ~8px per group — valuable once accordion collapses them.

#### 7c. Controls and interaction surface

- **Segmented control polish**: The `.segmented-control` (used for mode selection) uses a flat `1px solid var(--line)` border. Adding a very subtle inner shadow or a 2px inner border on the active button (`box-shadow: inset 0 0 0 1.5px var(--mint)`) makes the active state feel more tactile.
- **Range sliders**: The current `accent-color: var(--mint)` is good. Adding a custom CSS track (`::-webkit-slider-runnable-track`) with a dark fill and mint progress fill (instead of relying solely on browser default) ensures consistent appearance across browsers.
- **Button micro-interaction**: `.btn:hover` uses `transform: translateY(-1px)`. Adding a very short `transition: transform .1s ease, border-color .15s` and a subtle `box-shadow` on hover (`box-shadow: 0 4px 12px rgba(84,235,198,.15)`) gives buttons more presence.
- **Dropzone feedback**: The `.file-dropzone` change is functional (`border-color: coral`, `background: rgba(255,158,121,.09)`). Adding a subtle scale (`transform: scale(1.01)`) on drag enhances the tactile feel.

#### 7d. Overall layout and viewport feel

- **Canvas wrapper shadow**: The `.canvas-wrapper` shadow (`box-shadow: 0 36px 85px rgba(0,0,0,.46)`) is strong. Softening slightly (`box-shadow: 0 24px 60px rgba(0,0,0,.35), inset 0 0 0 1px rgba(255,255,255,.04)`) reduces visual weight while preserving depth.
- **Corner label (`.stage-corner`)**: The small `9px` DM Mono label at the top-right of the canvas is a nice detail. Increasing letter-spacing slightly (`.1em` instead of `.09em`) and using `opacity: 0.6` (instead of fixed `rgba(233,238,248,.45)`) makes it more elegant.
- **Brand mark**: The `.brand-mark` gradient (`mint → #65b9ff → violet`) and glow (`box-shadow: 0 0 35px rgba(84,235,198,.22)`) are strong. Maintaining them but ensuring the gradient direction (145°) aligns with the sidebar gradient direction would create visual harmony.

---

## Implementation priority

| # | Suggestion | Effort | Impact |
|---|---|---|---|
| 1 | Accordion control groups | Medium | High — reduces scroll, improves focus |
| 2 | Legend show/hide toggle | Low | Medium — gives users preview control |
| 3A | Narrower sidebar (320px) | Trivial | Medium — instant canvas gain |
| 3B | Collapsible sidebar | Medium | High — maximum canvas on demand |
| 3C | Floating panel | High | High — major layout change |
| 4 | Tabbed layout (alternative to 1) | Medium | High — eliminates scrolling |
| 5a | Keyboard shortcut overlay | Low | Low — nice-to-have discoverability |
| 5b | Section badge previews | Low | Low — subtle UX polish |
| 5c | Responsive tablet breakpoint | Low | Medium — better tablet experience |
| 5d | Canvas aspect ratio toggle | Medium | Low — niche but useful |
| 5e | Persistent state via localStorage | Low | Medium — reduces repeated setup |
| 6a | Preset bookmark chips | Low | Medium — quick config recall |
| 6b | Focus / Presentation mode (`F`) | Low | Low — presentation utility |
| 6c | Voice-aware sidebar pulse | Very low | Low — domain-specific feedback |
| 6d | Mini navigation strip | Medium | Medium — timeline context |
| 7 | Appearance polish (gradients, glass, typography, controls) | Low–Medium | Medium — modernized surface feel |

## Recommended first steps

1. **3A**: Change `grid-template-columns` from `390px` to `320px` — one CSS line.
2. **2**: Add a legend toggle wired to `showLegend` — ~15 lines of JS + 1 HUD button.
3. **1**: Convert control groups to `<details>`/`<summary>` — HTML restructure in
   `index.html` + CSS styling, no JS framework changes.
