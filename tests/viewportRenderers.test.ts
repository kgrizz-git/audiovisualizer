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
    expect(svg).toMatch(/<g [^>]*transform="translate\(\s*\d+(\.\d+)?[\s,]+\d+(\.\d+)?\)\s*scale\(2\)/);
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
