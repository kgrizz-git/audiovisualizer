import { RuleConfig } from '../types.js';

export interface LegendContent {
  title: string;
  lines: string[];
}

/** Human-readable mapping summary shared by preview and SVG legends. */
export function getLegendContent(config: RuleConfig): LegendContent {
  const hue = config.pitchHueMode === 'pitch_class' ? 'Pitch class → hue' : 'Register → hue';
  switch (config.variation) {
    case 'lines':
      return {
        title: 'LINE PATHS',
        lines: [
          hue,
          'Duration → path distance',
          'Velocity → stroke weight',
          `Rests → ${format(config.gapPolicy)}`,
          config.chordLayout === 'polyphony'
            ? 'Overlaps → branch from time-true join (centroid if many)'
            : 'Overlaps → sequential chain (legacy)',
        ],
      };
    case 'circles':
      return {
        title: 'NOTE HALOS',
        lines: [
          hue,
          'Duration → radius + path advance',
          config.intervalAngleEnabled ? 'Interval → path turn' : 'Path advances on initial heading',
          'Fill + outline → one note (not separate data)',
        ],
      };
    case 'vertical_tone':
      return { title: 'PITCH TIMELINE', lines: ['Time → left to right', 'Pitch → vertical position + hue', 'Duration → segment length', 'Velocity → stroke weight'] };
    case 'tonal_time_lines':
      return { title: 'AVERAGE ACTIVE PITCH', lines: ['Time → top to bottom', 'Band hue → circular average of active notes', 'Weight → velocity × sounding overlap', 'Neutral band → silence (not a key/chord)'] };
    case '3d_lines':
      return {
        title: '3D LINE PATHS',
        lines: [
          hue,
          'X / Y → interval path (same as line paths)',
          'Z (depth) → musical time',
          'Velocity → stroke weight',
          'Now-plane → current playback moment',
        ],
      };
    case '3d_note_halos':
      return {
        title: '3D NOTE HALOS',
        lines: [
          hue,
          'X / Y → note-halo path (same as note halos)',
          'Z (depth) → onset time',
          'Duration → radius',
          'Now-plane → current playback moment',
        ],
      };
  }
}

function format(value: string): string {
  return value.replaceAll('_', ' ');
}
