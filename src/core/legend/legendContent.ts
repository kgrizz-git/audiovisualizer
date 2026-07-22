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
      return { title: 'LINE PATHS', lines: [hue, 'Duration → path distance', 'Velocity → stroke weight', `Rests → ${format(config.gapPolicy)}`] };
    case 'circles':
      return { title: 'NOTE HALOS', lines: [hue, 'Duration → radius + path advance', 'Velocity → outline weight', 'Fill + outline → one note (not separate data)'] };
    case 'vertical_tone':
      return { title: 'PITCH TIMELINE', lines: ['Time → left to right', 'Pitch → vertical position + hue', 'Duration → segment length', 'Velocity → stroke weight'] };
    case 'tonal_time_lines':
      return { title: 'AVERAGE ACTIVE PITCH', lines: ['Time → top to bottom', 'Band hue → circular average of active notes', 'Weight → velocity × sounding overlap', 'Neutral band → silence (not a key/chord)'] };
  }
}

function format(value: string): string {
  return value.replaceAll('_', ' ');
}
