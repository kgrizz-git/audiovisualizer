import { describe, expect, it } from 'vitest';
import { fitGeometryToCanvas } from '../src/core/layout/fitGeometry.js';
import { DEFAULT_CONFIG } from '../src/core/mapper/scoreMapper.js';

describe('geometry fitting', () => {
  it('uniformly frames long paths inside the requested padding', () => {
    const note = { id: 'n', pitch: 60, onset: 0, duration: 1, velocity: 100, voice: 0, pitchClass: 0 };
    const geometry = { width: 100, height: 100, config: DEFAULT_CONFIG, bands: [], voicePaths: [{ voice: 0, voiceName: 'Lead', segments: [{ start: { x: -500, y: 20 }, end: { x: 1200, y: 900 }, color: '#fff', width: 2, opacity: 1, note }], circles: [] }] };
    const fitted = fitGeometryToCanvas(geometry, 400, 400, 40);
    const segment = fitted.voicePaths[0].segments[0];
    [segment.start, segment.end].forEach((point) => { expect(point.x).toBeGreaterThanOrEqual(40); expect(point.x).toBeLessThanOrEqual(360); expect(point.y).toBeGreaterThanOrEqual(40); expect(point.y).toBeLessThanOrEqual(360); });
  });

  it('keeps tonal time bands flush to every requested output row', () => {
    const geometry = {
      width: 100, height: 100, config: { ...DEFAULT_CONFIG, variation: 'tonal_time_lines' as const }, voicePaths: [],
      bands: [{ y: 0, height: 50, color: '#fff', opacity: 1, onset: 0, duration: 1, silent: false }, { y: 50, height: 50, color: '#fff', opacity: 1, onset: 1, duration: 1, silent: false }],
    };
    const fitted = fitGeometryToCanvas(geometry, 300, 600);
    expect(fitted.bands[0]).toMatchObject({ y: 0, height: 300 });
    expect(fitted.bands[1]).toMatchObject({ y: 300, height: 300 });
  });
});
