# Design Spec: Configurable Auto-Zoom Musical & Time Windowing

Date: 2026-07-23
Status: Approved

## Overview

This specification defines configurable musical (bars/notes) and time-based (seconds) sampling windowing for dynamic playback auto-zoom in AudioVisualizer.

## Requirements & Goals

1. **Dual Sampling Modes**: Allow users to configure auto-zoom sampling either in **Musical Units** (notes and bars: $1/16$, $1/8$, $1/4$, $1/2$, $1\text{ bar}$, $2\text{ bars}$, $4\text{ bars}$, $8\text{ bars}$, $16\text{ bars}$, $\text{Full Track}$) or **Time Units** ($0\text{s}$ to $30\text{s}$, plus $\text{Full Track}$).
2. **BPM-Aware Musical Conversion**: Dynamically convert musical bars/notes to seconds using score BPM and time signature so auto-zoom framing remains musically consistent across different tempos.
3. **Symmetric Window Sampling**: Sample active notes/bands within a symmetric window $[t - W/2, t + W/2]$ around current playback time $t$ to provide balanced leading (upcoming) and trailing (recent) note context.
4. **UI Integration**: Provide a mode toggle switch `[ Musical | Time ]`, step sliders, and canvas HUD integration in Section 05 ("Viewport & Framing").

## Data Model & Domain Types

Extend `ViewportTransform` and `DEFAULT_VIEWPORT` in `src/core/types.ts`:

```typescript
export type AutoZoomWindowMode = 'musical' | 'time';

export interface ViewportTransform {
  zoom: number;
  panX: number;
  panY: number;
  autoZoom: boolean;
  autoZoomMode: AutoZoomWindowMode;
  autoZoomWindowBars: number;       // Range: [0.0625, Infinity] (default: 4)
  autoZoomWindowSeconds: number;    // Range: [0, Infinity] (default: 3.0)
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

  const bpm = geometry.config.bpm || 120;
  const beatsPerBar = 4; // Standard 4/4 meter default
  const barSeconds = (beatsPerBar * 60) / bpm;
  return viewport.autoZoomWindowBars * barSeconds;
}
```

### 2. Symmetric Window Note Sampler (`src/core/layout/viewportController.ts`)

Update `calculateActiveNotesBoundingBox(geometry: RenderedGeometry, currentTime: number, windowSeconds: number)`:
- If `windowSeconds === 0`: Check `currentTime >= onset && currentTime <= onset + duration` (instantaneous).
- If `windowSeconds === Infinity`: Include all non-gap notes/bands in score.
- Otherwise (`windowSeconds > 0`): Check `onset <= tMax && (onset + duration) >= tMin`, where $tMin = currentTime - windowSeconds / 2$ and $tMax = currentTime + windowSeconds / 2$.

### 3. UI Layer Integration (`src/ui/app.ts`, `index.html`, `src/ui/styles/main.css`)

- **Sidebar Section 05**:
  - Mode toggle: `<div class="segmented-control"><button id="btn-mode-musical">Musical (Bars)</button><button id="btn-mode-time">Time (Sec)</button></div>`.
  - Musical slider (`#viewport-bars-range`): Steps for 1/16 (0.0625), 1/8 (0.125), 1/4 (0.25), 1/2 (0.5), 1 bar (1), 2 bars (2), 4 bars (4, default), 8 bars (8), 16 bars (16), Full Track (Infinity).
  - Time slider (`#viewport-seconds-range`): 0s to 30s + Full Track (Infinity).
- **Canvas HUD Badge**:
  - Displays mode readout e.g. `🎯 Auto (4 bars)` or `🎯 Auto (3s)`.

## Testing & Verification

1. **Unit Tests (`tests/viewportController.test.ts`)**:
   - Test `calculateWindowSeconds` conversion at various BPM values (e.g. 120 BPM: 4 bars = 8s; 60 BPM: 4 bars = 16s).
   - Test symmetric window bounding box sampling with 4 bars vs 0s instantaneous vs Infinity.
   - Test mode toggle state updates in `ViewportController`.
2. **Local Validation**:
   - Run `npm run validate` to pass all tests, type-checking, and production build.
