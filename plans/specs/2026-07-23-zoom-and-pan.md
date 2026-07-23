# Design Spec: Interactive Zoom & Pan with Dynamic Auto-Zoom

Date: 2026-07-23
Status: Approved (Revised from Architecture Assessment)

## Overview

This specification defines interactive zoom and pan controls for the AudioVisualizer canvas preview and export renderers, along with dynamic playback auto-zoom (active note region tracking).

## Requirements & Goals

1. **Interactive Viewport Control**: Allow users to zoom in/out and pan across the visual score preview using mouse wheel, click-and-drag, touch pinch/pan gestures, UI buttons, and sidebar sliders.
2. **Preserved Export Framing**: Ensure that current zoom level and pan offsets are accurately captured when exporting SVG, PNG, or pen-plotter files, scaling pan offsets proportionally for higher-resolution export sizes (e.g. 1200px export vs 900px preview) without hardcoding UI magic numbers into core renderers.
3. **Dynamic Playback Auto-Zoom**: Automatically frame and track active note clusters during MIDI preview playback, smoothly re-centering and scaling the view as music progresses.
4. **Manual Override & Reset**: Seamlessly pause auto-zoom when the user manually interacts with the viewport, providing an intuitive "Reset View" trigger to return to default full-score framing.

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
```

## Architecture & Components

### 1. Viewport & Gesture Controller (`src/core/layout/viewportController.ts`)

- **Gesture Handling**:
  - `Wheel`: Zoom in/out anchored at mouse cursor coordinate $(x, y)$.
  - `Drag` / `Touch Pan`: Update $(panX, panY)$ based on movement delta $(\Delta x, \Delta y)$.
  - `Pinch`: Multi-touch distance calculation on touch DOM events, calculating target ratio and center coordinate and delegating to `zoomAt(newZoom, centerX, centerY, width, height)`.
- **Auto-Zoom Calculation**:
  - Consumes `RenderedGeometry` from `src/core/types.ts`.
  - Computes active note bounding box $(minX, minY, maxX, maxY)$ at `currentTime` by querying active segments (`start`/`end` coordinates) and circles (`center`/`radius`) across `geometry.voicePaths` matching active `note.onset` and `note.duration`.
  - Determines target center and target scale factor to maintain comfortable padding around active notes.
  - Applies linear interpolation (lerp) across animation frames for smooth transition without visual jitter.
  - When no notes are active (silence / rests), maintains previous transform smoothly.
- **State Transitions**:
  - Any manual user pan or zoom gesture sets `autoZoom = false`.
  - Clicking "Reset View" or pressing `R` restores `DEFAULT_VIEWPORT` and re-enables `autoZoom = true`.

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

- Accepts `options.viewport?: ViewportTransform` and `options.previewWidth?: number` (defaults to 900).
- Applies viewport transformation to SVG export output:
  - Wraps score path elements in `<g transform="translate(...) scale(...)">`.
  - Scales `panX` and `panY` proportionally (`panX * geometry.width / previewWidth`) so high-res exports match preview framing cleanly without tight coupling.
  - Ensures exported SVG, PNG, and pen-plotter files match the exact framing viewed in the preview.

### 4. UI Layer & HUD Integration (`src/ui/app.ts`, `index.html`, `styles.css`)

- **Canvas Overlay HUD**:
  - Glassmorphic overlay positioned on top-right of canvas container.
  - Controls: `[+]` (Zoom in), `[-]` (Zoom out), `[⟲]` (Reset view), `[🎯 Auto]` (Toggle auto-zoom state).
- **Side Panel Section ("05 Viewport & Framing")**:
  - Zoom slider control (25% to 1000%) synchronized with HUD buttons and auto-zoom updates.
  - Pan reset button and Auto-Zoom toggle checkbox.
- **Export Wiring**:
  - `downloadPng()` and `downloadSvg()` explicitly pass current `viewportController.getViewport()` to `this.canvasRenderer.render(geometry, options)` and `buildSvg(geometry, options)`.
- **Gesture & Shortcut Protection**:
  - Set `touch-action: none;` on `#visualizer-canvas` CSS to prevent mobile page scrolling during canvas gestures.
  - Shield keyboard shortcuts (`+`, `-`, `R`, `A`) when typing in form inputs (`HTMLInputElement` / `HTMLSelectElement`).

## Testing & Verification

1. **Unit Tests (`tests/viewportController.test.ts`)**:
   - Verify wheel zoom math keeps cursor location anchored.
   - Verify drag panning updates panX/panY correctly.
   - Verify active note bounding box calculation from `RenderedGeometry` using proper `GeometryVoicePath` shapes (`voice`, `voiceName`, `segments`, `circles`).
   - Verify auto-zoom lerp bounds and silence fallback.
   - Verify manual gesture sets `autoZoom = false` and reset restores default transform.
2. **Renderer Tests (`tests/viewportRenderers.test.ts`)**:
   - Verify Canvas & SVG output includes transform tags when viewport zoom/pan are non-default.
   - Verify SVG builder respects proportional pan scaling given `previewWidth`.
3. **Local Validation**:
   - Run `npm run validate` to pass type-checking, tests, and production build.
