import { describe, expect, it } from 'vitest';
import { fitGeometryToCanvas } from '../src/core/layout/fitGeometry.js';
import { DEFAULT_CONFIG } from '../src/core/mapper/scoreMapper.js';

describe('geometry fitting', () => {
  it('uniformly frames long paths inside the requested padding', () => {
    const note = { id: 'n', pitch: 60, onset: 0, duration: 1, velocity: 100, voice: 0, pitchClass: 0 };
    const geometry = { width: 100, height: 100, config: DEFAULT_CONFIG, bpm: 120, bands: [], voicePaths: [{ voice: 0, voiceName: 'Lead', segments: [{ start: { x: -500, y: 20 }, end: { x: 1200, y: 900 }, color: '#fff', width: 2, opacity: 1, note }], circles: [] }] };
    const fitted = fitGeometryToCanvas(geometry, 400, 400, 40);
    const segment = fitted.voicePaths[0].segments[0];
    [segment.start, segment.end].forEach((point) => { expect(point.x).toBeGreaterThanOrEqual(40); expect(point.x).toBeLessThanOrEqual(360); expect(point.y).toBeGreaterThanOrEqual(40); expect(point.y).toBeLessThanOrEqual(360); });
  });

  it('keeps tonal time bands flush to every requested output row', () => {
    const geometry = {
      width: 100, height: 100, config: { ...DEFAULT_CONFIG, variation: 'tonal_time_lines' as const }, bpm: 120, voicePaths: [],
      bands: [{ y: 0, height: 50, color: '#fff', opacity: 1, onset: 0, duration: 1, silent: false }, { y: 50, height: 50, color: '#fff', opacity: 1, onset: 1, duration: 1, silent: false }],
    };
    const fitted = fitGeometryToCanvas(geometry, 300, 600);
    expect(fitted.bands[0]).toMatchObject({ y: 0, height: 300 });
    expect(fitted.bands[1]).toMatchObject({ y: 300, height: 300 });
  });

  it('preserves and scales concentric percussion rings for radial_voice_paths', () => {
    const note = { id: 'n', pitch: 60, onset: 0, duration: 1, velocity: 100, voice: 0, pitchClass: 0 };
    const drum = { id: 'd', pitch: 36, onset: 3, duration: 0.1, velocity: 100, voice: 1, pitchClass: 0 };
    const geometry = {
      width: 800, height: 800, config: { ...DEFAULT_CONFIG, variation: 'radial_voice_paths' as const }, bpm: 120, bands: [],
      voicePaths: [
        // Short spoke segment near the center...
        { voice: 0, voiceName: 'Lead', segments: [{ start: { x: 400, y: 400 }, end: { x: 400, y: 300 }, color: '#fff', width: 2, opacity: 1, note }], circles: [] },
        // ...and a percussion ring extending well beyond it (radius 360 > segment reach 100).
        { voice: 9, voiceName: 'Drums', segments: [], circles: [{ center: { x: 400, y: 400 }, radius: 360, fillColor: 'none', strokeColor: 'hsl(0, 85%, 60%)', strokeWidth: 2, opacity: 0.85, note: drum, isPercussion: true }] },
      ],
    };
    const fitted = fitGeometryToCanvas(geometry, 600, 600, 40);
    const circle = fitted.voicePaths[1].circles[0];
    // The ring survives fitting and defines the fitted radius: it fills the padded canvas.
    expect(circle.radius).toBeCloseTo(300 - 40);
    expect(circle.center.x).toBeCloseTo(300);
    expect(circle.center.y).toBeCloseTo(300);
    // The segment scales by the same ring-driven factor (260/360) around the new center.
    const segment = fitted.voicePaths[0].segments[0];
    expect(segment.start.x).toBeCloseTo(300);
    expect(segment.start.y).toBeCloseTo(300);
    expect(segment.end.y).toBeCloseTo(300 - 100 * (260 / 360));
  });

  it('is deterministic when refitting radial_voice_paths geometry', () => {
    const drum = { id: 'd', pitch: 42, onset: 1, duration: 0.1, velocity: 90, voice: 0, pitchClass: 6 };
    const geometry = {
      width: 800, height: 800, config: { ...DEFAULT_CONFIG, variation: 'radial_voice_paths' as const }, bpm: 120, bands: [],
      voicePaths: [{ voice: 9, voiceName: 'Drums', segments: [], circles: [{ center: { x: 400, y: 400 }, radius: 180, fillColor: 'none', strokeColor: 'hsl(190, 85%, 60%)', strokeWidth: 2, opacity: 0.85, note: drum, isPercussion: true }] }],
    };
    expect(fitGeometryToCanvas(geometry, 500, 500)).toEqual(fitGeometryToCanvas(geometry, 500, 500));
  });
});
