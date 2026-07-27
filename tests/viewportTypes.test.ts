import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEWPORT, ViewportTransform, clampZoom } from '../src/core/types.js';
import { mapScoreToGeometry, DEFAULT_CONFIG } from '../src/core/mapper/scoreMapper.js';
import { generateDemoScore } from '../src/core/midi/parser.js';

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

describe('Viewport Domain Types Extension', () => {
  it('includes default autoZoomMode, autoZoomWindowBars, and autoZoomWindowSeconds', () => {
    const vp: ViewportTransform = DEFAULT_VIEWPORT;
    expect(vp.autoZoomMode).toBe('musical');
    expect(vp.autoZoomWindowBars).toBe(1);
    expect(vp.autoZoomWindowSeconds).toBe(3);
  });

  it('propagates bpm from score onto RenderedGeometry.bpm', () => {
    const score = generateDemoScore();
    const geometry = mapScoreToGeometry(score, DEFAULT_CONFIG, 900, 900);
    expect(geometry.bpm).toBe(score.bpm);
  });
});
