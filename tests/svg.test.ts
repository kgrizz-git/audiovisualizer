import { describe, it, expect } from 'vitest';
import { generateDemoScore } from '../src/core/midi/parser.js';
import { mapScoreToGeometry, DEFAULT_CONFIG } from '../src/core/mapper/scoreMapper.js';
import { buildSvg, buildTitleSvg } from '../src/renderers/svg/svgBuilder.js';

describe('SVG Builder Unit Tests', () => {
  it('generates valid SVG string containing elements and legend overlay', () => {
    const score = generateDemoScore();
    const geometry = mapScoreToGeometry(score, DEFAULT_CONFIG, 1000, 1000);
    const svgStr = buildSvg(geometry, { includeLegend: true });

    expect(svgStr).toContain('<svg');
    expect(svgStr).toContain('viewBox="0 0 1000 1000"');
    expect(svgStr).toContain('id="legend-overlay"');
    expect(svgStr).toContain('</svg>');
  });

  it('generates stroke-only pen-plotter SVG without legend or filled rectangles', () => {
    const score = generateDemoScore();
    const geometry = mapScoreToGeometry(score, DEFAULT_CONFIG, 1000, 1000);
    const svgStr = buildSvg(geometry, { penPlotterMode: true });

    expect(svgStr).toContain('<svg');
    expect(svgStr).not.toContain('id="legend-overlay"');
    expect(svgStr).not.toContain('<rect width="1000" height="1000"');
    expect(svgStr).toContain('stroke="#000000"');
  });

  it('keeps MIDI metadata from breaking SVG comments', () => {
    const score = generateDemoScore();
    score.tracks[0].name = 'Lead --> <unsafe>';
    const svg = buildSvg(mapScoreToGeometry(score, DEFAULT_CONFIG));
    expect(svg).toContain('Lead —&gt; &lt;unsafe&gt;');
    expect(svg).not.toContain('Lead --> <unsafe>');
  });

  it('serializes tonal time bands as full-width SVG lines', () => {
    const score = generateDemoScore();
    const svg = buildSvg(mapScoreToGeometry(score, { ...DEFAULT_CONFIG, variation: 'tonal_time_lines' }, 100, 8));
    expect(svg.match(/x1="0"/g)).toHaveLength(8);
    expect(svg).toContain('x2="100"');
  });

  it('uses a mode-specific explanatory legend', () => {
    const score = generateDemoScore();
    const circles = buildSvg(mapScoreToGeometry(score, { ...DEFAULT_CONFIG, variation: 'circles' }, 400, 400), { includeLegend: true });
    const tonal = buildSvg(mapScoreToGeometry(score, { ...DEFAULT_CONFIG, variation: 'tonal_time_lines' }, 400, 400), { includeLegend: true });
    expect(circles).toContain('NOTE HALOS');
    expect(circles).toContain('Duration → radius + path advance');
    expect(circles).toContain('Interval → path turn');
    expect(tonal).toContain('AVERAGE ACTIVE PITCH');
    expect(tonal).toContain('Neutral band → silence (not a key/chord)');
  });

  it('includes active color swatches and visual transpose in a standard legend', () => {
    const score = generateDemoScore();
    const svg = buildSvg(mapScoreToGeometry(score, { ...DEFAULT_CONFIG, pitchHueMode: 'voice_palette', transposeSemitones: 3 }, 400, 400), { includeLegend: true });
    expect(svg).toContain('Voice → stable palette color');
    expect(svg).toContain('Visual transpose → +3 st');
    expect(svg).toContain('hsl(12, 85%, 60%)');
  });

  describe('buildTitleSvg', () => {
    it('omits title when not provided', () => {
      const result = buildTitleSvg(1000, '', false, false);
      expect(result).toBe('');
    });

    it('renders title pill when title is provided', () => {
      const result = buildTitleSvg(1000, 'Test Title', false, false);
      expect(result).toContain('id="title-overlay"');
      expect(result).toContain('Test Title');
      expect(result).toContain('fill="rgba(15, 23, 42, 0.85)"');
    });

    it('truncates title at 40 characters', () => {
      const longTitle = 'A'.repeat(50);
      const result = buildTitleSvg(1000, longTitle, false, false);
      expect(result).toContain('…');
      expect(result).not.toContain(longTitle);
    });

    it('handles exactly 40 character title without truncation', () => {
      const exactTitle = 'A'.repeat(40);
      const result = buildTitleSvg(1000, exactTitle, false, false);
      expect(result).toContain(exactTitle);
      expect(result).not.toContain('…');
    });

    it('escapes XML special characters in title', () => {
      const result = buildTitleSvg(1000, 'Test & < > Title', false, false);
      expect(result).toContain('Test &amp; &lt; &gt; Title');
      expect(result).not.toContain('Test & < > Title');
    });

    it('omits title for empty string', () => {
      const result = buildTitleSvg(1000, '', false, false);
      expect(result).toBe('');
    });

    it('omits title for whitespace-only string', () => {
      const result = buildTitleSvg(1000, '   ', false, false);
      expect(result).toBe('');
    });

    it('omits title in plotter mode without flag', () => {
      const result = buildTitleSvg(1000, 'Test Title', true, false);
      expect(result).toBe('');
    });

    it('renders stroke-only title in plotter mode with flag', () => {
      const result = buildTitleSvg(1000, 'Test Title', true, true);
      expect(result).toContain('id="title-overlay"');
      expect(result).toContain('Test Title');
      expect(result).toContain('fill="none"');
      expect(result).toContain('stroke="#000000"');
    });
  });
});
