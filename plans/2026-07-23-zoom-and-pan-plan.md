# Interactive Zoom & Pan with Dynamic Auto-Zoom Implementation Plan

Status: ready for implementation (revised after final architecture assessment + clarity pass)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Commits:** Per-task `git commit` steps are optional checkpoints. Only commit when the user explicitly asks (AGENTS.md / project commit policy).

**Goal:** Implement interactive mouse, wheel, touch, and HUD/panel zoom and pan controls for the score canvas preview and vector exports (SVG/PNG/Plotter), with default dynamic auto-zoom that tracks active note regions during playback and lerps back out during silence.

**Architecture:** Add `ViewportTransform` to core domain types with NaN/Infinity clamping bounds. Implement pure math helpers (`calculateActiveNotesBoundingBox`, `calculateAutoZoomTransform`) plus a stateful `ViewportController` class that computes gesture transforms and lerped active-note auto-zoom (`AUTO_ZOOM_LERP = 0.15`) using `RenderedGeometry` (voice segments excluding gaps, circles, and non-silent bands). Extend `CanvasRenderer` to wrap score geometry drawing (`bands` and `voicePaths`) within matrix transforms while preserving screen-fixed legend/title layers and background atmosphere. Update `buildSvg` to wrap all score geometry elements in an outer transform container `<g transform="...">`, leaving title/legend outside. Centralize export resolution pan scaling in `app.ts` (`panX * EXPORT_SIZE / PREVIEW_SIZE`; zoom is **not** rescaled because export geometry is regenerated at `EXPORT_SIZE`). Extract gesture handling into `src/ui/viewportGestures.ts`, position HUD overlay inside `.canvas-wrapper` (bottom-left, `z-index: 5`, avoiding `.stage-corner`), synchronize sidebar section 05 controls (`max="10.0"`) with HUD via `updateViewportUi()`, pass `viewport` to live preview `render()`, call `stepAutoZoom` from `tick()` while playing, reset view on `setScore()`, and shield keyboard shortcuts on `window`.

**Tech Stack:** TypeScript, HTML5 Canvas 2D Context, SVG, Vitest, Vite.

**Spec:** [`plans/specs/2026-07-23-zoom-and-pan.md`](specs/2026-07-23-zoom-and-pan.md)

## Global Constraints

- Keep MIDI parser, score-to-geometry mapper, and layout fitters deterministic and side-effect free.
- Browser MIDI file handling stays local; no telemetry; no remote user data upload.
- SVG, PNG, and pen-plotter exports must match the active preview viewport zoom and pan framing.
- Must pass `npm run validate` (type-checking, Vitest tests, production build).
- Update `ARCHITECTURE.md`, `DESIGN.md`, `CHANGELOG.md` (MINOR), and `dev-docs/TO_DO.md`.

## Out of scope

- CLI (`src/cli/renderMidi.ts`) remains full-score fit with no interactive viewport; browser framing is preview/export-only.
- Time-indexed acceleration of active-bounds scans (O(N) per frame is acceptable for v1).
- Time-based (frame-rate-independent) auto-zoom lerp; v1 uses a fixed per-frame factor (`AUTO_ZOOM_LERP = 0.15`).
- Dedicated pan nudge buttons (drag / touch pan only).

## Behavior decisions (explicit)

| Topic | Decision |
|---|---|
| Auto-zoom when | Only while `isPlaying`, inside `tick()` before `render()`. Scrubber seeks update `currentTime` + `render()` but do **not** call `stepAutoZoom`. |
| Silence / no active geometry | Lerp toward `DEFAULT_VIEWPORT` (zoom out / re-center). |
| Gap segments | Exclude `segment.role === 'gap'` from bounds. |
| Silent bands | Exclude `band.silent === true` from bounds. |
| Tonal time-lines | When voice paths yield no active notes, build bounds from active non-silent bands (`minX=0`, `maxX=width`, `minY`/`maxY` from band extents). |
| Manual override | Any `panBy` / `zoomAt` (including clamped no-op zoom) sets `autoZoom = false`. |
| New score | `setScore` calls `resetView()` (identity zoom/pan, `autoZoom = true`). |
| UI sync | `ViewportController` is source of truth; `updateViewportUi()` projects state to HUD + sidebar each `render()`. |

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

- [ ] **Step 5: Commit** (optional — only if user asked)

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
    controller.zoomAt(10.0, ax, ay, w, h); // already at 2; jump to clamp edge
    controller.zoomAt(10.0, ax, ay, w, h); // no-op clamp — must still leave autoZoom false
    expect(controller.getViewport().zoom).toBe(10.0);
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
        { y: 100, height: 50, color: '#ff0000', opacity: 0.8, onset: 1, duration: 4, silent: false },
        { y: 400, height: 50, color: '#cccccc', opacity: 0.3, onset: 1, duration: 4, silent: true }
      ],
      voicePaths: [],
      config: { ...DEFAULT_CONFIG, variation: 'tonal_time_lines' }
    };
    const bounds = calculateActiveNotesBoundingBox(mockGeometry, 2.0);
    // Silent band excluded; active band → full width × band y-extent
    expect(bounds).toEqual({ minX: 0, minY: 100, maxX: 800, maxY: 150 });
  });

  it('executes stepAutoZoom (lerp when active, lerp to default when silent, no-op when autoZoom=false)', () => {
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

    // Manual override disables further auto-zoom steps
    controller.panBy(10, 10);
    const panState = controller.getViewport();
    controller.stepAutoZoom(mockGeometry, 2, 800, 600);
    expect(controller.getViewport()).toEqual(panState);
  });

  it('calculateAutoZoomTransform with lerpFactor=1 reaches exact active target', () => {
    const bounds = { minX: 200, minY: 200, maxX: 400, maxY: 400 };
    const next = calculateAutoZoomTransform(
      { zoom: 1, panX: 0, panY: 0, autoZoom: true },
      bounds,
      800,
      600,
      1
    );
    const targetZoom = Math.min((800 * 0.75) / 200, (600 * 0.75) / 200);
    expect(next.zoom).toBeCloseTo(targetZoom);
    expect(next.panX).toBeCloseTo((800 / 2 - 300) * targetZoom);
    expect(next.panY).toBeCloseTo((600 / 2 - 300) * targetZoom);
    expect(next.autoZoom).toBe(true);
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

  // Tonal time-lines: voicePaths are empty; frame active non-silent bands.
  if (!found && geometry.bands.length > 0) {
    for (const band of geometry.bands) {
      if (band.silent) continue;
      if (currentTime >= band.onset && currentTime <= band.onset + band.duration) {
        found = true;
        minX = 0;
        maxX = geometry.width;
        minY = Math.min(minY, band.y);
        maxY = Math.max(maxY, band.y + band.height);
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
  // Active region → frame with 75% padding; silence → lerp toward full-score default.
  const targetTransform = activeBounds ? (() => {
    const boundsWidth = Math.max(20, activeBounds.maxX - activeBounds.minX);
    const boundsHeight = Math.max(20, activeBounds.maxY - activeBounds.minY);
    const centerX = (activeBounds.minX + activeBounds.maxX) / 2;
    const centerY = (activeBounds.minY + activeBounds.maxY) / 2;
    const zoom = clampZoom(Math.min((canvasWidth * 0.75) / boundsWidth, (canvasHeight * 0.75) / boundsHeight));
    // Matches canvas/SVG matrix: translate(w/2+pan) scale(zoom) translate(-w/2)
    const panX = (canvasWidth / 2 - centerX) * zoom;
    const panY = (canvasHeight / 2 - centerY) * zoom;
    return { zoom, panX, panY };
  })() : { zoom: DEFAULT_VIEWPORT.zoom, panX: DEFAULT_VIEWPORT.panX, panY: DEFAULT_VIEWPORT.panY };

  return {
    zoom: current.zoom + (targetTransform.zoom - current.zoom) * lerpFactor,
    panX: current.panX + (targetTransform.panX - current.panX) * lerpFactor,
    panY: current.panY + (targetTransform.panY - current.panY) * lerpFactor,
    autoZoom: true,
  };
}

export class ViewportController {
  private viewport: ViewportTransform = { ...DEFAULT_VIEWPORT };

  public getViewport(): ViewportTransform {
    return { ...this.viewport };
  }

  /**
   * Partial update. Zoom/pan changes clear autoZoom unless the caller also
   * passes an explicit `autoZoom: true` (programmatic restore). Prefer
   * panBy / zoomAt / setAutoZoom / resetView from UI code.
   */
  public setViewport(next: Partial<ViewportTransform>): void {
    const hasPositionChange = (next.zoom !== undefined && next.zoom !== this.viewport.zoom) ||
      (next.panX !== undefined && next.panX !== this.viewport.panX) ||
      (next.panY !== undefined && next.panY !== this.viewport.panY);

    const autoZoom = next.autoZoom !== undefined
      ? next.autoZoom
      : (hasPositionChange ? false : this.viewport.autoZoom);

    this.viewport = {
      ...this.viewport,
      ...next,
      zoom: next.zoom !== undefined ? clampZoom(next.zoom) : this.viewport.zoom,
      autoZoom,
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
    // Manual gesture always disables auto-zoom, even when clamp makes zoom a no-op.
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

- [ ] **Step 5: Commit** (optional — only if user asked)

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
    bands: [{ y: 100, height: 50, color: '#ffffff', opacity: 0.5, onset: 0, duration: 1, silent: false }],
    voicePaths: [],
    config: DEFAULT_CONFIG
  };

  it('wraps all score geometry (voicePaths and bands) in transform group in generated SVG', () => {
    const svg = buildSvg(dummyGeometry, {
      viewport: { zoom: 2.0, panX: 50, panY: -20, autoZoom: false },
      title: 'Viewport Test'
    });
    expect(svg).toMatch(/<g [^>]*transform="translate\(\s*\d+(\.\d+)?\s+\d+(\.\d+)?\)\s*scale\(2\)/);
    // Title / legend stay outside the viewport group (screen-fixed)
    expect(svg.indexOf('id="title-overlay"')).toBeLessThan(svg.indexOf('scale(2)'));
  });

  it('includes band geometry inside the viewport transform group', () => {
    const svg = buildSvg(dummyGeometry, {
      viewport: { zoom: 2.0, panX: 0, panY: 0, autoZoom: false }
    });
    const groupStart = svg.indexOf('scale(2)');
    const groupEnd = svg.indexOf('</g>', groupStart);
    const bandLine = svg.indexOf('y1="125.00"'); // band mid-line at y=100+50/2
    expect(bandLine).toBeGreaterThan(groupStart);
    expect(bandLine).toBeLessThan(groupEnd);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/viewportRenderers.test.ts`
Expected: FAIL (viewport option not recognized or transform missing)

- [ ] **Step 3: Update `CanvasRenderer` in `src/renderers/canvas/canvasRenderer.ts`**

Update `CanvasRenderOptions` in `canvasRenderer.ts` to include `viewport?: ViewportTransform`.
In `render()`, keep clear canvas and `drawAtmosphere` outside the matrix block (still inside the existing DPR `ctx.save()` / `ctx.scale(dpr, dpr)`).
Wrap score elements (`geometry.bands` and `geometry.voicePaths`) inside:
```typescript
const viewport = options.viewport ?? DEFAULT_VIEWPORT;
ctx.save();
ctx.translate(width / 2 + viewport.panX, height / 2 + viewport.panY);
ctx.scale(viewport.zoom, viewport.zoom);
ctx.translate(-width / 2, -height / 2);
// Render voice paths and time-band geometries
ctx.restore();
```
Render fixed legend and title overlay **after** `ctx.restore()` (screen-fixed). Reset `globalAlpha = 1` before overlays as today.

- [ ] **Step 4: Update `buildSvg` in `src/renderers/svg/svgBuilder.ts`**

Update `SvgOptions` in `svgBuilder.ts` to include `viewport?: ViewportTransform`.

Emission order (do not change relative layering of fixed chrome):
1. Background rect (plotter-safe as today)
2. Title overlay (outside viewport transform)
3. Optional outer `<g id="viewport-transform" transform="…">` wrapping **only** voice path groups + band lines
4. Legend overlay (outside viewport transform)

If `options.viewport` is supplied and non-default (`zoom !== 1 || panX !== 0 || panY !== 0`), wrap score geometry inside:
```xml
<g id="viewport-transform" transform="translate(W/2+panX, H/2+panY) scale(zoom) translate(-W/2, -H/2)">
  …voice paths and bands…
</g>
```
Use the same three-step matrix as Canvas so preview and SVG framing match.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/viewportRenderers.test.ts tests/svg.test.ts`
Expected: PASS

- [ ] **Step 6: Commit** (optional — only if user asked)

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
- Produces: `ViewportGestures` manager, canvas HUD overlay inside `.canvas-wrapper`, Section 05 sidebar controls (`max="10.0"`), live preview `render()` viewport passing, `tick()` auto-zoom, export scaling in `app.ts`

- [ ] **Step 1: Update `index.html` with Canvas HUD inside `.canvas-wrapper` and Sidebar Section 05**

Keep the existing `.stage-corner` node. Insert `#viewport-hud` as a sibling of the canvas **inside** `.canvas-wrapper` (bottom-left so it does not cover `.stage-corner` at top-right):
```html
<div class="canvas-wrapper">
  <canvas id="visualizer-canvas" width="800" height="800" role="img" aria-label="Visual score rendering"></canvas>
  <div class="stage-corner">DETERMINISTIC<br>VISUALIZATION</div>
  <div id="viewport-hud" class="viewport-hud" aria-label="Viewport Controls">
    <button type="button" id="hud-zoom-in" class="hud-btn" title="Zoom In (+)">+</button>
    <button type="button" id="hud-zoom-out" class="hud-btn" title="Zoom Out (-)">-</button>
    <button type="button" id="hud-reset" class="hud-btn" title="Reset View (R)">Reset</button>
    <label class="hud-badge" title="Auto-zoom active region">
      <input type="checkbox" id="hud-autozoom-toggle" checked />
      <span>Auto</span>
    </label>
  </div>
</div>
```

Insert Section 05 **after** the Export section (`04`) in the sidebar:
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
      <button type="button" class="btn" id="btn-reset-viewport">Reset framing</button>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Add CSS rules in `src/ui/styles/main.css`**

```css
#visualizer-canvas { touch-action: none; }
.viewport-hud {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 5;
  pointer-events: auto;
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 6px 8px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: rgba(13, 22, 40, 0.82);
  backdrop-filter: blur(8px);
}
.hud-btn {
  min-width: 32px;
  min-height: 32px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: #16243e;
  color: var(--ink);
  font: 700 14px Manrope, sans-serif;
  cursor: pointer;
}
.hud-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #b7c3d8;
  font: 11px 'DM Mono', monospace;
}
```

Keep `.canvas-wrapper::before` and `.stage-corner` at `pointer-events: none` so they do not steal clicks from the HUD/canvas.

- [ ] **Step 3: Create `ViewportGestures` in `src/ui/viewportGestures.ts`**

Create `src/ui/viewportGestures.ts`. Coordinates are always **logical geometry pixels** (`previewSize × previewSize`), never DPR buffer pixels (`canvas.width`).

```typescript
import { ViewportController } from '../core/layout/viewportController.js';

/**
 * Maps wheel / drag / pinch DOM events on the preview canvas to ViewportController.
 * Inputs: canvas element, controller, logical preview size (e.g. 900), onUpdate callback.
 * Outputs: side-effecting controller mutations + onUpdate() after each gesture.
 */
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

  /** CSS display → logical geometry space (not canvas.width / DPR buffer). */
  private getLogicalCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.previewSize / Math.max(1, rect.width);
    const scaleY = this.previewSize / Math.max(1, rect.height);
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  private cssToLogicalDelta(dxCss: number, dyCss: number): { dx: number; dy: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      dx: dxCss * (this.previewSize / Math.max(1, rect.width)),
      dy: dyCss * (this.previewSize / Math.max(1, rect.height)),
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
        const { dx, dy } = this.cssToLogicalDelta(event.clientX - lastPt.x, event.clientY - lastPt.y);
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
      // If one finger remains after pinch, re-arm drag from current position
      if (this.activePointers.size === 1) {
        const remaining = [...this.activePointers.values()][0];
        isDragging = true;
        lastPt = { x: remaining.x, y: remaining.y };
      }
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);
  }
}
```

- [ ] **Step 4: Update `src/ui/app.ts` to wire gestures, HUD/sidebar, live preview, tick auto-zoom, and export scaling**

Add named constants near the top of the module (or as private statics on the class):
```typescript
const PREVIEW_SIZE = 900;
const EXPORT_SIZE = 1200;
```

Instantiate once in the constructor (after canvas renderer):
```typescript
this.viewportController = new ViewportController();
this.viewportGestures = new ViewportGestures(
  this.element<HTMLCanvasElement>('visualizer-canvas'),
  this.viewportController,
  PREVIEW_SIZE,
  () => this.render()
);
```

In `setScore()`, after assigning the score, call `this.viewportController.resetView()`.

**Live preview `render()`** — always pass viewport; project UI from controller:
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
  this.element<HTMLInputElement>('progress-scrubber').value = String(
    Math.round(this.currentTime / Math.max(this.currentScore.duration, 0.01) * 1000)
  );
  this.element<HTMLOutputElement>('time-display').value =
    `${formatTime(this.currentTime)} / ${formatTime(this.currentScore.duration)}`;
  this.updateViewportUi();
}
```

**`tick()` auto-zoom (playback only)** — step before draw:
```typescript
private tick = (): void => {
  if (!this.isPlaying) return;
  this.currentTime = Math.min(
    this.currentScore.duration,
    this.playbackOffset + (performance.now() - this.playbackStart) / 1000
  );
  const geometry = this.geometryFor(PREVIEW_SIZE);
  this.viewportController.stepAutoZoom(geometry, this.currentTime, PREVIEW_SIZE, PREVIEW_SIZE);
  this.render();
  if (this.currentTime >= this.currentScore.duration) this.pause();
  else this.animationFrameId = requestAnimationFrame(this.tick);
};
```

Note: scrubber `input` handler keeps `pause()` + `currentTime` + `render()` only — no `stepAutoZoom`.

**`updateViewportUi()`** — controller → DOM (avoid feedback loops by writing values, not dispatching input events):
```typescript
private updateViewportUi(): void {
  const vp = this.viewportController.getViewport();
  const zoomRange = this.element<HTMLInputElement>('viewport-zoom-range');
  const zoomOut = this.element<HTMLOutputElement>('val-viewport-zoom');
  const hudAuto = this.element<HTMLInputElement>('hud-autozoom-toggle');
  const panelAuto = this.element<HTMLInputElement>('viewport-autozoom-toggle');

  if (Number(zoomRange.value) !== vp.zoom) zoomRange.value = String(vp.zoom);
  zoomOut.value = `${Math.round(vp.zoom * 100)}%`;
  if (hudAuto.checked !== vp.autoZoom) hudAuto.checked = vp.autoZoom;
  if (panelAuto.checked !== vp.autoZoom) panelAuto.checked = vp.autoZoom;
}
```

**HUD + sidebar event wiring** (in `bindEvents()`):
```typescript
const center = PREVIEW_SIZE / 2;
this.element<HTMLButtonElement>('hud-zoom-in').addEventListener('click', () => {
  const z = this.viewportController.getViewport().zoom;
  this.viewportController.zoomAt(z * 1.25, center, center, PREVIEW_SIZE, PREVIEW_SIZE);
  this.render();
});
this.element<HTMLButtonElement>('hud-zoom-out').addEventListener('click', () => {
  const z = this.viewportController.getViewport().zoom;
  this.viewportController.zoomAt(z / 1.25, center, center, PREVIEW_SIZE, PREVIEW_SIZE);
  this.render();
});
const reset = () => { this.viewportController.resetView(); this.render(); };
this.element<HTMLButtonElement>('hud-reset').addEventListener('click', reset);
this.element<HTMLButtonElement>('btn-reset-viewport').addEventListener('click', reset);

const syncAuto = (enabled: boolean) => {
  this.viewportController.setAutoZoom(enabled);
  this.render();
};
this.element<HTMLInputElement>('hud-autozoom-toggle').addEventListener('change', (e) => {
  syncAuto((e.target as HTMLInputElement).checked);
});
this.element<HTMLInputElement>('viewport-autozoom-toggle').addEventListener('change', (e) => {
  syncAuto((e.target as HTMLInputElement).checked);
});
this.element<HTMLInputElement>('viewport-zoom-range').addEventListener('input', (e) => {
  const zoom = Number((e.target as HTMLInputElement).value);
  this.viewportController.zoomAt(zoom, center, center, PREVIEW_SIZE, PREVIEW_SIZE);
  this.render();
});
```

**Export scaling** — pan scales with resolution; zoom stays as-is (geometry already rebuilt at `EXPORT_SIZE`):
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

**Shielded keyboard shortcuts** on `window` (only `render()` when a shortcut was handled):
```typescript
window.addEventListener('keydown', (event) => {
  const t = event.target;
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
  if (t instanceof HTMLElement && t.isContentEditable) return;
  const center = PREVIEW_SIZE / 2;
  if (event.key === '+' || event.key === '=') {
    this.viewportController.zoomAt(this.viewportController.getViewport().zoom * 1.25, center, center, PREVIEW_SIZE, PREVIEW_SIZE);
  } else if (event.key === '-' || event.key === '_') {
    this.viewportController.zoomAt(this.viewportController.getViewport().zoom / 1.25, center, center, PREVIEW_SIZE, PREVIEW_SIZE);
  } else if (event.key === '0' || event.key === 'r' || event.key === 'R') {
    this.viewportController.resetView();
  } else if (event.key === 'a' || event.key === 'A') {
    this.viewportController.setAutoZoom(!this.viewportController.getViewport().autoZoom);
  } else {
    return;
  }
  this.render();
});
```

Also replace remaining `geometryFor(900)` / `geometryFor(1200)` call sites with `PREVIEW_SIZE` / `EXPORT_SIZE`.

- [ ] **Step 5: Run `npm run validate` to test full application build**

Run: `npm run validate`
Expected: PASS (all tests pass, type-check passes, vite build succeeds)

- [ ] **Step 6: Commit** (optional — only if user asked)

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

Add under `[Unreleased]` → `Added` (annotate MINOR SemVer impact per changelog conventions):
- Interactive canvas preview zoom and pan with mouse wheel, click-drag, touch pinch/pan, HUD overlay, and keyboard shortcuts (`+`/`-`/`R`/`A`).
- Dynamic playback auto-zoom tracking active note / band bounding boxes during MIDI preview, with lerp-out during silence.
- Viewport framing preservation across SVG, PNG, and pen-plotter exports with proportional pan scaling (plotter exports inherit the same cropped framing).

- [ ] **Step 3: Update `ARCHITECTURE.md` and `DESIGN.md`**

`ARCHITECTURE.md`:
- Document `ViewportTransform`, `ViewportController`, and pure helpers under domain/layout contracts.
- Note runtime flow: gestures / tick auto-zoom → controller → Canvas preview; export path scales pan via `EXPORT_SIZE / PREVIEW_SIZE`.
- Note CLI remains unscoped (identity framing).

`DESIGN.md` (Canvas and export aesthetic):
- Preview supports interactive zoom/pan; legend and title stay screen-fixed while score geometry transforms.
- Auto-zoom tracks the active region during playback and eases out during silence; manual gestures disable auto-zoom until Reset / `R` / new score.
- Exports match the preview framing; plotter SVG receives the same transform (no legend/background as today).

- [ ] **Step 4: Run complete validation suite**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 5: Commit** (optional — only if user asked)

```bash
git add CHANGELOG.md dev-docs/TO_DO.md ARCHITECTURE.md DESIGN.md
git commit -m "docs: update CHANGELOG, ARCHITECTURE, DESIGN, and TO_DO for zoom/pan feature"
```
