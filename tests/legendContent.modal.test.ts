// @ts-expect-error Node built-in used for test fixture loading
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getLegendContent, getRuleCaption } from '../src/core/legend/legendContent.js';
import { DEFAULT_CONFIG } from '../src/core/mapper/scoreMapper.js';
import { Variation } from '../src/core/types.js';

const modesDoc = readFileSync(new URL('../docs/modes.md', import.meta.url), 'utf8');
const variations: Variation[] = [
  'lines', 'circles', 'vertical_tone', 'tonal_time_lines', 'polar_fan', 'polar_walk',
  'radial_voice_paths', 'radial_pitch_spokes', '3d_lines', '3d_note_halos',
  '3d_note_spheres', '3d_piano_roll', '3d_polar_fan', '3d_polar_walk',
  '3d_radial_voice_paths', '3d_voice_towers',
];

function sectionFor(mode: Variation): string {
  const marker = `## ${mode}\n`;
  const start = modesDoc.indexOf(marker);
  if (start < 0) throw new Error(`Missing docs/modes.md section for ${mode}`);
  const end = modesDoc.indexOf('\n## ', start + marker.length);
  return modesDoc.slice(start + marker.length, end < 0 ? undefined : end);
}

function outputPhrases(section: string): string[] {
  return [...section.matchAll(/^\|[^|]+\|\s*([^|]+?)\s*\|$/gm)]
    .map((match) => match[1])
    .filter((value) => value !== 'Visual output' && !/^---+$/.test(value));
}

describe('legend content and mode reference binding', () => {
  for (const variation of variations) {
    it(`keeps ${variation} summary wording aligned with its documented outputs`, () => {
      const content = getLegendContent({ ...DEFAULT_CONFIG, variation });
      const section = sectionFor(variation);
      expect(section).toContain(`**${content.title}**`);
      for (const phrase of outputPhrases(section)) {
        expect(content.lines.some((line) => line.includes(phrase))).toBe(true);
      }
    });
  }

  it('derives a compact live-stage caption from the active rule explanation', () => {
    const caption = getRuleCaption({ ...DEFAULT_CONFIG, variation: '3d_polar_fan' });
    expect(caption).toContain('3D Polar Octave Fan');
    expect(caption).toContain('X / Y → polar fan');
  });
});
