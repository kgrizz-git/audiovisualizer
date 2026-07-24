import { RuleConfig } from '../types.js';

export interface LegendContent {
  title: string;
  lines: string[];
  swatches: Array<{ label: string; color: string }>;
}

/** Human-readable mapping summary shared by preview and SVG legends. */
export function getLegendContent(config: RuleConfig): LegendContent {
  const hue = config.pitchHueMode === 'pitch_class'
    ? 'Pitch class → hue'
    : config.pitchHueMode === 'register_spiral'
      ? 'Register → hue'
      : 'Voice → stable palette color';
  const transpose = config.transposeSemitones === 0 ? [] : [`Visual transpose → ${config.transposeSemitones > 0 ? '+' : ''}${config.transposeSemitones} st`];
  const swatches = config.pitchHueMode === 'voice_palette'
    ? [{ label: 'V1', color: 'hsl(12, 85%, 60%)' }, { label: 'V2', color: 'hsl(196, 85%, 60%)' }, { label: 'V3', color: 'hsl(146, 85%, 60%)' }, { label: 'V4', color: 'hsl(282, 85%, 60%)' }]
    : [{ label: 'C', color: 'hsl(0, 85%, 60%)' }, { label: 'D', color: 'hsl(60, 85%, 60%)' }, { label: 'E', color: 'hsl(120, 85%, 60%)' }, { label: 'F♯', color: 'hsl(180, 85%, 60%)' }, { label: 'A', color: 'hsl(270, 85%, 60%)' }];
  switch (config.variation) {
    case 'lines':
      return {
        title: 'LINE PATHS',
        lines: [
          hue,
          ...transpose,
          'Duration → path distance',
          'Velocity → stroke weight',
          `Rests → ${format(config.gapPolicy)}`,
          config.chordLayout === 'polyphony'
            ? 'Overlaps → branch from time-true join (centroid if many)'
            : 'Overlaps → sequential chain (legacy)',
        ], swatches,
      };
    case 'circles':
      return {
        title: 'NOTE HALOS',
        lines: [
          hue,
          ...transpose,
          'Duration → radius + path advance',
          config.intervalAngleEnabled ? 'Interval → path turn' : 'Path advances on initial heading',
          'Fill + outline → one note (not separate data)',
        ], swatches,
      };
    case 'vertical_tone':
      return { title: 'PITCH TIMELINE', lines: ['Time → left to right', 'Pitch → vertical position + hue', ...transpose, 'Duration → segment length', 'Velocity → stroke weight'], swatches };
    case 'tonal_time_lines':
      return { title: 'AVERAGE ACTIVE PITCH', lines: ['Time → top to bottom', 'Band hue → circular average of active notes', ...transpose, 'Weight → velocity × sounding overlap', 'Neutral band → silence (not a key/chord)'], swatches };
    case '3d_lines':
      return {
        title: '3D LINE PATHS',
        lines: [
          hue,
          ...transpose,
          'X / Y → interval path (same as line paths)',
          'Z (depth) → musical time',
          'Velocity → stroke weight',
          'Now-plane → current playback moment',
        ], swatches,
      };
    case '3d_note_halos':
      return {
        title: '3D NOTE HALOS',
        lines: [
          hue,
          ...transpose,
          'X / Y → note-halo path (same as note halos)',
          'Z (depth) → onset time',
          'Duration → radius',
          'Now-plane → current playback moment',
        ], swatches,
      };
    case '3d_piano_roll':
      return {
        title: '3D PIANO ROLL',
        lines: [
          hue,
          ...transpose,
          'X → pitch; Y → voice lane',
          'Z (depth) → onset + duration',
          'Box opacity → velocity',
          'Now-plane → current playback moment',
        ], swatches,
      };
  }
}

function format(value: string): string {
  return value.replaceAll('_', ' ');
}
