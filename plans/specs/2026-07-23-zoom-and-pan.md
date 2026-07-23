# Design Spec: Interactive Zoom & Pan with Dynamic Auto-Zoom

Date: 2026-07-23
Status: Approved (Final Production Revision)

## Overview

This specification defines interactive zoom and pan controls for the AudioVisualizer canvas preview and export renderers, along with dynamic playback auto-zoom (active note region tracking).

## Requirements & Goals

1. **Interactive Viewport Control**: Allow users to zoom in/out and pan across the visual score preview using mouse wheel, click-and-drag, touch pinch/pan gestures, UI HUD buttons, and sidebar sliders.
2. **Preserved Export Framing**: Ensure that current zoom level and pan offsets are accurately captured when exporting SVG, PNG, or pen-plotter files, scaling pan offsets proportionally for higher-resolution export sizes (`panX * EXPORT_SIZE / PREVIEW_SIZE`) in `app.ts` so all exports (PNG, SVG, Plotter) match preview framing cleanly.
3. **Dynamic Playback Auto-Zoom**: Automatically frame and track active note clusters and active time-lines during MIDI preview playback (`tick()` only while playing — scrubbing does not auto-zoom), smoothly re-centering and scaling the view as music progresses, and zooming out gracefully during silence (lerp toward `DEFAULT_VIEWPORT`). Gap segments (`role === 'gap'`) and silent bands (`silent === true`) are excluded from bounds.
4. **Manual Override & Reset**: Seamlessly pause auto-zoom when the user manually interacts with the viewport (including clamped zoom no-ops), providing an intuitive "Reset View" trigger to return to default full-score framing. View resets automatically when loading a new score.

## Data Model & Domain Types

Add `ViewportTransform` and `DEFAULT_VIEWPORT` in `src/core/types.ts`:

```typescript
export interface ViewportTransform {
  /** Zoom factor: 1.0 represents standard full-bounds fit; range [0.25, 10.0] */
  zoom: number;
  /** Horizontal pan offset in viewport pixels */
  panX: number;
  /** Vertical pan offset in viewport pixels */
  panY: number;
  /** Whether auto-tracking active notes during playback is enabled */
  autoZoom: boolean;
}

export const DEFAULT_VIEWPORT: Readonly<ViewportTransform> = Object.freeze({
  zoom: 1,
  panX: 0,
  panY: 0,
  autoZoom: true,
});

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(10.0, Math.max(0.25, zoom));
}
```

## Architecture & Components

### 1. Viewport & Gesture Controller (`src/core/layout/viewportController.ts`)

- **Pure Helpers & Stateful Controller**:
  - `calculateActiveNotesBoundingBox`: Pure function querying active voice segments (excluding `role === 'gap'`), active circles, and — when no voice geometry is active — non-silent band extents (`silent === false`) across `RenderedGeometry` matching active onset/duration windows.
  - `calculateAutoZoomTransform`: Pure function computing target center and lerped scale (`AUTO_ZOOM_LERP = 0.15`). When no notes/bands are active during playback, lerps gracefully toward `DEFAULT_VIEWPORT`.
  - `ViewportController`: Class managing `ViewportTransform` state.
- **Gesture Handling** (implemented in `src/ui/viewportGestures.ts`):
  - `Wheel`: Zoom in/out anchored at mouse cursor with `{ passive: false }` + `event.preventDefault()`, factor `Math.exp(-deltaY * 0.0015)`.
  - `Drag` / `Touch Pan`: Update $(panX, panY)$ from CSS deltas scaled into logical geometry space (`PREVIEW_SIZE / rect.width`), using `canvas.setPointerCapture(event.pointerId)`.
  - `Pinch`: Multi-pointer map → centroid + distance ratio → `zoomAt(initialZoom * ratio, centerX, centerY, PREVIEW_SIZE, PREVIEW_SIZE)`.
- **State Transitions**:
  - Any manual user pan or zoom gesture sets `autoZoom = false` (including when zoom is already at clamp).
  - Clicking "Reset View", pressing `R`/`0`, or loading a new score (`setScore`) restores `DEFAULT_VIEWPORT` and re-enables `autoZoom = true`.

### 2. Canvas Preview Renderer (`src/renderers/canvas/canvasRenderer.ts`)

- Wraps score geometry rendering (`geometry.bands` and `geometry.voicePaths`) within matrix transformations:
  ```typescript
  ctx.save();
  ctx.translate(canvasWidth / 2 + panX, canvasHeight / 2 + panY);
  ctx.scale(zoom, zoom);
  ctx.translate(-canvasWidth / 2, -canvasHeight / 2);
  // Render voice paths and time-band geometries
  ctx.restore();
  ```
- Renders canvas background fill (`fillRect`) and radial atmosphere (`drawAtmosphere`) outside matrix transformation.
- Renders title, time display, and legend in fixed window coordinates (un-transformed screen space) for legibility.

### 3. SVG & Plotter Builder (`src/renderers/svg/svgBuilder.ts`)

- Accepts `options.viewport?: ViewportTransform`.
- Wraps all score geometry (both `voicePaths` and `bands`) in an outer `<g transform="...">` container group, keeping title/legend outside.
- Rendered SVG and pen-plotter files receive pre-scaled viewport transform from `app.ts` matching preview framing.

### 4. UI Layer, Gestures & HUD (`src/ui/app.ts`, `src/ui/viewportGestures.ts`, `index.html`, `src/ui/styles/main.css`)

- **Canvas Overlay HUD (`.canvas-wrapper`)**:
  - Positioned bottom-left inside `.canvas-wrapper` (`z-index: 5`, `pointer-events: auto`) so it does not cover `.stage-corner`.
  - Controls: `[+]` / `[-]` / `[Reset]` / `[Auto]` (plain text, `type="button"`).
- **Side Panel Section ("05 Viewport & Framing")** (after Export `04`):
  - Zoom slider (25% to 1000%, `max="10"`), Auto-Zoom checkbox, Reset framing button.
  - `ViewportController` is source of truth; `updateViewportUi()` projects zoom % and auto-zoom checkbox state to HUD + sidebar each `render()`.
- **Viewport Gestures Helper (`src/ui/viewportGestures.ts`)**:
  - Dedicated event listener manager mapping DOM pointer, wheel, and multi-touch events to `ViewportController`.
  - Maps CSS pointer coordinates to logical geometry space (`PREVIEW_SIZE = 900`) using `(clientX - rect.left) * (PREVIEW_SIZE / rect.width)` — never `canvas.width` (DPR buffer).
- **Live Preview, Playback Auto-Zoom & Export Scaling in `app.ts`**:
  - Named constants `PREVIEW_SIZE = 900`, `EXPORT_SIZE = 1200`.
  - Live preview `render()` passes `viewport: this.viewportController.getViewport()`.
  - `tick()` calls `stepAutoZoom(geometry, currentTime, PREVIEW_SIZE, PREVIEW_SIZE)` then `render()`; scrubber does not auto-zoom.
  - Exports scale **pan only** (`panX * EXPORT_SIZE / PREVIEW_SIZE`); zoom is unchanged because geometry is regenerated at export size.
  - CLI render path is out of scope (full-score identity framing).
- **Gesture & Shortcut Protection**:
  - `touch-action: none;` on `#visualizer-canvas`; wheel listener uses `{ passive: false }` + `preventDefault()`.
  - Shield keyboard shortcuts (`+`, `-`, `R`/`0`, `A`) when focus is in form inputs or `contentEditable`.

## Testing & Verification

1. **Unit Tests (`tests/viewportController.test.ts`)**:
   - Verify wheel zoom math keeps cursor location anchored (`zoomAt` anchor preservation test).
   - Verify drag panning updates panX/panY correctly.
   - Verify active note bounding box calculation from `RenderedGeometry` excluding gap segments.
   - Verify `stepAutoZoom` (silence fallback lerp to default, active note lerping, no-op when autoZoom=false).
   - Verify `clampZoom` NaN/Infinity fallback guard.
   - Verify manual gesture sets `autoZoom = false` and reset restores default transform.
2. **Renderer Tests (`tests/viewportRenderers.test.ts`)**:
   - Verify SVG output includes transform tags matching `/translate\(\s*\d+(\.\d+)?\s+\d+(\.\d+)?\)\s*scale\(2\)/`.
   - Verify `geometry.bands` are inside the viewport transform group; title/legend remain outside.
3. **Local Validation**:
   - Run `npm run validate` to pass type-checking, tests, and production build.
