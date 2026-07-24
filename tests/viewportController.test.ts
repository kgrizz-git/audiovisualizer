import { describe, expect, it } from 'vitest';
import { ViewportController, calculateActiveNotesBoundingBox, calculateAutoZoomTransform, AUTO_ZOOM_LERP } from '../src/core/layout/viewportController.js';
import { RenderedGeometry, DEFAULT_VIEWPORT } from '../src/core/types.js';
import { DEFAULT_CONFIG } from '../src/core/mapper/scoreMapper.js';

describe('ViewportController & Auto-Zoom', () => {
  it('starts with default viewport', () => {
    expect(AUTO_ZOOM_LERP).toBe(0.15);
    const controller = new ViewportController();
    expect(controller.getViewport()).toEqual(DEFAULT_VIEWPORT);
  });

  it('pans by delta and disables autoZoom', () => {
    const controller = new ViewportController();
    controller.panBy(50, -20);
    expect(controller.getViewport()).toEqual({ ...DEFAULT_VIEWPORT, zoom: 1, panX: 50, panY: -20, autoZoom: false });
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
    expect(controller.getViewport()).toEqual(DEFAULT_VIEWPORT);
  });

  it('calculates bounding box of active notes from RenderedGeometry excluding gap segments', () => {
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
      config: { ...DEFAULT_CONFIG, variation: 'tonal_time_lines' },
      bpm: 120,
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
      bpm: 120,
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
      DEFAULT_VIEWPORT,
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
