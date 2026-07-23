# Design Spec: Interactive Zoom & Pan with Dynamic Auto-Zoom

Date: 2026-07-23
Status: Approved (Revised from Final Architecture Assessment)

## Overview

This specification defines interactive zoom and pan controls for the AudioVisualizer canvas preview and export renderers, along with dynamic playback auto-zoom (active note region tracking).

## Requirements & Goals

1. **Interactive Viewport Control**: Allow users to zoom in/out and pan across the visual score preview using mouse wheel, click-and-drag, touch pinch/pan gestures, UI HUD buttons, and sidebar sliders.
2. **Preserved Export Framing**: Ensure that current zoom level and pan offsets are accurately captured when exporting SVG, PNG, or pen-plotter files, scaling pan offsets proportionally for higher-resolution export sizes (`panX * exportSize / previewSize`) in `app.ts` so all exports (PNG, SVG, Plotter) match preview framing cleanly without renderer coupling.
3. **Dynamic Playback Auto-Zoom**: Automatically frame and track active note clusters during MIDI preview playback, smoothly re-centering and scaling the view as music progresses.
4. **Manual Override & Reset**: Seamlessly pause auto-zoom when the user manually interacts with the viewport, providing an intuitive "Reset View" trigger to return to default full-score framing. View resets automatically when loading a new score.

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
  - `calculateActiveNotesBoundingBox`: Pure function querying active segments and circles across `RenderedGeometry.voicePaths` matching active `note.onset` and `note.duration`. `NoteEvent` type matches `{ id, pitch, onset, duration, velocity, voice, pitchClass }`.
  - `calculateAutoZoomTransform`: Pure function computing target center and lerped scale (`AUTO_ZOOM_LERP = 0.15`).
  - `ViewportController`: Class managing `ViewportTransform` state.
- **Gesture Handling**:
  - `Wheel`: Zoom in/out anchored at mouse cursor coordinate $(x, y)$.
  - `Drag` / `Touch Pan`: Update $(panX, panY)$ based on movement delta $(\Delta x, \Delta y)$ with `canvas.setPointerCapture(event.pointerId)`.
  - `Pinch`: Multi-touch tracking using pointer/touch events calculating centroid and distance ratio, delegating to `zoomAt(newZoom, centerX, centerY, width, height)`.
- **State Transitions**:
  - Any manual user pan or zoom gesture sets `autoZoom = false`.
  - Clicking "Reset View", pressing `R`, or loading a new score (`setScore`) restores `DEFAULT_VIEWPORT` and re-enables `autoZoom = true`.

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
- Wraps all score geometry (both `voicePaths` and `bands`) in `<g transform="translate(...) scale(...)">`.
- Rendered SVG and pen-plotter files receive pre-scaled viewport transform from `app.ts` matching preview framing.

### 4. UI Layer & HUD Integration (`src/ui/app.ts`, `index.html`, `styles.css`)

- **Canvas Overlay HUD**:
  - Glassmorphic overlay positioned on top-right of canvas container.
  - Controls: `[+]` (Zoom in), `[-]` (Zoom out), `[Reset]` (Reset view), `[Auto]` (Toggle auto-zoom state).
- **Side Panel Section ("05 Viewport & Framing")**:
  - Zoom slider control (25% to 1000%, `max="10"`).
  - Auto-Zoom toggle checkbox and Reset framing button.
  - Synchronized bidirectionally with HUD controls and auto-zoom updates.
- **Export Viewport Scaling in `app.ts`**:
  - `downloadPng()` and `downloadSvg()` calculate export scale ratio (`scaleRatio = exportWidth / previewWidth`) and pass scaled viewport `{ ...vp, panX: vp.panX * scaleRatio, panY: vp.panY * scaleRatio }` to `render()` and `buildSvg()`.
- **Gesture & Shortcut Protection**:
  - Set `touch-action: none;` on `#visualizer-canvas` CSS to prevent mobile page scrolling during canvas gestures.
  - Shield keyboard shortcuts (`+`, `-`, `R`, `A`) when typing in form inputs (`HTMLInputElement`, `HTMLTextAreaElement`, `HTMLSelectElement`, or `isContentEditable`).

## Testing & Verification

1. **Unit Tests (`tests/viewportController.test.ts`)**:
   - Verify wheel zoom math keeps cursor location anchored (`zoomAt` anchor preservation test).
   - Verify drag panning updates panX/panY correctly.
   - Verify active note bounding box calculation from `RenderedGeometry` using valid `NoteEvent` literals (`id`, `pitch`, `onset`, `duration`, `velocity`, `voice`, `pitchClass`).
   - Verify `stepAutoZoom` (silence fallback, active note lerping, no-op when autoZoom=false).
   - Verify `clampZoom` NaN/Infinity fallback guard.
   - Verify manual gesture sets `autoZoom = false` and reset restores default transform.
2. **Renderer Tests (`tests/viewportRenderers.test.ts`)**:
   - Verify Canvas & SVG output includes transform tags matching `/translate\(\s*\d+(\.\d+)?\s+\d+(\.\d+)?\)\s*scale\(2\)/`.
   - Verify `geometry.bands` are correctly included within SVG transform group.
3. **Local Validation**:
   - Run `npm run validate` to pass type-checking, tests, and production build.
