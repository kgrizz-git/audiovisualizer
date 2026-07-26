import { describe, expect, it } from 'vitest';
import { buildSvg } from '../src/renderers/svg/svgBuilder.js';
import { RenderedGeometry, DEFAULT_VIEWPORT } from '../src/core/types.js';
import { DEFAULT_CONFIG } from '../src/core/mapper/scoreMapper.js';
import { CanvasRenderer } from '../src/renderers/canvas/canvasRenderer.js';

describe('Viewport Renderer Extensions', () => {
  const dummyGeometry: RenderedGeometry = {
    width: 1200,
    height: 1200,
    bands: [{ y: 100, height: 50, color: '#ffffff', opacity: 0.5, onset: 0, duration: 1, silent: false }],
    voicePaths: [],
    config: DEFAULT_CONFIG,
    bpm: 120,
  };

  it('wraps all score geometry (voicePaths and bands) in transform group in generated SVG', () => {
    const svg = buildSvg(dummyGeometry, {
      viewport: { ...DEFAULT_VIEWPORT, zoom: 2.0, panX: 50, panY: -20, autoZoom: false },
      title: 'Viewport Test'
    });
    expect(svg).toMatch(/<g [^>]*transform="translate\(\s*\d+(\.\d+)?[\s,]+\d+(\.\d+)?\)\s*scale\(2\)/);
    // Title / legend stay outside the viewport group (screen-fixed)
    expect(svg.indexOf('id="title-overlay"')).toBeLessThan(svg.indexOf('scale(2)'));
  });

  it('includes band geometry inside the viewport transform group', () => {
    const svg = buildSvg(dummyGeometry, {
      viewport: { ...DEFAULT_VIEWPORT, zoom: 2.0, panX: 0, panY: 0, autoZoom: false }
    });
    const groupStart = svg.indexOf('scale(2)');
    const groupEnd = svg.indexOf('</g>', groupStart);
    const bandLine = svg.indexOf('y1="125.00"'); // band mid-line at y=100+50/2
    expect(bandLine).toBeGreaterThan(groupStart);
    expect(bandLine).toBeLessThan(groupEnd);
  });
});

describe('CanvasRenderer Background Options', () => {
  it('properly translates background options to transparent stops in drawAtmosphere', () => {
    // Mock global window to prevent ReferenceError in Node environment
    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = { devicePixelRatio: 1 };

    try {
      const gradientStops: { stop: number; color: string }[] = [];
      const mockGradient = {
        addColorStop: (stop: number, color: string) => {
          gradientStops.push({ stop, color });
        }
      };

      const mockCtx = {
        save: () => {},
        scale: () => {},
        translate: () => {},
        fillRect: () => {},
        beginPath: () => {},
        arc: () => {},
        fill: () => {},
        stroke: () => {},
        restore: () => {},
        roundRect: () => {},
        fillText: () => {},
        createRadialGradient: () => mockGradient,
      };

      const mockCanvas = {
        getContext: () => mockCtx,
        width: 100,
        height: 100,
      } as unknown as HTMLCanvasElement;

      const renderer = new CanvasRenderer(mockCanvas);
      const dummyGeometry: RenderedGeometry = {
        width: 100,
        height: 100,
        bands: [],
        voicePaths: [],
        config: DEFAULT_CONFIG,
        bpm: 120,
      };

      // Test with black background
      renderer.render(dummyGeometry, {
        backgroundColor: '#000000',
        atmosphereColors: ['hsl(100, 85%, 60%)'],
      });

      // Find the transparent stop (stop 1)
      const blackFade = gradientStops.find(s => s.stop === 1);
      expect(blackFade).toBeDefined();
      expect(blackFade!.color).toBe('#00000000');

      // Test with HSL background
      gradientStops.length = 0;
      renderer.render(dummyGeometry, {
        backgroundColor: 'hsl(210, 32%, 9%)',
        atmosphereColors: ['hsl(100, 85%, 60%)'],
      });

      const hslFade = gradientStops.find(s => s.stop === 1);
      expect(hslFade).toBeDefined();
      expect(hslFade!.color).toBe('hsla(210, 32%, 9%, 0)');
    } finally {
      if (originalWindow === undefined) {
        delete (globalThis as any).window;
      } else {
        (globalThis as any).window = originalWindow;
      }
    }
  });
});
