import { DEFAULT_VIEWPORT, ViewportTransform, clampZoom, RenderedGeometry, AutoZoomWindowMode } from '../types.js';

export const AUTO_ZOOM_LERP = 0.15;

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

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
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;

  const halfWindow = Math.max(0, windowSeconds) / 2;
  const windowStart = currentTime - halfWindow;
  const windowEnd = currentTime + halfWindow;

  for (const voice of geometry.voicePaths) {
    for (const seg of voice.segments) {
      if (seg.role === 'gap') continue;
      const onset = seg.note.onset;
      const endTime = onset + seg.note.duration;
      const overlaps = windowSeconds === 0
        ? (currentTime >= onset && currentTime <= endTime)
        : (windowSeconds === Infinity || (onset <= windowEnd && endTime >= windowStart));

      if (overlaps) {
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
      const overlaps = windowSeconds === 0
        ? (currentTime >= onset && currentTime <= endTime)
        : (windowSeconds === Infinity || (onset <= windowEnd && endTime >= windowStart));

      if (overlaps) {
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
      const onset = band.onset;
      const endTime = onset + band.duration;
      const overlaps = windowSeconds === 0
        ? (currentTime >= onset && currentTime <= endTime)
        : (windowSeconds === Infinity || (onset <= windowEnd && endTime >= windowStart));

      if (overlaps) {
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
    ...current,
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

  public setAutoZoomMode(mode: AutoZoomWindowMode): void {
    this.viewport.autoZoomMode = mode;
  }

  public setAutoZoomWindowBars(bars: number): void {
    this.viewport.autoZoomWindowBars = bars;
  }

  public setAutoZoomWindowSeconds(seconds: number): void {
    this.viewport.autoZoomWindowSeconds = seconds;
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
    const windowSec = calculateWindowSeconds(geometry, this.viewport);
    const bounds = calculateActiveNotesBoundingBox(geometry, currentTime, windowSec);
    this.viewport = calculateAutoZoomTransform(this.viewport, bounds, width, height);
  }
}

