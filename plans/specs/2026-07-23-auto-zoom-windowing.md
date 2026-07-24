# Design Spec: Configurable Auto-Zoom Musical & Time Windowing

Date: 2026-07-23
Status: Approved (Revised 2026-07-23 — plan review)

## Overview

This specification defines configurable musical (bars/notes) and time-based (seconds) sampling windows for dynamic playback auto-zoom in AudioVisualizer.

## Requirements & Goals

1. **Dual Sampling Modes**: Allow users to configure auto-zoom sampling either in **Musical Units** (notes and bars: $1/16$, $1/8$, $1/4$, $1/2$, $1\text{ bar}$, $2\text{ bars}$, $4\text{ bars}$, $8\text{ bars}$, $16\text{ bars}$, $\text{Full Track}$) or **Time Units** ($0\text{s}$ to $30\text{s}$, plus $\text{Full Track}$).
2. **BPM-Aware Musical Conversion**: Convert musical bars/notes to seconds using score BPM on `RenderedGeometry.bpm` (copied from `Score.bpm`). **v1 assumes 4/4** (4 beats per bar). Note-value labels are fractions of a 4/4 bar. Mid-score tempo maps and time-signature changes are out of scope.
3. **Symmetric Window Sampling**: Sample active notes/bands within a symmetric window $[t - W/2, t + W/2]$ around current playback time $t$ to provide balanced leading (upcoming) and trailing (recent) note context. $W = 0$ keeps instantaneous “currently sounding” semantics.
4. **UI Integration**: Provide a mode toggle `[ Musical | Time ]`, discrete step sliders, and canvas HUD label sync in Section 05 ("Viewport & Framing"). HUD copy stays plain text (no emoji), e.g. `Auto · 4 bars`.

## Data Model & Domain Types

Extend `ViewportTransform` / `DEFAULT_VIEWPORT` and `RenderedGeometry` in `src/core/types.ts`. Do **not** put BPM on `RuleConfig` (tempo is score metadata, not a mapping rule).

```typescript
export type AutoZoomWindowMode = 'musical' | 'time';

export interface ViewportTransform {
  zoom: number;
  panX: number;
  panY: number;
  autoZoom: boolean;
  autoZoomMode: AutoZoomWindowMode;
  autoZoomWindowBars: number;       // Range: [0.0625, Infinity] (default: 4)
  autoZoomWindowSeconds: number;    // Range: [0, Infinity] (default: 3)
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
  bpm: number; // from Score.bpm via mapScoreToGeometry
}
```

## Architecture & Components

### 1. BPM-Aware Duration Helper (`src/core/layout/viewportController.ts`)

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
```

### 2. Symmetric Window Note Sampler (`src/core/layout/viewportController.ts`)

Update `calculateActiveNotesBoundingBox(geometry, currentTime, windowSeconds = 0)`:
- If `windowSeconds === 0` (default): `currentTime` inside `[onset, onset + duration]` (legacy instantaneous behavior).
- If `windowSeconds === Infinity`: Include all non-gap notes/bands eligible today.
- Otherwise (`windowSeconds > 0`): Overlap test `onset <= tMax && (onset + duration) >= tMin`, where $tMin = currentTime - windowSeconds / 2$ and $tMax = currentTime + windowSeconds / 2$.

`stepAutoZoom` always passes `calculateWindowSeconds(...)` as `windowSeconds`.

`calculateAutoZoomTransform` must spread `...current` so mode/window fields are not wiped each lerp frame.

### 3. UI Layer Integration (`src/ui/app.ts`, `index.html`, `src/ui/styles/main.css`)

- **Sidebar Section 05**:
  - Mode toggle: segmented control (`#btn-mode-musical` / `#btn-mode-time`) with `type="button"` and `aria-pressed`.
  - Musical slider (`#viewport-bars-range`): integer indices → `[0.0625, 0.125, 0.25, 0.5, 1, 2, 4, 8, 16, Infinity]` (default index 6 → 4 bars).
  - Time slider (`#viewport-seconds-range`): integer indices → `0..30` plus `Infinity` Full Track (default index 3 → 3s).
- **Canvas HUD Badge**:
  - Plain-text readout e.g. `Auto · 4 bars`, `Auto · 3s`, `Auto · full`.
- **Bidirectional UI Synchronization**:
  - `updateViewportUi()` projects controller state to mode buttons, slider wrappers (`.is-hidden`), outputs, and HUD label on render / reset / MIDI load.
  - Changing window settings must not clear `autoZoom`.

## Testing & Verification

1. **Unit Tests (`tests/viewportController.test.ts`, `tests/viewportTypes.test.ts`)**:
   - `calculateWindowSeconds` at 120 BPM (4 bars = 8s) and 60 BPM (4 bars = 16s); time mode; Infinity.
   - Symmetric window, W=0 / omitted default, Infinity.
   - `calculateAutoZoomTransform` preserves mode/window fields.
   - Existing instantaneous bounding-box tests remain valid with default `windowSeconds = 0`.
2. **Local Validation**:
   - Run `npm run validate` (tests, type-check, production build).
