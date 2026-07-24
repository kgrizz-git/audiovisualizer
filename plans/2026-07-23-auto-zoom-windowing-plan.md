# Configurable Auto-Zoom Musical & Time Windowing Implementation Plan

Status: approved (revised after plan review 2026-07-23)
Last reviewed: 2026-07-23

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Commits:** Per-task `git commit` steps are optional checkpoints. Only commit when the user explicitly asks (project commit policy).

**Goal:** Let users configure how wide a temporal region auto-zoom frames during playback — either in musical units (1/16 note through 16 bars, plus Full Track; default 4 bars) or wall-clock seconds (0s–30s, plus Full Track; default 3s) — with BPM-aware conversion and symmetric sampling around the playhead.

**Architecture:** Extend `ViewportTransform` with `autoZoomMode`, `autoZoomWindowBars`, and `autoZoomWindowSeconds`. Put score tempo on `RenderedGeometry.bpm` (not `RuleConfig` — tempo is score metadata, not a mapping rule). Add `calculateWindowSeconds` in `viewportController.ts`. Broaden `calculateActiveNotesBoundingBox` to optional symmetric window sampling. Preserve window fields through `calculateAutoZoomTransform` via `...current`. Wire Section 05 mode toggle + discrete sliders and sync the HUD badge text.

**Tech Stack:** TypeScript, HTML5 Canvas, Vitest, Vite.

**Spec:** [`plans/specs/2026-07-23-auto-zoom-windowing.md`](specs/2026-07-23-auto-zoom-windowing.md)

## Global Constraints

- Keep MIDI parser, score-to-geometry mapper, and layout fitters deterministic and side-effect free.
- Browser MIDI file handling stays local; no telemetry; no remote user data upload.
- Must pass `npm run validate` (type-checking, Vitest tests, production build).
- Update `ARCHITECTURE.md`, `DESIGN.md`, `CHANGELOG.md` (MINOR), and `dev-docs/TO_DO.md`.

## Out of scope

- Parsing / applying MIDI time-signature changes (v1 assumes **4/4**: 4 beats per bar). Note-value labels (1/16, 1/8, …) are fractions of a 4/4 bar.
- Mid-score tempo map / multiple tempos (v1 uses the single `Score.bpm` already produced by the parser — first tempo, else 120).
- Time-indexed acceleration of bounds scans (O(N) per frame remains acceptable).
- Changing when auto-zoom runs (still only while playing, inside `tick()`; scrubber seeks still do not call `stepAutoZoom`).
- CLI viewport framing (CLI stays full-score fit).

## Behavior decisions (explicit)

| Topic | Decision |
|---|---|
| Default mode | `musical`, `autoZoomWindowBars = 4`, `autoZoomWindowSeconds = 3` (seconds value kept for when user switches to time mode). |
| Meter | Hardcoded 4 beats/bar. Musical duration: `bars * (4 * 60 / bpm)`. |
| BPM source | `geometry.bpm` from `mapScoreToGeometry(score)` (`score.bpm`). Fallback `120` only if missing/non-positive. |
| Window geometry | Symmetric $[t - W/2,\ t + W/2]$. Overlap if `onset <= tMax && end >= tMin`. |
| `W === 0` | Instantaneous: note must contain `currentTime` (legacy “currently sounding” behavior). Time-mode slider includes 0s. |
| `W === Infinity` (Full Track) | Include all non-gap notes/circles (and band fallback as today). |
| Mode switch | Keep both stored values; only `autoZoomMode` changes which slider is active / which duration is used. |
| Manual override | Unchanged: pan/zoom clears `autoZoom`; window controls do **not** clear it. |
| Lerp return shape | `calculateAutoZoomTransform` **must** `...current` so mode/window fields are not wiped every frame. |
| HUD copy | Plain text, no emoji — e.g. `Auto · 4 bars` / `Auto · 3s` / `Auto · full` (match existing HUD tone). |
| Inactive auto-zoom | Window controls remain editable so the next enable/reset uses the chosen window. |

## Discrete slider maps

```typescript
export const AUTO_ZOOM_BAR_STEPS = [0.0625, 0.125, 0.25, 0.5, 1, 2, 4, 8, 16, Infinity] as const;
export const AUTO_ZOOM_BAR_LABELS = [
  '1/16 note', '1/8 note', '1/4 note', '1/2 note',
  '1 bar', '2 bars', '4 bars', '8 bars', '16 bars', 'Full track',
] as const;
// index 6 → 4 bars (default)

export const AUTO_ZOOM_SECOND_STEPS = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30, Infinity,
] as const;
// index 3 → 3s (default); index 31 → Full track
```

HTML ranges use integer indices (`bars` min=0 max=9; `seconds` min=0 max=31), never raw `Infinity` in the DOM.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `calculateAutoZoomTransform` drops new fields each lerp | high if missed | window settings reset every frame | Spread `...current`; unit-test field preservation |
| Putting BPM on `RuleConfig` pollutes mapping rules | med | confusing contracts / accidental equality churn | Prefer `RenderedGeometry.bpm` |
| Incomplete `ViewportTransform` literals fail typecheck | high | validate fails | Spread `DEFAULT_VIEWPORT` in tests/render fixtures |
| 4/4 assumption wrong for waltzes etc. | med | musical window length off | Document in UI/docs; defer time-sig to a follow-up |
| Existing bounding-box tests assume instantaneous window | high | false failures if default window ≠ 0 | Third arg default `0`; `stepAutoZoom` always passes computed `W` |

---

### Task 1: Domain Types — Window Settings & Geometry BPM

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/mapper/scoreMapper.ts` (both return paths: path geometry + tonal time-lines)
- Test: `tests/viewportTypes.test.ts`
- Also update type-literal fixtures that construct `ViewportTransform` / `RenderedGeometry`:
  - `tests/viewportController.test.ts` (equality expectations + `bpm` on mocks)
  - `tests/viewportRenderers.test.ts` (spread `DEFAULT_VIEWPORT` into viewport options)
  - `tests/layout.test.ts` if it builds `RenderedGeometry` without `bpm`

**Interfaces:**
- Consumes: Existing `ViewportTransform`, `DEFAULT_VIEWPORT`, `RenderedGeometry`, `mapScoreToGeometry`
- Produces: `AutoZoomWindowMode`, extended `ViewportTransform` / `DEFAULT_VIEWPORT`, `RenderedGeometry.bpm`

- [ ] **Step 1: Write the failing test**

Extend `tests/viewportTypes.test.ts` (keep existing clampZoom coverage):
```typescript
import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEWPORT, ViewportTransform, clampZoom } from '../src/core/types.js';
import { mapScoreToGeometry, DEFAULT_CONFIG } from '../src/core/mapper/scoreMapper.js';
import { generateDemoScore } from '../src/core/midi/parser.js';

describe('Viewport Domain Types Extension', () => {
  it('includes default autoZoomMode, autoZoomWindowBars, and autoZoomWindowSeconds', () => {
    const vp: ViewportTransform = DEFAULT_VIEWPORT;
    expect(vp.autoZoomMode).toBe('musical');
    expect(vp.autoZoomWindowBars).toBe(4);
    expect(vp.autoZoomWindowSeconds).toBe(3);
  });

  it('propagates bpm from score onto RenderedGeometry.bpm', () => {
    const score = generateDemoScore();
    const geometry = mapScoreToGeometry(score, DEFAULT_CONFIG, 900, 900);
    expect(geometry.bpm).toBe(score.bpm);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/viewportTypes.test.ts`
Expected: FAIL (`autoZoomMode` / `geometry.bpm` undefined)

- [ ] **Step 3: Implement domain types**

In `src/core/types.ts`:
```typescript
export type AutoZoomWindowMode = 'musical' | 'time';

export interface ViewportTransform {
  zoom: number;
  panX: number;
  panY: number;
  autoZoom: boolean;
  autoZoomMode: AutoZoomWindowMode;
  /** Musical window in bars (4/4). Use Infinity for full track. */
  autoZoomWindowBars: number;
  /** Wall-clock window in seconds. Use Infinity for full track. */
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

export interface RenderedGeometry {
  width: number;
  height: number;
  voicePaths: GeometryVoicePath[];
  bands: GeometryBand[];
  config: RuleConfig;
  /** Score tempo used for musical window conversion (beats per minute). */
  bpm: number;
}
```

Do **not** add `bpm` to `RuleConfig`.

In `mapScoreToGeometry`, both return sites:
```typescript
return {
  width: targetWidth,
  height: targetHeight,
  voicePaths: /* ... */,
  bands: /* ... */,
  config,
  bpm: score.bpm,
};
```

Update existing tests that assert `getViewport()` / `DEFAULT_VIEWPORT` equality to include the new fields, and add `bpm` to hand-built geometries (typically `bpm: 120`). **Crucial:** Do not forget to update the `mockGeometry` inside `tests/viewportController.test.ts` (around line 105) which is used in `stepAutoZoom` tests; it will need `bpm: 120` to compile.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/viewportTypes.test.ts tests/viewportController.test.ts tests/viewportRenderers.test.ts tests/layout.test.ts`
Expected: PASS (after fixture updates)

- [ ] **Step 5: Commit (optional — only if user asks)**

```bash
git add src/core/types.ts src/core/mapper/scoreMapper.ts tests/viewportTypes.test.ts tests/viewportController.test.ts tests/viewportRenderers.test.ts tests/layout.test.ts
git commit -m "feat(core): add auto-zoom window fields and RenderedGeometry.bpm"
```

---

### Task 2: BPM-Aware Duration Helper & Windowed Bounding Box Sampling

**Files:**
- Modify: `src/core/layout/viewportController.ts`
- Test: `tests/viewportController.test.ts`

**Interfaces:**
- Consumes: `ViewportTransform`, `RenderedGeometry`
- Produces: `calculateWindowSeconds`, updated `calculateActiveNotesBoundingBox`, fixed `calculateAutoZoomTransform`, updated `stepAutoZoom`

- [ ] **Step 1: Write failing tests**

Add (do not replace) coverage in `tests/viewportController.test.ts`:
```typescript
describe('BPM-Aware Window Calculation & Symmetric Note Sampling', () => {
  const mockGeometry: RenderedGeometry = {
    width: 800,
    height: 600,
    bands: [],
    config: DEFAULT_CONFIG,
    bpm: 120,
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
            note: { id: 'n1', pitch: 60, onset: 0, duration: 1, velocity: 80, voice: 0, pitchClass: 0 },
          },
          {
            start: { x: 500, y: 500 },
            end: { x: 600, y: 600 },
            color: '#00ff00',
            width: 2,
            opacity: 1,
            note: { id: 'n2', pitch: 64, onset: 3, duration: 1, velocity: 80, voice: 0, pitchClass: 4 },
          },
        ],
        circles: [],
      },
    ],
  };

  it('calculates musical window seconds at 120 BPM and 60 BPM', () => {
    const vp = { ...DEFAULT_VIEWPORT, autoZoomMode: 'musical' as const, autoZoomWindowBars: 4 };
    // 120 BPM → 0.5s/beat → 2s/bar → 4 bars = 8s
    expect(calculateWindowSeconds(mockGeometry, vp)).toBe(8);
    expect(calculateWindowSeconds({ ...mockGeometry, bpm: 60 }, vp)).toBe(16);
  });

  it('returns time-mode seconds and Infinity for full-track musical window', () => {
    expect(calculateWindowSeconds(mockGeometry, {
      ...DEFAULT_VIEWPORT,
      autoZoomMode: 'time',
      autoZoomWindowSeconds: 3,
    })).toBe(3);
    expect(calculateWindowSeconds(mockGeometry, {
      ...DEFAULT_VIEWPORT,
      autoZoomMode: 'musical',
      autoZoomWindowBars: Infinity,
    })).toBe(Infinity);
  });

  it('samples notes within a symmetric window around currentTime', () => {
    // currentTime=2, W=5 → [-0.5, 4.5]; both n1 and n2 overlap
    expect(calculateActiveNotesBoundingBox(mockGeometry, 2, 5)).toEqual({
      minX: 100, minY: 100, maxX: 600, maxY: 600,
    });
  });

  it('uses instantaneous active-note semantics when windowSeconds is 0 or omitted', () => {
    expect(calculateActiveNotesBoundingBox(mockGeometry, 0.5, 0)).toEqual({
      minX: 100, minY: 100, maxX: 200, maxY: 200,
    });
    // Default third arg = 0 preserves pre-windowing tests / callers
    expect(calculateActiveNotesBoundingBox(mockGeometry, 0.5)).toEqual({
      minX: 100, minY: 100, maxX: 200, maxY: 200,
    });
  });

  it('includes all notes when windowSeconds is Infinity', () => {
    expect(calculateActiveNotesBoundingBox(mockGeometry, 0, Infinity)).toEqual({
      minX: 100, minY: 100, maxX: 600, maxY: 600,
    });
  });

  it('preserves window fields through calculateAutoZoomTransform', () => {
    const current = {
      ...DEFAULT_VIEWPORT,
      autoZoomMode: 'time' as const,
      autoZoomWindowSeconds: 7,
      autoZoomWindowBars: 2,
    };
    const next = calculateAutoZoomTransform(current, null, 800, 600, 1);
    expect(next.autoZoomMode).toBe('time');
    expect(next.autoZoomWindowSeconds).toBe(7);
    expect(next.autoZoomWindowBars).toBe(2);
    expect(next.autoZoom).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/viewportController.test.ts`
Expected: FAIL (`calculateWindowSeconds` not exported / field wipe)

- [ ] **Step 3: Implement helpers**

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

  const bpm = geometry.bpm > 0 ? geometry.bpm : 120;
  const beatsPerBar = 4; // v1: fixed 4/4
  const barSeconds = (beatsPerBar * 60) / bpm;
  return viewport.autoZoomWindowBars * barSeconds;
}

export function calculateActiveNotesBoundingBox(
  geometry: RenderedGeometry,
  currentTime: number,
  windowSeconds = 0
): BoundingBox | null {
  // windowSeconds === 0 → instantaneous (currentTime inside [onset, end])
  // windowSeconds === Infinity → all non-gap geometry
  // else → overlap with [currentTime - W/2, currentTime + W/2]
  //
  // Keep existing gap exclusion, circle bounds, and tonal-band fallback
  // (bands only when no voice-path hits).
}

export function calculateAutoZoomTransform(/* ... */): ViewportTransform {
  // ... existing target zoom/pan math ...
  return {
    ...current, // CRITICAL: preserve mode + window fields
    zoom: current.zoom + (targetTransform.zoom - current.zoom) * lerpFactor,
    panX: current.panX + (targetTransform.panX - current.panX) * lerpFactor,
    panY: current.panY + (targetTransform.panY - current.panY) * lerpFactor,
    autoZoom: true,
  };
}

// ViewportController.stepAutoZoom:
public stepAutoZoom(geometry: RenderedGeometry, currentTime: number, width: number, height: number): void {
  if (!this.viewport.autoZoom) return;
  const windowSec = calculateWindowSeconds(geometry, this.viewport);
  const bounds = calculateActiveNotesBoundingBox(geometry, currentTime, windowSec);
  this.viewport = calculateAutoZoomTransform(this.viewport, bounds, width, height);
}
```

Optional but recommended: thin setters that do not clear `autoZoom`:
`setAutoZoomMode`, `setAutoZoomWindowBars`, `setAutoZoomWindowSeconds` (or document that `setViewport({ autoZoomMode / … })` already leaves `autoZoom` alone when zoom/pan unchanged).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/viewportController.test.ts`
Expected: PASS

- [ ] **Step 5: Commit (optional — only if user asks)**

```bash
git add src/core/layout/viewportController.ts tests/viewportController.test.ts
git commit -m "feat(core): BPM-aware auto-zoom windows with symmetric sampling"
```

---

### Task 3: UI Integration (Sidebar Mode Toggle, Sliders & HUD Badge)

**Files:**
- Modify: `index.html` (insert into existing Section 05; do not rewrite unrelated controls)
- Modify: `src/ui/styles/main.css`
- Modify: `src/ui/app.ts`

**Interfaces:**
- Consumes: Updated `ViewportController`
- Produces: Mode toggle, bars/seconds sliders, HUD badge text sync

- [ ] **Step 1: Extend Section 05 & HUD in `index.html`**

Insert window controls **after** the auto-zoom toggle and **before** Reset framing. Keep existing zoom range + toggle IDs.

```html
<div class="control-subgroup" id="autozoom-window-controls">
  <span class="control-label" id="autozoom-mode-label">Window sampling mode</span>
  <div class="segmented-control" role="group" aria-labelledby="autozoom-mode-label">
    <button type="button" id="btn-mode-musical" class="is-active" aria-pressed="true">Musical</button>
    <button type="button" id="btn-mode-time" aria-pressed="false">Time</button>
  </div>
  <div id="wrapper-bars-range">
    <label for="viewport-bars-range">Window size</label>
    <input id="viewport-bars-range" type="range" min="0" max="9" step="1" value="6" />
    <output id="val-viewport-bars" for="viewport-bars-range">4 bars</output>
  </div>
  <div id="wrapper-seconds-range" class="is-hidden">
    <label for="viewport-seconds-range">Window size</label>
    <input id="viewport-seconds-range" type="range" min="0" max="31" step="1" value="3" />
    <output id="val-viewport-seconds" for="viewport-seconds-range">3s</output>
  </div>
</div>
```

Update HUD badge label span (keep checkbox) so `updateViewportUi` can set text, e.g. wrap copy in `<span id="hud-autozoom-label">Auto</span>`. (Currently, the text "Auto" in `index.html` is inside a generic `<span>`, so you must add the `id="hud-autozoom-label"` attribute to it).

- [ ] **Step 2: CSS for `.segmented-control`, `.control-subgroup`, `.is-hidden`**

Match existing sidebar density (no new card chrome). `.is-hidden { display: none; }`. Segmented buttons should look like compact peer toggles, not primary CTAs.

- [ ] **Step 3: Wire controls in `src/ui/app.ts`**

- Import or locally define `AUTO_ZOOM_BAR_STEPS` / `AUTO_ZOOM_BAR_LABELS` / `AUTO_ZOOM_SECOND_STEPS` (prefer exporting constants from `viewportController.ts` or a tiny `src/core/layout/autoZoomWindow.ts` if `app.ts` would otherwise duplicate magic arrays).
- Mode buttons: set `autoZoomMode`, toggle `.is-active` + `aria-pressed`, show/hide wrappers.
- Bars slider: index → `AUTO_ZOOM_BAR_STEPS[i]`; label from `AUTO_ZOOM_BAR_LABELS[i]`.
- Seconds slider: index → `AUTO_ZOOM_SECOND_STEPS[i]`; label `Full track` or `${n}s`.
- `updateViewportUi()`: project controller → HUD label (`Auto · 4 bars` / `Auto · 3s` / `Auto · full`), slider indices (findIndex; treat non-finite as last step), mode button state, wrapper visibility.
- Changing window settings must not disable auto-zoom.

- [ ] **Step 4: Run `npm run validate`**

Expected: PASS

- [ ] **Step 5: Commit (optional — only if user asks)**

```bash
git add index.html src/ui/styles/main.css src/ui/app.ts src/core/layout/viewportController.ts
git commit -m "feat(ui): musical vs time auto-zoom window controls"
```

---

### Task 4: Documentation & Validation

**Files:**
- Modify: `CHANGELOG.md` (Unreleased **Added**, SemVer **MINOR**)
- Modify: `dev-docs/TO_DO.md` (add/complete backlog item linking this plan — note that the item does not currently exist, so you must write the new item bullet and check it off simultaneously)
- Modify: `ARCHITECTURE.md` (ViewportTransform fields, `RenderedGeometry.bpm`, window helper)
- Modify: `DESIGN.md` (auto-zoom window modes, 4/4 assumption, HUD copy)

- [ ] **Step 1: Update docs**

Call out: configurable musical/time windows; default 4 bars musical; symmetric sampling; v1 fixed 4/4 + single BPM; no RuleConfig BPM.

- [ ] **Step 2: Run `npm run validate`**

Expected: PASS

- [ ] **Step 3: Commit (optional — only if user asks)**

```bash
git add CHANGELOG.md CHANGELOG.dev.md dev-docs/TO_DO.md ARCHITECTURE.md DESIGN.md plans/specs/2026-07-23-auto-zoom-windowing.md
git commit -m "docs: document configurable auto-zoom musical and time windowing"
```

## Verification

- [ ] Unit: musical conversion at 120 and 60 BPM; time mode; Infinity full-track
- [ ] Unit: symmetric overlap, W=0 instantaneous, omitted W defaults to 0
- [ ] Unit: lerp preserves mode/window fields
- [ ] Manual: playback with default 4-bar window frames leading + trailing notes
- [ ] Manual: switch to time 0s ≈ old instantaneous framing; Full track ≈ whole score bounds
- [ ] Manual: HUD + sidebar stay in sync on reset / MIDI load
- [ ] `npm run validate` passes

## Open questions

None blocking. Follow-ups (not this plan): MIDI time-signature awareness; tempo-map aware windows.
