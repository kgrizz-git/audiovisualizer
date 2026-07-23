# Configurable Auto-Zoom Musical & Time Windowing Implementation Plan

Status: ready for implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable musical (bars/notes: 1/16 to 16 bars, default 4 bars) and time-based (0s to 30s, default 3s) windowing options with BPM-aware conversion and symmetric sampling to playback auto-zoom.

**Architecture:** Extend `ViewportTransform` with `autoZoomMode`, `autoZoomWindowBars`, and `autoZoomWindowSeconds`. Add `calculateWindowSeconds` in `src/core/layout/viewportController.ts` to convert musical bars/notes to seconds using score BPM. Update `calculateActiveNotesBoundingBox` to sample active notes within a symmetric time window $[t - W/2, t + W/2]$. Update sidebar Section 05 and canvas HUD in `app.ts` with a mode toggle and synchronized sliders.

**Tech Stack:** TypeScript, HTML5 Canvas, Vitest, Vite.

**Spec:** [`plans/specs/2026-07-23-auto-zoom-windowing.md`](specs/2026-07-23-auto-zoom-windowing.md)

## Global Constraints

- Keep MIDI parser, score-to-geometry mapper, and layout fitters deterministic and side-effect free.
- Browser MIDI file handling stays local; no telemetry; no remote user data upload.
- Must pass `npm run validate` (type-checking, Vitest tests, production build).
- Update `ARCHITECTURE.md`, `DESIGN.md`, `CHANGELOG.md` (MINOR), and `dev-docs/TO_DO.md`.

---

### Task 1: Domain Types Extension for Windowing Settings

**Files:**
- Modify: `src/core/types.ts`
- Test: `tests/viewportTypes.test.ts`

**Interfaces:**
- Consumes: Existing `ViewportTransform` and `DEFAULT_VIEWPORT` in `src/core/types.ts`
- Produces: `AutoZoomWindowMode`, updated `ViewportTransform`, updated `DEFAULT_VIEWPORT`

- [ ] **Step 1: Write the failing test**

Update `tests/viewportTypes.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEWPORT, ViewportTransform, clampZoom } from '../src/core/types.js';

describe('Viewport Domain Types Extension', () => {
  it('includes default autoZoomMode, autoZoomWindowBars, and autoZoomWindowSeconds', () => {
    const vp: ViewportTransform = DEFAULT_VIEWPORT;
    expect(vp.autoZoomMode).toBe('musical');
    expect(vp.autoZoomWindowBars).toBe(4);
    expect(vp.autoZoomWindowSeconds).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/viewportTypes.test.ts`
Expected: FAIL with "autoZoomMode / autoZoomWindowBars undefined"

- [ ] **Step 3: Implement domain types in `src/core/types.ts`**

Update `src/core/types.ts`:
```typescript
export type AutoZoomWindowMode = 'musical' | 'time';

export interface ViewportTransform {
  zoom: number;
  panX: number;
  panY: number;
  autoZoom: boolean;
  autoZoomMode: AutoZoomWindowMode;
  autoZoomWindowBars: number;
  autoZoomWindowSeconds: number;
}

export const DEFAULT_VIEWPORT: Readonly<ViewportTransform> = Object.freeze({
  zoom: 1,
  panX: 0,
  panY: 0,
  autoZoom: true,
  autoZoomMode: 'musical',
  autoZoomWindowBars: 4,
  autoZoomWindowSeconds: 3,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/viewportTypes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts tests/viewportTypes.test.ts
git commit -m "feat(core): extend ViewportTransform with musical and time auto-zoom window fields"
```

---

### Task 2: BPM-Aware Duration Helper & Windowed Bounding Box Sampling

**Files:**
- Modify: `src/core/layout/viewportController.ts`
- Test: `tests/viewportController.test.ts`

**Interfaces:**
- Consumes: `ViewportTransform`, `RenderedGeometry`
- Produces: `calculateWindowSeconds`, updated `calculateActiveNotesBoundingBox`, updated `ViewportController`

- [ ] **Step 1: Write failing tests for window calculation and symmetric sampling**

Update `tests/viewportController.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import { ViewportController, calculateActiveNotesBoundingBox, calculateWindowSeconds } from '../src/core/layout/viewportController.js';
import { RenderedGeometry, DEFAULT_VIEWPORT } from '../src/core/types.js';
import { DEFAULT_CONFIG } from '../src/core/mapper/scoreMapper.js';

describe('BPM-Aware Window Calculation & Symmetric Note Sampling', () => {
  const mockGeometry: RenderedGeometry = {
    width: 800,
    height: 600,
    bands: [],
    config: { ...DEFAULT_CONFIG, bpm: 120 },
    voicePaths: [
      {
        voice: 0,
        voiceName: 'Voice 0',
        segments: [
          {
            start: { x: 100, y: 100 },
            end: { x: 200, y: 200 },
            color: '#ff0000',
            width: 2,
            opacity: 1,
            note: { id: 'n1', pitch: 60, onset: 0, duration: 1, velocity: 80, voice: 0, pitchClass: 0 }
          },
          {
            start: { x: 500, y: 500 },
            end: { x: 600, y: 600 },
            color: '#00ff00',
            width: 2,
            opacity: 1,
            note: { id: 'n2', pitch: 64, onset: 3, duration: 1, velocity: 80, voice: 0, pitchClass: 4 }
          }
        ],
        circles: []
      }
    ]
  };

  it('calculates window duration in seconds for musical bars at 120 BPM', () => {
    const vp = { ...DEFAULT_VIEWPORT, autoZoomMode: 'musical' as const, autoZoomWindowBars: 4 };
    // 120 BPM = 0.5s per beat; 4 beats per bar = 2s per bar; 4 bars = 8s
    expect(calculateWindowSeconds(mockGeometry, vp)).toBe(8);
  });

  it('samples active notes within symmetric time window around currentTime', () => {
    // At currentTime = 2 with windowSeconds = 5 (range [-0.5, 4.5]):
    // n1 (0-1s) and n2 (3-4s) both fall inside the window
    const bounds = calculateActiveNotesBoundingBox(mockGeometry, 2, 5);
    expect(bounds).toEqual({ minX: 100, minY: 100, maxX: 600, maxY: 600 });
  });

  it('samples only currently sounding note when windowSeconds = 0', () => {
    // At currentTime = 0.5 with windowSeconds = 0: only n1 (0-1s) is active
    const bounds = calculateActiveNotesBoundingBox(mockGeometry, 0.5, 0);
    expect(bounds).toEqual({ minX: 100, minY: 100, maxX: 200, maxY: 200 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/viewportController.test.ts`
Expected: FAIL with "calculateWindowSeconds not defined"

- [ ] **Step 3: Implement `calculateWindowSeconds` and update `calculateActiveNotesBoundingBox` in `src/core/layout/viewportController.ts`**

Update `src/core/layout/viewportController.ts`:
```typescript
export function calculateWindowSeconds(
  geometry: RenderedGeometry,
  viewport: ViewportTransform
): number {
  if (viewport.autoZoomMode === 'time') {
    return viewport.autoZoomWindowSeconds;
  }

  if (!Number.isFinite(viewport.autoZoomWindowBars)) {
    return Infinity;
  }

  const bpm = geometry.config.bpm || 120;
  const beatsPerBar = 4;
  const barSeconds = (beatsPerBar * 60) / bpm;
  return viewport.autoZoomWindowBars * barSeconds;
}

export function calculateActiveNotesBoundingBox(
  geometry: RenderedGeometry,
  currentTime: number,
  windowSeconds = 3.0
): BoundingBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;

  const tMin = windowSeconds === 0 ? currentTime : (windowSeconds === Infinity ? -Infinity : currentTime - windowSeconds / 2);
  const tMax = windowSeconds === 0 ? currentTime : (windowSeconds === Infinity ? Infinity : currentTime + windowSeconds / 2);

  for (const voice of geometry.voicePaths) {
    for (const seg of voice.segments) {
      if (seg.role === 'gap') continue;
      const onset = seg.note.onset;
      const endTime = onset + seg.note.duration;
      const isOverlap = windowSeconds === 0
        ? (currentTime >= onset && currentTime <= endTime)
        : (onset <= tMax && endTime >= tMin);

      if (isOverlap) {
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
      const isOverlap = windowSeconds === 0
        ? (currentTime >= onset && currentTime <= endTime)
        : (onset <= tMax && endTime >= tMin);

      if (isOverlap) {
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
      if (band.silent) continue;
      const onset = band.onset ?? 0;
      const endTime = onset + (band.duration ?? 0);
      const isOverlap = windowSeconds === 0
        ? (currentTime >= onset && currentTime <= endTime)
        : (onset <= tMax && endTime >= tMin);

      if (isOverlap) {
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
```

Update `stepAutoZoom` in `ViewportController`:
```typescript
public stepAutoZoom(geometry: RenderedGeometry, currentTime: number, width: number, height: number): void {
  if (!this.viewport.autoZoom) return;
  const windowSec = calculateWindowSeconds(geometry, this.viewport);
  const bounds = calculateActiveNotesBoundingBox(geometry, currentTime, windowSec);
  this.viewport = calculateAutoZoomTransform(this.viewport, bounds, width, height);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/viewportController.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/layout/viewportController.ts tests/viewportController.test.ts
git commit -m "feat(core): add BPM-aware calculateWindowSeconds and symmetric window active note sampling"
```

---

### Task 3: UI Integration (Sidebar Mode Toggle, Sliders & Canvas HUD Badge)

**Files:**
- Modify: `index.html`
- Modify: `src/ui/styles/main.css`
- Modify: `src/ui/app.ts`

**Interfaces:**
- Consumes: Updated `ViewportController` from `src/core/layout/viewportController.ts`
- Produces: Sidebar Mode Toggle `[ Musical | Time ]`, Bars Slider, Seconds Slider, HUD Mode Badge

- [ ] **Step 1: Update `index.html` Section 05 & HUD**

Add Mode Toggle and Sliders to Section 05 in `index.html`:
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
    <div class="control-subgroup" id="autozoom-window-controls">
      <label>Window sampling mode</label>
      <div class="segmented-control">
        <button id="btn-mode-musical" class="is-active">Musical (Bars)</button>
        <button id="btn-mode-time">Time (Sec)</button>
      </div>
      <div id="wrapper-bars-range">
        <label for="viewport-bars-range">Window size (bars)</label>
        <input id="viewport-bars-range" type="range" min="0" max="9" step="1" value="6" />
        <output id="val-viewport-bars">4 bars</output>
      </div>
      <div id="wrapper-seconds-range" class="is-hidden">
        <label for="viewport-seconds-range">Window size (seconds)</label>
        <input id="viewport-seconds-range" type="range" min="0" max="31" step="1" value="3" />
        <output id="val-viewport-seconds">3s</output>
      </div>
    </div>
    <div class="button-grid">
      <button class="btn" id="btn-reset-viewport">Reset framing</button>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Add CSS rules in `src/ui/styles/main.css`**

Add styling for `.segmented-control`, `.control-subgroup`, and `.is-hidden`.

- [ ] **Step 3: Connect mode toggle and sliders in `src/ui/app.ts`**

Map discrete slider index to bar values:
`const BAR_STEPS = [0.0625, 0.125, 0.25, 0.5, 1, 2, 4, 8, 16, Infinity];`
`const BAR_LABELS = ['1/16 note', '1/8 note', '1/4 note', '1/2 note', '1 bar', '2 bars', '4 bars', '8 bars', '16 bars', 'Full Track'];`

Wire event listeners for mode buttons (`btn-mode-musical`, `btn-mode-time`), `#viewport-bars-range`, and `#viewport-seconds-range`.
Update `updateViewportUi()` to sync HUD badge text (e.g. `Auto (4 bars)` or `Auto (3s)`).

- [ ] **Step 4: Run `npm run validate` to test full application build**

Run: `npm run validate`
Expected: PASS (all tests pass, type-check passes, vite build succeeds)

- [ ] **Step 5: Commit**

```bash
git add index.html src/ui/styles/main.css src/ui/app.ts
git commit -m "feat(ui): add auto-zoom musical vs time window mode toggle and sliders"
```

---

### Task 4: Documentation & Validation

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `dev-docs/TO_DO.md`
- Modify: `ARCHITECTURE.md`
- Modify: `DESIGN.md`

- [ ] **Step 1: Update documentation files**

Update `CHANGELOG.md`, `ARCHITECTURE.md`, `DESIGN.md`, and `dev-docs/TO_DO.md`.

- [ ] **Step 2: Run complete validation suite**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md dev-docs/TO_DO.md ARCHITECTURE.md DESIGN.md
git commit -m "docs: update documentation for configurable musical and time auto-zoom windowing"
```
