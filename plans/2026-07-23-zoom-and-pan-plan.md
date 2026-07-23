# Interactive Zoom & Pan with Dynamic Auto-Zoom Implementation Plan

Status: ready for implementation (revised after comprehensive architecture assessments)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement interactive mouse, wheel, touch, and HUD/panel zoom and pan controls for the score canvas preview and vector exports (SVG/PNG/Plotter), with default dynamic auto-zoom that tracks active note regions during playback.

**Architecture:** Add `ViewportTransform` to core domain types with NaN/Infinity clamping bounds. Implement pure math helpers (`calculateActiveNotesBoundingBox`, `calculateAutoZoomTransform`) plus a stateful `ViewportController` class that computes gesture transforms and lerped active-note auto-zoom (`AUTO_ZOOM_LERP = 0.15`) using `RenderedGeometry`. Extend `CanvasRenderer` to wrap score geometry drawing (`bands` and `voicePaths`) within matrix transforms while preserving screen-fixed legend/title layers and background atmosphere. Update `buildSvg` to wrap all score geometry elements in an outer transform container `<g transform="...">`. Centralize export resolution pan scaling in `app.ts` (`panX * exportSize / previewSize`) so PNG, SVG, and plotter exports match preview framing. Integrate canvas gesture handlers with `pointercapture`, canvas HUD overlay, side-panel controls (synchronized with HUD), touch-action scrolling guards, keyboard shortcut shielding, and score reset in `app.ts`.

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
import { ViewportController, calculateActiveNotesBoundingBox, calculateAutoZoomTransform } from '../src/core/layout/viewportController.js';
import { RenderedGeometry } from '../src/core/types.js';
import { DEFAULT_CONFIG } from '../src/core/mapper/scoreMapper.js';

describe('ViewportController & Auto-Zoom', () => {
  it('starts with default viewport', () => {
    const controller = new ViewportController();
    expect(controller.getViewport()).toEqual({ zoom: 1, panX: 0, panY: 0, autoZoom: true });
  });

  it('pans by delta (CSS pixels) and disables autoZoom', () => {
    const controller = new ViewportController();
    controller.panBy(50, -20);
    expect(controller.getViewport()).toEqual({ zoom: 1, panX: 50, panY: -20, autoZoom: false });
  });

  it('zooms anchored at coordinate, preserves world point, and disables autoZoom', () => {
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
  });

  it('resets view to default and re-enables autoZoom', () => {
    const controller = new ViewportController();
    controller.panBy(100, 100);
    controller.resetView();
    expect(controller.getViewport()).toEqual({ zoom: 1, panX: 0, panY: 0, autoZoom: true });
  });

  it('calculates bounding box of active notes from RenderedGeometry', () => {
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
            }
          ],
          circles: []
        }
      ]
    };
    const bounds = calculateActiveNotesBoundingBox(mockGeometry, 2.5);
    expect(bounds).toEqual({ minX: 100, minY: 150, maxX: 300, maxY: 250 });
  });

  it('executes stepAutoZoom (lerp bounds when active, no-op when silent or autoZoom=false)', () => {
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
    // Silent time (currentTime = 0): viewport unchanged
    controller.stepAutoZoom(mockGeometry, 0, 800, 600);
    expect(controller.getViewport()).toEqual({ zoom: 1, panX: 0, panY: 0, autoZoom: true });

    // Active time (currentTime = 2): lerps toward active note center
    controller.stepAutoZoom(mockGeometry, 2, 800, 600);
    expect(controller.getViewport().zoom).toBeGreaterThan(1.0);

    // Manual override disables autoZoom step
    controller.panBy(10, 10);
    const panState = controller.getViewport();
    controller.stepAutoZoom(mockGeometry, 2, 800, 600);
    expect(controller.getViewport()).toEqual(panState);
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

### Task 4: UI Canvas Overlay HUD & Control Panel Integration

**Files:**
- Modify: `index.html`
- Modify: `src/ui/styles/main.css`
- Modify: `src/ui/app.ts`

**Interfaces:**
- Consumes: `ViewportController` from `src/core/layout/viewportController.ts`
- Produces: Interactive wheel/drag canvas events, floating Canvas HUD overlay, side panel "05 Viewport & Framing" section, touch-action guards, export viewport scaling, keyboard shortcut form shielding

- [ ] **Step 1: Update `index.html` with Canvas HUD and Viewport Control Panel Section**

Add `#viewport-hud` inside canvas container:
```html
<div class="canvas-container">
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

Add styling for `#visualizer-canvas` with `touch-action: none;` to prevent touch scrolling. Add styling for `.canvas-container`, `#viewport-hud`, `.hud-btn`, and `.hud-badge` with glassmorphic semi-transparent styling.

- [ ] **Step 3: Connect ViewportController events, export scaling, and playback tick in `src/ui/app.ts`**

Instantiate `this.viewportController = new ViewportController();`.
In `setScore()`, call `this.viewportController.resetView()`.

Implement CSS-to-canvas coordinate helper:
```typescript
private getCanvasCoords(event: { clientX: number; clientY: number }): { x: number; y: number } {
  const canvas = this.element<HTMLCanvasElement>('visualizer-canvas');
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / Math.max(1, rect.width);
  const scaleY = canvas.height / Math.max(1, rect.height);
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}
```

Attach event listeners:
- Canvas `wheel`: `const pt = this.getCanvasCoords(event); this.viewportController.zoomAt(newZoom, pt.x, pt.y, 900, 900)`
- Canvas `pointerdown`: `canvas.setPointerCapture(event.pointerId)`
- Canvas `pointermove`: Drag `panBy(dxCss, dyCss)` when primary pointer is pressed. Pinch gesture tracking for multi-pointer touches.
- HUD buttons & Sidebar controls:
  - Synchronize `#viewport-zoom-range`, `#hud-autozoom-toggle`, `#viewport-autozoom-toggle` bidirectionally in `updateViewportUi()`.
- Export methods:
  ```typescript
  private getExportViewport(exportSize: number): ViewportTransform {
    const vp = this.viewportController.getViewport();
    const scaleRatio = exportSize / 900;
    return {
      ...vp,
      panX: vp.panX * scaleRatio,
      panY: vp.panY * scaleRatio,
    };
  }

  private downloadPng(): void {
    const geometry = this.geometryFor(1200);
    this.canvasRenderer.render(geometry, {
      showLegend: true,
      backgroundColor: this.backgroundColor(),
      title: this.exportTitle,
      viewport: this.getExportViewport(1200)
    });
    this.canvasRenderer.downloadPng(`${this.filename()}.png`);
    this.render();
  }

  private downloadSvg(plotter: boolean): void {
    const geometry = this.geometryFor(1200);
    this.download(
      new Blob([buildSvg(geometry, {
        includeLegend: !plotter,
        penPlotterMode: plotter,
        backgroundColor: this.backgroundColor(),
        title: this.exportTitle,
        includePlotterTitle: false,
        viewport: this.getExportViewport(1200)
      })], { type: 'image/svg+xml' }),
      `${this.filename()}${plotter ? '-plotter' : ''}.svg`
    );
  }
  ```
- Shielded Keyboard Shortcuts on `window`:
  ```typescript
  window.addEventListener('keydown', (event) => {
    const t = event.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
    if (t instanceof HTMLElement && t.isContentEditable) return;
    if (event.key === '+' || event.key === '=') this.viewportController.zoomAt(this.viewportController.getViewport().zoom * 1.25, 450, 450, 900, 900);
    else if (event.key === '-' || event.key === '_') this.viewportController.zoomAt(this.viewportController.getViewport().zoom / 1.25, 450, 450, 900, 900);
    else if (event.key === '0' || event.key === 'r' || event.key === 'R') this.viewportController.resetView();
    else if (event.key === 'a' || event.key === 'A') this.viewportController.setAutoZoom(!this.viewportController.getViewport().autoZoom);
    this.render();
  });
  ```
- In `tick()`, before `render()`:
  `this.viewportController.stepAutoZoom(geometry, this.currentTime, 900, 900);`
  `this.updateViewportUi();`

- [ ] **Step 4: Run `npm run validate` to test full application build**

Run: `npm run validate`
Expected: PASS (all tests pass, type-check passes, vite build succeeds)

- [ ] **Step 5: Commit**

```bash
git add index.html src/ui/styles/main.css src/ui/app.ts
git commit -m "feat(ui): add interactive canvas gestures, HUD overlay, touch guards, export viewport scaling, and synced controls"
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
- Viewport framing preservation across SVG, PNG, and pen-plotter exports with proportional resolution scaling.

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
