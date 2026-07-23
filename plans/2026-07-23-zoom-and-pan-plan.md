# Interactive Zoom & Pan with Dynamic Auto-Zoom Implementation Plan

Status: ready for implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement interactive mouse, wheel, touch, and HUD/panel zoom and pan controls for the score canvas preview and vector exports (SVG/PNG/Plotter), with default dynamic auto-zoom that tracks active note regions during playback.

**Architecture:** Add `ViewportTransform` to core domain types. Implement a side-effect-free `ViewportController` that computes gesture transforms and lerped active-note bounding box auto-zoom. Extend `CanvasRenderer` to wrap score geometry drawing within matrix transforms while preserving screen-fixed legend/title layers. Update `buildSvg` to wrap exported geometry in transform containers matching preview framing. Integrate canvas gesture handlers, canvas HUD overlay, side-panel controls, and keyboard shortcuts in `app.ts`.

**Tech Stack:** TypeScript, HTML5 Canvas 2D Context, SVG, Vitest, Vite.

**Spec:** [`plans/specs/2026-07-23-zoom-and-pan.md`](specs/2026-07-23-zoom-and-pan.md)

## Global Constraints

- Keep MIDI parser, score-to-geometry mapper, and layout fitters deterministic and side-effect free.
- Browser MIDI file handling stays local; no telemetry; no remote user data upload.
- SVG, PNG, and pen-plotter exports must match the active preview viewport zoom and pan framing.
- Must pass `npm run validate` (type-checking, Vitest tests, production build).
- Update `ARCHITECTURE.md`, `CHANGELOG.md` (MINOR), and `dev-docs/TO_DO.md`.

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

  it('clamps zoom within bounds [0.25, 10.0]', () => {
    expect(clampZoom(0.1)).toBe(0.25);
    expect(clampZoom(2.5)).toBe(2.5);
    expect(clampZoom(15.0)).toBe(10.0);
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
  return Math.min(10.0, Math.max(0.25, zoom));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/viewportTypes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts tests/viewportTypes.test.ts
git commit -m "feat(core): add ViewportTransform domain types and zoom clamping"
```

---

### Task 2: ViewportController & Active Note Auto-Zoom Calculation

**Files:**
- Create: `src/core/layout/viewportController.ts`
- Test: `tests/viewportController.test.ts`

**Interfaces:**
- Consumes: `ViewportTransform`, `DEFAULT_VIEWPORT`, `clampZoom` from `src/core/types.ts`, `MappedGeometry` from `src/core/mapper/scoreMapper.ts`
- Produces: `calculateActiveNotesBoundingBox`, `calculateAutoZoomTransform`, `ViewportController` class

- [ ] **Step 1: Write failing tests for ViewportController & Auto-Zoom**

Create `tests/viewportController.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import { ViewportController, calculateActiveNotesBoundingBox, calculateAutoZoomTransform } from '../src/core/layout/viewportController.js';
import { MappedGeometry } from '../src/core/types.js';

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

  it('zooms anchored at coordinate and disables autoZoom', () => {
    const controller = new ViewportController();
    controller.zoomAt(2.0, 400, 300, 800, 600);
    const vp = controller.getViewport();
    expect(vp.zoom).toBe(2.0);
    expect(vp.autoZoom).toBe(false);
  });

  it('resets view to default and re-enables autoZoom', () => {
    const controller = new ViewportController();
    controller.panBy(100, 100);
    controller.resetView();
    expect(controller.getViewport()).toEqual({ zoom: 1, panX: 0, panY: 0, autoZoom: true });
  });

  it('calculates bounding box of active notes from mapped geometry', () => {
    const mockGeometry: MappedGeometry = {
      bounds: { minX: 0, minY: 0, maxX: 800, maxY: 600, width: 800, height: 600 },
      paths: [
        {
          id: 'p1', channel: 0, note: 60, startTime: 0, endTime: 5, color: '#ff0000', opacity: 1, strokeWidth: 2,
          points: [{ x: 100, y: 150, time: 0 }, { x: 300, y: 250, time: 5 }]
        }
      ],
      nodes: [],
      timeLines: []
    };
    const bounds = calculateActiveNotesBoundingBox(mockGeometry, 2.5);
    expect(bounds).toEqual({ minX: 100, minY: 150, maxX: 300, maxY: 250 });
  });

  it('calculates target auto-zoom transform centered on active bounds', () => {
    const activeBounds = { minX: 200, minY: 200, maxX: 400, maxY: 400 };
    const vp = calculateAutoZoomTransform({ zoom: 1, panX: 0, panY: 0, autoZoom: true }, activeBounds, 800, 600, 1.0);
    expect(vp.autoZoom).toBe(true);
    expect(vp.zoom).toBeGreaterThan(1.0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/viewportController.test.ts`
Expected: FAIL with "Cannot find module '../src/core/layout/viewportController.js'"

- [ ] **Step 3: Implement `ViewportController` in `src/core/layout/viewportController.ts`**

Create `src/core/layout/viewportController.ts`:
```typescript
import { DEFAULT_VIEWPORT, ViewportTransform, clampZoom } from '../types.js';
import { MappedGeometry } from '../types.js';

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function calculateActiveNotesBoundingBox(geometry: MappedGeometry, currentTime: number): BoundingBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;

  for (const path of geometry.paths) {
    if (currentTime >= path.startTime && currentTime <= path.endTime) {
      for (const pt of path.points) {
        found = true;
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
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
  lerpFactor = 0.15
): ViewportTransform {
  if (!activeBounds) return current;

  const boundsWidth = Math.max(20, activeBounds.maxX - activeBounds.minX);
  const boundsHeight = Math.max(20, activeBounds.maxY - activeBounds.minY);
  const centerX = (activeBounds.minX + activeBounds.maxX) / 2;
  const centerY = (activeBounds.minY + activeBounds.maxY) / 2;

  const targetZoom = clampZoom(Math.min((canvasWidth * 0.75) / boundsWidth, (canvasHeight * 0.75) / boundsHeight));
  const targetPanX = (canvasWidth / 2 - centerX) * targetZoom;
  const targetPanY = (canvasHeight / 2 - centerY) * targetZoom;

  const nextZoom = current.zoom + (targetZoom - current.zoom) * lerpFactor;
  const nextPanX = current.panX + (targetPanX - current.panX) * lerpFactor;
  const nextPanY = current.panY + (targetPanY - current.panY) * lerpFactor;

  return {
    zoom: Number(nextZoom.toFixed(4)),
    panX: Number(nextPanX.toFixed(2)),
    panY: Number(nextPanY.toFixed(2)),
    autoZoom: true,
  };
}

export class ViewportController {
  private viewport: ViewportTransform = { ...DEFAULT_VIEWPORT };

  public getViewport(): ViewportTransform {
    return { ...this.viewport };
  }

  public setViewport(next: Partial<ViewportTransform>): void {
    this.viewport = {
      ...this.viewport,
      ...next,
      zoom: next.zoom !== undefined ? clampZoom(next.zoom) : this.viewport.zoom,
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
    this.viewport.autoZoom = false;
  }

  public resetView(): void {
    this.viewport = { ...DEFAULT_VIEWPORT };
  }

  public stepAutoZoom(geometry: MappedGeometry, currentTime: number, width: number, height: number): void {
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
git commit -m "feat(core): add ViewportController and active note auto-zoom calculation"
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
import { MappedGeometry } from '../src/core/types.js';

describe('Viewport Renderer Extensions', () => {
  const dummyGeometry: MappedGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 800, maxY: 600, width: 800, height: 600 },
    paths: [],
    nodes: [],
    timeLines: []
  };

  it('includes viewport transform group in generated SVG when zoom or pan is active', () => {
    const svg = buildSvg(dummyGeometry, {
      viewport: { zoom: 2.0, panX: 50, panY: -20, autoZoom: false }
    });
    expect(svg).toContain('transform="translate(');
    expect(svg).toContain('scale(2)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/viewportRenderers.test.ts`
Expected: FAIL (viewport option not recognized or transform missing)

- [ ] **Step 3: Update `CanvasRenderer` in `src/renderers/canvas/canvasRenderer.ts`**

Update `CanvasRenderOptions` in `canvasRenderer.ts` to include `viewport?: ViewportTransform`.
In `render()`, wrap score elements inside `ctx.save()`, `ctx.translate(width/2 + viewport.panX, height/2 + viewport.panY)`, `ctx.scale(viewport.zoom, viewport.zoom)`, `ctx.translate(-width/2, -height/2)`, and call `ctx.restore()` before drawing fixed legend or title elements.

- [ ] **Step 4: Update `buildSvg` in `src/renderers/svg/svgBuilder.ts`**

Update `SvgRenderOptions` in `svgBuilder.ts` to include `viewport?: ViewportTransform`.
If `options.viewport` is supplied and non-default (`zoom !== 1 || panX !== 0 || panY !== 0`), wrap score path elements inside `<g transform="translate(${width/2 + viewport.panX}, ${height/2 + viewport.panY}) scale(${viewport.zoom}) translate(${-width/2}, ${-height/2})">...</g>`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/viewportRenderers.test.ts tests/svg.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderers/canvas/canvasRenderer.ts src/renderers/svg/svgBuilder.ts tests/viewportRenderers.test.ts
git commit -m "feat(renderers): support ViewportTransform in Canvas and SVG renderers"
```

---

### Task 4: UI Canvas Overlay HUD & Control Panel Integration

**Files:**
- Modify: `index.html`
- Modify: `src/ui/styles/main.css`
- Modify: `src/ui/app.ts`

**Interfaces:**
- Consumes: `ViewportController` from `src/core/layout/viewportController.ts`
- Produces: Interactive wheel/drag canvas events, floating Canvas HUD overlay, side panel "05 Viewport & Framing" section, keyboard shortcuts

- [ ] **Step 1: Update `index.html` with Canvas HUD and Viewport Control Panel Section**

Add `#viewport-hud` inside canvas container:
```html
<div class="canvas-container">
  <canvas id="visualizer-canvas"></canvas>
  <div id="viewport-hud" class="viewport-hud" aria-label="Viewport Controls">
    <button id="hud-zoom-in" class="hud-btn" title="Zoom In (+)">+</button>
    <button id="hud-zoom-out" class="hud-btn" title="Zoom Out (-)">-</button>
    <button id="hud-reset" class="hud-btn" title="Reset View (R)">⟲</button>
    <label class="hud-badge" title="Auto-zoom active region">
      <input type="checkbox" id="hud-autozoom-toggle" checked />
      <span>🎯 Auto</span>
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
      <input id="viewport-zoom-range" type="range" min="0.25" max="5.0" step="0.05" value="1.0" />
      <output id="val-viewport-zoom">100%</output>
    </label>
    <div class="button-grid">
      <button class="btn" id="btn-reset-viewport">Reset framing</button>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Add CSS rules in `src/ui/styles/main.css`**

Add styling for `.canvas-container`, `#viewport-hud`, `.hud-btn`, and `.hud-badge` with glassmorphic semi-transparent styling.

- [ ] **Step 3: Connect ViewportController events and playback tick in `src/ui/app.ts`**

Instantiate `this.viewportController = new ViewportController();`.
Attach event listeners:
- Canvas `wheel`: `this.viewportController.zoomAt(...)`
- Canvas `pointerdown`/`pointermove`/`pointerup`: Drag to `panBy(...)`
- Canvas Touch pinch: Pinch distance ratio zoom
- HUD buttons: `hud-zoom-in`, `hud-zoom-out`, `hud-reset`, `hud-autozoom-toggle`
- Sidebar controls: `viewport-zoom-range`, `btn-reset-viewport`
- Keyboard shortcuts: `+`, `-`, `0`, `r`/`R`, `a`/`A`
- Update `render()` to pass `viewportController.getViewport()` to canvas and SVG downloads.
- In `tick()`, invoke `viewportController.stepAutoZoom(geometry, currentTime, 900, 900)`.

- [ ] **Step 4: Run `npm run validate` to test full application build**

Run: `npm run validate`
Expected: PASS (all tests pass, type-check passes, vite build succeeds)

- [ ] **Step 5: Commit**

```bash
git add index.html src/ui/styles/main.css src/ui/app.ts
git commit -m "feat(ui): add interactive canvas gestures, HUD overlay, and viewport controls"
```

---

### Task 5: Documentation & Validation

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `dev-docs/TO_DO.md`
- Modify: `ARCHITECTURE.md`

- [ ] **Step 1: Update `dev-docs/TO_DO.md`**

Mark the zoom and pan items complete with completion date `2026-07-23`.

- [ ] **Step 2: Update `CHANGELOG.md`**

Add under `[Unreleased]` -> `Added`:
- Interactive canvas preview zoom and pan with mouse wheel, click-drag, touch pinch/pan, HUD overlay, and keyboard shortcuts (`+`/`-`/`R`/`A`).
- Dynamic playback auto-zoom tracking active note bounding boxes during MIDI preview.
- Viewport framing preservation across SVG, PNG, and pen-plotter exports.

- [ ] **Step 3: Update `ARCHITECTURE.md`**

Document `ViewportTransform` and `ViewportController` layout engine contracts.

- [ ] **Step 4: Run complete validation suite**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md dev-docs/TO_DO.md ARCHITECTURE.md
git commit -m "docs: update CHANGELOG, ARCHITECTURE, and TO_DO for zoom/pan feature"
```
