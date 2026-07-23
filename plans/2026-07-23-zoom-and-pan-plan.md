# Interactive Zoom & Pan with Dynamic Auto-Zoom Implementation Plan

Status: ready for implementation (revised after final architecture assessment)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement interactive mouse, wheel, touch, and HUD/panel zoom and pan controls for the score canvas preview and vector exports (SVG/PNG/Plotter), with default dynamic auto-zoom that tracks active note regions during playback.

**Architecture:** Add `ViewportTransform` to core domain types with NaN/Infinity clamping bounds. Implement pure math helpers (`calculateActiveNotesBoundingBox`, `calculateAutoZoomTransform`) plus a stateful `ViewportController` class that computes gesture transforms and lerped active-note auto-zoom (`AUTO_ZOOM_LERP = 0.15`) using `RenderedGeometry`. Extend `CanvasRenderer` to wrap score geometry drawing (`bands` and `voicePaths`) within matrix transforms while preserving screen-fixed legend/title layers and background atmosphere. Update `buildSvg` to wrap all score geometry elements in an outer transform container `<g transform="...">`. Centralize export resolution pan scaling in `app.ts` (`panX * EXPORT_SIZE / PREVIEW_SIZE`) so PNG, SVG, and plotter exports match preview framing cleanly. Extract gesture handling into `src/ui/viewportGestures.ts`, position HUD overlay inside `.canvas-wrapper` (`z-index: 5`), synchronize sidebar section 05 controls (`max="10.0"`) with HUD, pass `viewport` to live preview `render()`, reset view on `setScore()`, and shield keyboard shortcuts on `window`.

**Tech Stack:** TypeScript, HTML5 Canvas 2D Context, SVG, Vitest, Vite.

**Spec:** [`plans/specs/2026-07-23-zoom-and-pan.md`](specs/2026-07-23-zoom-and-pan.md)

## Global Constraints

- Keep MIDI parser, score-to-geometry mapper, and layout fitters deterministic and side-effect free.
- Browser MIDI file handling stays local; no telemetry; no remote user data upload.
- SVG, PNG, and pen-plotter exports must match the active preview viewport zoom and pan framing.
- Must pass `npm run validate` (type-checking, Vitest tests, production build).
- Update `ARCHITECTURE.md`, `DESIGN.md`, `CHANGELOG.md` (MINOR), and `dev-docs/TO_DO.md`.

---

### Task 1: Viewport Domain Types & Default Configuration

**Files:**
- Modify: `src/core/types.ts`
- Test: `tests/viewportTypes.test.ts`

**Interfaces:**
- Consumes: Existing score layout types in `src/core/types.ts`
- Produces: `ViewportTransform`, `DEFAULT_VIEWPORT`, `clampZoom` helper

- [ ] **Step 1: Write the failing test**

Create `tests/viewportTypes.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEWPORT, ViewportTransform, clampZoom } from '../src/core/types.js';

describe('Viewport Domain Types', () => {
  it('defines default viewport with zoom 1, pan 0, autoZoom true', () => {
    const vp: ViewportTransform = DEFAULT_VIEWPORT;
    expect(vp.zoom).toBe(1);
    expect(vp.panX).toBe(0);
    expect(vp.panY).toBe(0);
    expect(vp.autoZoom).toBe(true);
  });

  it('clamps zoom within bounds [0.25, 10.0] and guards NaN/Infinity', () => {
    expect(clampZoom(0.1)).toBe(0.25);
    expect(clampZoom(2.5)).toBe(2.5);
    expect(clampZoom(15.0)).toBe(10.0);
    expect(clampZoom(NaN)).toBe(1);
    expect(clampZoom(Infinity)).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/viewportTypes.test.ts`
Expected: FAIL with "clampZoom / DEFAULT_VIEWPORT not defined"

- [ ] **Step 3: Implement minimal domain types in `src/core/types.ts`**

Add to `src/core/types.ts`:
```typescript
export interface ViewportTransform {
  zoom: number;
  panX: number;
  panY: number;
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/viewportTypes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts tests/viewportTypes.test.ts
git commit -m "feat(core): add ViewportTransform domain types and guarded zoom clamping"
```

---

### Task 2: ViewportController & Active Note Auto-Zoom Calculation

**Files:**
- Create: `src/core/layout/viewportController.ts`
- Test: `tests/viewportController.test.ts`

**Interfaces:**
- Consumes: `ViewportTransform`, `DEFAULT_VIEWPORT`, `clampZoom`, `RenderedGeometry` from `src/core/types.ts`
- Produces: `AUTO_ZOOM_LERP`, `calculateActiveNotesBoundingBox`, `calculateAutoZoomTransform`, `ViewportController` class

- [ ] **Step 1: Write failing tests for ViewportController & Auto-Zoom**

Create `tests/viewportController.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import { ViewportController, calculateActiveNotesBoundingBox, calculateAutoZoomTransform, AUTO_ZOOM_LERP } from '../src/core/layout/viewportController.js';
import { RenderedGeometry } from '../src/core/types.js';
import { DEFAULT_CONFIG } from '../src/core/mapper/scoreMapper.js';

describe('ViewportController & Auto-Zoom', () => {
  it('starts with default viewport', () => {
    const controller = new ViewportController();
    expect(controller.getViewport()).toEqual({ zoom: 1, panX: 0, panY: 0, autoZoom: true });
  });

  it('pans by delta and disables autoZoom', () => {
    const controller = new ViewportController();
    controller.panBy(50, -20);
    expect(controller.getViewport()).toEqual({ zoom: 1, panX: 50, panY: -20, autoZoom: false });
  });

  it('zooms anchored at coordinate, preserves world point, and disables autoZoom even if clamped', () => {
    const controller = new ViewportController();
    const w = 800, h = 600, ax = 200, ay = 100;
    const before = controller.getViewport();
    const worldX = (ax - w / 2 - before.panX) / before.zoom;
    const worldY = (ay - h / 2 - before.panY) / before.zoom;

    controller.zoomAt(2.0, ax, ay, w, h);
    const after = controller.getViewport();
    expect(after.zoom).toBe(2.0);
    expect(after.autoZoom).toBe(false);

    const screenX = w / 2 + after.panX + worldX * after.zoom;
    const screenY = h / 2 + after.panY + worldY * after.zoom;
    expect(screenX).toBeCloseTo(ax);
    expect(screenY).toBeCloseTo(ay);

    // Clamped zoom attempt still disables autoZoom
    controller.setAutoZoom(true);
    controller.zoomAt(10.0, ax, ay, w, h);
    expect(controller.getViewport().autoZoom).toBe(false);
  });

  it('resets view to default and re-enables autoZoom', () => {
    const controller = new ViewportController();
    controller.panBy(100, 100);
    controller.resetView();
    expect(controller.getViewport()).toEqual({ zoom: 1, panX: 0, panY: 0, autoZoom: true });
  });

  it('calculates bounding box of active notes from RenderedGeometry excluding gap segments', () => {
    const mockGeometry: RenderedGeometry = {
      width: 800,
      height: 600,
      bands: [],
      config: DEFAULT_CONFIG,
      voicePaths: [
        {
          voice: 0,
          voiceName: 'Voice 0',
          segments: [
            {
              start: { x: 100, y: 150 },
              end: { x: 300, y: 250 },
              color: '#ff0000',
              width: 2,
              opacity: 1,
              note: { id: 'n0', pitch: 60, onset: 0, duration: 5, velocity: 80, voice: 0, pitchClass: 0 }
            },
            {
              start: { x: 500, y: 500 },
              end: { x: 600, y: 600 },
              color: '#000000',
              width: 1,
              opacity: 0,
              role: 'gap',
              note: { id: 'g0', pitch: 60, onset: 0, duration: 5, velocity: 0, voice: 0, pitchClass: 0 }
            }
          ],
          circles: []
        }
      ]
    };
    const bounds = calculateActiveNotesBoundingBox(mockGeometry, 2.5);
    expect(bounds).toEqual({ minX: 100, minY: 150, maxX: 300, maxY: 250 });
  });

  it('calculates active bounds for tonal time-lines mode when voicePaths are empty', () => {
    const mockGeometry: RenderedGeometry = {
      width: 800,
      height: 600,
      bands: [
        { y: 100, height: 50, color: '#ff0000', opacity: 0.8, onset: 1, duration: 4 }
      ],
      voicePaths: [],
      config: DEFAULT_CONFIG
    };
    const bounds = calculateActiveNotesBoundingBox(mockGeometry, 2.0);
    expect(bounds).toEqual({ minX: 0, minY: 100, maxX: 800, maxY: 150 });
  });

  it('executes stepAutoZoom (lerp bounds when active, lerp to default when silent)', () => {
    const mockGeometry: RenderedGeometry = {
      width: 800,
      height: 600,
      bands: [],
      config: DEFAULT_CONFIG,
      voicePaths: [
        {
          voice: 0,
          voiceName: 'Voice 0',
          segments: [
            {
              start: { x: 200, y: 200 },
              end: { x: 400, y: 400 },
              color: '#ff0000',
              width: 2,
              opacity: 1,
              note: { id: 'n0', pitch: 60, onset: 1, duration: 3, velocity: 80, voice: 0, pitchClass: 0 }
            }
          ],
          circles: []
        }
      ]
    };

    const controller = new ViewportController();
    // Active time (currentTime = 2): lerps toward active note center
    controller.stepAutoZoom(mockGeometry, 2, 800, 600);
    expect(controller.getViewport().zoom).toBeGreaterThan(1.0);

    // Silent time (currentTime = 10): lerps back toward DEFAULT_VIEWPORT
    const zoomedState = controller.getViewport();
    controller.stepAutoZoom(mockGeometry, 10, 800, 600);
    expect(controller.getViewport().zoom).toBeLessThan(zoomedState.zoom);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/viewportController.test.ts`
Expected: FAIL with "Cannot find module '../src/core/layout/viewportController.js'"

- [ ] **Step 3: Implement `ViewportController` in `src/core/layout/viewportController.ts`**

Create `src/core/layout/viewportController.ts`:
```typescript
import { DEFAULT_VIEWPORT, ViewportTransform, clampZoom, RenderedGeometry } from '../types.js';

export const AUTO_ZOOM_LERP = 0.15;

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function calculateActiveNotesBoundingBox(geometry: RenderedGeometry, currentTime: number): BoundingBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;

  for (const voice of geometry.voicePaths) {
    for (const seg of voice.segments) {
      if (seg.role === 'gap') continue;
      const onset = seg.note.onset;
      const endTime = onset + seg.note.duration;
      if (currentTime >= onset && currentTime <= endTime) {
        found = true;
        minX = Math.min(minX, seg.start.x, seg.end.x);
        maxX = Math.max(maxX, seg.start.x, seg.end.x);
        minY = Math.min(minY, seg.start.y, seg.end.y);
        maxY = Math.max(maxY, seg.start.y, seg.end.y);
      }
    }
    for (const circle of voice.circles) {
      const onset = circle.note.onset;
      const endTime = onset + circle.note.duration;
      if (currentTime >= onset && currentTime <= endTime) {
        found = true;
        minX = Math.min(minX, circle.center.x - circle.radius);
        maxX = Math.max(maxX, circle.center.x + circle.radius);
        minY = Math.min(minY, circle.center.y - circle.radius);
        maxY = Math.max(maxY, circle.center.y + circle.radius);
      }
    }
  }

  if (!found && geometry.bands.length > 0) {
    for (const band of geometry.bands) {
      if (band.onset !== undefined && band.duration !== undefined) {
        if (currentTime >= band.onset && currentTime <= (band.onset + band.duration)) {
          found = true;
          minX = 0;
          maxX = geometry.width;
          minY = Math.min(minY, band.y);
          maxY = Math.max(maxY, band.y + band.height);
        }
      }
    }
  }

  if (!found) return null;
  return { minX, minY, maxX, maxY };
}

export function calculateAutoZoomTransform(
  current: ViewportTransform,
  activeBounds: BoundingBox | null,
  canvasWidth: number,
  canvasHeight: number,
  lerpFactor = AUTO_ZOOM_LERP
): ViewportTransform {
  const targetTransform = activeBounds ? (() => {
    const boundsWidth = Math.max(20, activeBounds.maxX - activeBounds.minX);
    const boundsHeight = Math.max(20, activeBounds.maxY - activeBounds.minY);
    const centerX = (activeBounds.minX + activeBounds.maxX) / 2;
    const centerY = (activeBounds.minY + activeBounds.maxY) / 2;
    const zoom = clampZoom(Math.min((canvasWidth * 0.75) / boundsWidth, (canvasHeight * 0.75) / boundsHeight));
    const panX = (canvasWidth / 2 - centerX) * zoom;
    const panY = (canvasHeight / 2 - centerY) * zoom;
    return { zoom, panX, panY };
  })() : DEFAULT_VIEWPORT;

  const nextZoom = current.zoom + (targetTransform.zoom - current.zoom) * lerpFactor;
  const nextPanX = current.panX + (targetTransform.panX - current.panX) * lerpFactor;
  const nextPanY = current.panY + (targetTransform.panY - current.panY) * lerpFactor;

  return {
    zoom: nextZoom,
    panX: nextPanX,
    panY: nextPanY,
    autoZoom: true,
  };
}

export class ViewportController {
  private viewport: ViewportTransform = { ...DEFAULT_VIEWPORT };

  public getViewport(): ViewportTransform {
    return { ...this.viewport };
  }

  public setViewport(next: Partial<ViewportTransform>): void {
    const hasPositionChange = (next.zoom !== undefined && next.zoom !== this.viewport.zoom) ||
      (next.panX !== undefined && next.panX !== this.viewport.panX) ||
      (next.panY !== undefined && next.panY !== this.viewport.panY);

    this.viewport = {
      ...this.viewport,
      ...next,
      zoom: next.zoom !== undefined ? clampZoom(next.zoom) : this.viewport.zoom,
      autoZoom: hasPositionChange ? false : (next.autoZoom ?? this.viewport.autoZoom),
    };
  }

  public setAutoZoom(enabled: boolean): void {
    this.viewport.autoZoom = enabled;
  }

  public panBy(deltaX: number, deltaY: number): void {
    this.viewport.panX += deltaX;
    this.viewport.panY += deltaY;
    this.viewport.autoZoom = false;
  }

  public zoomAt(targetZoom: number, anchorX: number, anchorY: number, width: number, height: number): void {
    this.viewport.autoZoom = false;
    const oldZoom = this.viewport.zoom;
    const newZoom = clampZoom(targetZoom);
    if (oldZoom === newZoom) return;

    const centerX = width / 2;
    const centerY = height / 2;

    const pointX = (anchorX - centerX - this.viewport.panX) / oldZoom;
    const pointY = (anchorY - centerY - this.viewport.panY) / oldZoom;

    this.viewport.panX = anchorX - centerX - pointX * newZoom;
    this.viewport.panY = anchorY - centerY - pointY * newZoom;
    this.viewport.zoom = newZoom;
  }

  public resetView(): void {
    this.viewport = { ...DEFAULT_VIEWPORT };
  }

  public stepAutoZoom(geometry: RenderedGeometry, currentTime: number, width: number, height: number): void {
    if (!this.viewport.autoZoom) return;
    const bounds = calculateActiveNotesBoundingBox(geometry, currentTime);
    this.viewport = calculateAutoZoomTransform(this.viewport, bounds, width, height);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/viewportController.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/layout/viewportController.ts tests/viewportController.test.ts
git commit -m "feat(core): add ViewportController and RenderedGeometry active note auto-zoom calculation"
```

---

### Task 3: Renderers Integration (Canvas & SVG Transforms)

**Files:**
- Modify: `src/renderers/canvas/canvasRenderer.ts`
- Modify: `src/renderers/svg/svgBuilder.ts`
- Test: `tests/viewportRenderers.test.ts`

**Interfaces:**
- Consumes: `ViewportTransform` from `src/core/types.ts`
- Produces: Updated `CanvasRenderer.render` and `buildSvg` taking optional `viewport?: ViewportTransform`

- [ ] **Step 1: Write failing tests for renderer viewport transformations**

Create `tests/viewportRenderers.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import { buildSvg } from '../src/renderers/svg/svgBuilder.js';
import { RenderedGeometry } from '../src/core/types.js';
import { DEFAULT_CONFIG } from '../src/core/mapper/scoreMapper.js';

describe('Viewport Renderer Extensions', () => {
  const dummyGeometry: RenderedGeometry = {
    width: 1200,
    height: 1200,
    bands: [{ y: 100, height: 50, color: '#ffffff', opacity: 0.5 }],
    voicePaths: [],
    config: DEFAULT_CONFIG
  };

  it('wraps all score geometry (voicePaths and bands) in transform group in generated SVG', () => {
    const svg = buildSvg(dummyGeometry, {
      viewport: { zoom: 2.0, panX: 50, panY: -20, autoZoom: false }
    });
    expect(svg).toMatch(/<g [^>]*transform="translate\(\s*\d+(\.\d+)?\s+\d+(\.\d+)?\)\s*scale\(2\)/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/viewportRenderers.test.ts`
Expected: FAIL (viewport option not recognized or transform missing)

- [ ] **Step 3: Update `CanvasRenderer` in `src/renderers/canvas/canvasRenderer.ts`**

Update `CanvasRenderOptions` in `canvasRenderer.ts` to include `viewport?: ViewportTransform`.
In `render()`, keep clear canvas and `drawAtmosphere` outside the matrix block.
Wrap score elements (`geometry.bands` and `geometry.voicePaths`) inside:
```typescript
ctx.save();
ctx.translate(width / 2 + viewport.panX, height / 2 + viewport.panY);
ctx.scale(viewport.zoom, viewport.zoom);
ctx.translate(-width / 2, -height / 2);
// Render voice paths and time-band geometries
ctx.restore();
```
Render fixed legend and title overlay outside `ctx.restore()`.

- [ ] **Step 4: Update `buildSvg` in `src/renderers/svg/svgBuilder.ts`**

Update `SvgOptions` in `svgBuilder.ts` to include `viewport?: ViewportTransform`.
If `options.viewport` is supplied and non-default (`zoom !== 1 || panX !== 0 || panY !== 0`), wrap all score geometry elements (voice paths AND bands) inside `<g transform="translate(${width/2 + viewport.panX}, ${height/2 + viewport.panY}) scale(${viewport.zoom}) translate(${-width/2}, ${-height/2})">...</g>`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/viewportRenderers.test.ts tests/svg.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderers/canvas/canvasRenderer.ts src/renderers/svg/svgBuilder.ts tests/viewportRenderers.test.ts
git commit -m "feat(renderers): support ViewportTransform in Canvas and SVG renderers"
```

---

### Task 4: UI Gestures, HUD Overlay & Control Panel Integration

**Files:**
- Create: `src/ui/viewportGestures.ts`
- Modify: `index.html`
- Modify: `src/ui/styles/main.css`
- Modify: `src/ui/app.ts`

**Interfaces:**
- Consumes: `ViewportController` from `src/core/layout/viewportController.ts`
- Produces: `ViewportGestures` manager, canvas HUD overlay inside `.canvas-wrapper`, Section 05 sidebar controls (`max="10.0"`), live preview `render()` viewport passing, export scaling in `app.ts`

- [ ] **Step 1: Update `index.html` with Canvas HUD inside `.canvas-wrapper` and Sidebar Section 05**

Add `#viewport-hud` inside `.canvas-wrapper`:
```html
<div class="canvas-wrapper">
  <canvas id="visualizer-canvas"></canvas>
  <div id="viewport-hud" class="viewport-hud" aria-label="Viewport Controls">
    <button id="hud-zoom-in" class="hud-btn" title="Zoom In (+)">+</button>
    <button id="hud-zoom-out" class="hud-btn" title="Zoom Out (-)">-</button>
    <button id="hud-reset" class="hud-btn" title="Reset View (R)">Reset</button>
    <label class="hud-badge" title="Auto-zoom active region">
      <input type="checkbox" id="hud-autozoom-toggle" checked />
      <span>Auto</span>
    </label>
  </div>
</div>
```

Add Section 05 in control sidebar:
```html
<section class="control-group">
  <h2><span>05</span> Viewport & Framing</h2>
  <div class="control-grid">
    <label>
      Zoom level
      <input id="viewport-zoom-range" type="range" min="0.25" max="10.0" step="0.05" value="1.0" />
      <output id="val-viewport-zoom">100%</output>
    </label>
    <label class="toggle">
      <input id="viewport-autozoom-toggle" type="checkbox" checked />
      <span>Auto-zoom active region</span>
    </label>
    <div class="button-grid">
      <button class="btn" id="btn-reset-viewport">Reset framing</button>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Add CSS rules in `src/ui/styles/main.css`**

Add styling for `#visualizer-canvas` with `touch-action: none;`. Add styling for `#viewport-hud` inside `.canvas-wrapper`: `position: absolute; top: 12px; right: 12px; z-index: 5; pointer-events: auto; display: flex; gap: 6px;`.

- [ ] **Step 3: Create `ViewportGestures` in `src/ui/viewportGestures.ts`**

Create `src/ui/viewportGestures.ts`:
```typescript
import { ViewportController } from '../core/layout/viewportController.js';

export class ViewportGestures {
  private activePointers = new Map<number, { x: number; y: number }>();
  private initialPinchDist = 0;
  private initialPinchZoom = 1;

  constructor(
    private canvas: HTMLCanvasElement,
    private controller: ViewportController,
    private previewSize: number,
    private onUpdate: () => void
  ) {
    this.bindEvents();
  }

  private getLogicalCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.previewSize / Math.max(1, rect.width);
    const scaleY = this.previewSize / Math.max(1, rect.height);
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  private bindEvents(): void {
    this.canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const pt = this.getLogicalCoords(event.clientX, event.clientY);
      const factor = Math.exp(-event.deltaY * 0.0015);
      const currentZoom = this.controller.getViewport().zoom;
      this.controller.zoomAt(currentZoom * factor, pt.x, pt.y, this.previewSize, this.previewSize);
      this.onUpdate();
    }, { passive: false });

    let isDragging = false;
    let lastPt = { x: 0, y: 0 };

    this.canvas.addEventListener('pointerdown', (event) => {
      this.canvas.setPointerCapture(event.pointerId);
      this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.activePointers.size === 1) {
        isDragging = true;
        lastPt = { x: event.clientX, y: event.clientY };
      } else if (this.activePointers.size === 2) {
        isDragging = false;
        const pts = [...this.activePointers.values()];
        this.initialPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        this.initialPinchZoom = this.controller.getViewport().zoom;
      }
    });

    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.activePointers.has(event.pointerId)) return;
      this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (this.activePointers.size === 1 && isDragging) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.previewSize / Math.max(1, rect.width);
        const scaleY = this.previewSize / Math.max(1, rect.height);
        const dx = (event.clientX - lastPt.x) * scaleX;
        const dy = (event.clientY - lastPt.y) * scaleY;
        lastPt = { x: event.clientX, y: event.clientY };
        this.controller.panBy(dx, dy);
        this.onUpdate();
      } else if (this.activePointers.size === 2) {
        const pts = [...this.activePointers.values()];
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        if (this.initialPinchDist > 0) {
          const ratio = dist / this.initialPinchDist;
          const centerCss = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
          const pt = this.getLogicalCoords(centerCss.x, centerCss.y);
          this.controller.zoomAt(this.initialPinchZoom * ratio, pt.x, pt.y, this.previewSize, this.previewSize);
          this.onUpdate();
        }
      }
    });

    const release = (event: PointerEvent) => {
      this.activePointers.delete(event.pointerId);
      if (this.activePointers.size < 2) this.initialPinchDist = 0;
      if (this.activePointers.size === 0) isDragging = false;
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);
  }
}
```

- [ ] **Step 4: Update `src/ui/app.ts` to wire ViewportGestures, live preview render, and export scaling**

Add named constants: `const PREVIEW_SIZE = 900; const EXPORT_SIZE = 1200;`
Instantiate `ViewportController` and `ViewportGestures`.
In `setScore()`, call `this.viewportController.resetView()`.
Update `render()`:
```typescript
private render(): void {
  const geometry = this.geometryFor(PREVIEW_SIZE);
  this.canvasRenderer.render(geometry, {
    time: this.currentTime,
    showLegend: true,
    backgroundColor: this.backgroundColor(),
    title: this.exportTitle,
    viewport: this.viewportController.getViewport()
  });
  this.updateViewportUi();
  // ... scrubber and time display update
}
```
Update export methods in `app.ts`:
```typescript
private getExportViewport(size: number): ViewportTransform {
  const vp = this.viewportController.getViewport();
  const scale = size / PREVIEW_SIZE;
  return { ...vp, panX: vp.panX * scale, panY: vp.panY * scale };
}

private downloadPng(): void {
  const geometry = this.geometryFor(EXPORT_SIZE);
  this.canvasRenderer.render(geometry, {
    showLegend: true,
    backgroundColor: this.backgroundColor(),
    title: this.exportTitle,
    viewport: this.getExportViewport(EXPORT_SIZE)
  });
  this.canvasRenderer.downloadPng(`${this.filename()}.png`);
  this.render();
}

private downloadSvg(plotter: boolean): void {
  const geometry = this.geometryFor(EXPORT_SIZE);
  this.download(
    new Blob([buildSvg(geometry, {
      includeLegend: !plotter,
      penPlotterMode: plotter,
      backgroundColor: this.backgroundColor(),
      title: this.exportTitle,
      includePlotterTitle: false,
      viewport: this.getExportViewport(EXPORT_SIZE)
    })], { type: 'image/svg+xml' }),
    `${this.filename()}${plotter ? '-plotter' : ''}.svg`
  );
}
```

Shielded Keyboard shortcuts on `window`:
```typescript
window.addEventListener('keydown', (event) => {
  const t = event.target;
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
  if (t instanceof HTMLElement && t.isContentEditable) return;
  if (event.key === '+' || event.key === '=') this.viewportController.zoomAt(this.viewportController.getViewport().zoom * 1.25, PREVIEW_SIZE / 2, PREVIEW_SIZE / 2, PREVIEW_SIZE, PREVIEW_SIZE);
  else if (event.key === '-' || event.key === '_') this.viewportController.zoomAt(this.viewportController.getViewport().zoom / 1.25, PREVIEW_SIZE / 2, PREVIEW_SIZE / 2, PREVIEW_SIZE, PREVIEW_SIZE);
  else if (event.key === '0' || event.key === 'r' || event.key === 'R') this.viewportController.resetView();
  else if (event.key === 'a' || event.key === 'A') this.viewportController.setAutoZoom(!this.viewportController.getViewport().autoZoom);
  else return;
  this.render();
});
```

- [ ] **Step 5: Run `npm run validate` to test full application build**

Run: `npm run validate`
Expected: PASS (all tests pass, type-check passes, vite build succeeds)

- [ ] **Step 6: Commit**

```bash
git add index.html src/ui/styles/main.css src/ui/viewportGestures.ts src/ui/app.ts
git commit -m "feat(ui): add interactive canvas gestures, HUD overlay, touch guards, export viewport scaling, and synced controls"
```

---

### Task 5: Documentation & Validation

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `dev-docs/TO_DO.md`
- Modify: `ARCHITECTURE.md`
- Modify: `DESIGN.md`

- [ ] **Step 1: Update `dev-docs/TO_DO.md`**

Mark the zoom and pan items complete with completion date `2026-07-23`.

- [ ] **Step 2: Update `CHANGELOG.md`**

Add under `[Unreleased]` -> `Added`:
- Interactive canvas preview zoom and pan with mouse wheel, click-drag, touch pinch/pan, HUD overlay, and keyboard shortcuts (`+`/`-`/`R`/`A`).
- Dynamic playback auto-zoom tracking active note bounding boxes during MIDI preview.
- Viewport framing preservation across SVG, PNG, and pen-plotter exports with proportional resolution scaling.

- [ ] **Step 3: Update `ARCHITECTURE.md` and `DESIGN.md`**

Document `ViewportTransform` and `ViewportController` layout engine contracts in `ARCHITECTURE.md`. Document HUD overlay and interactive framing aesthetics in `DESIGN.md`.

- [ ] **Step 4: Run complete validation suite**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md dev-docs/TO_DO.md ARCHITECTURE.md DESIGN.md
git commit -m "docs: update CHANGELOG, ARCHITECTURE, DESIGN, and TO_DO for zoom/pan feature"
```
