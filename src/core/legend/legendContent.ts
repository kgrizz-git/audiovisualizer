import { RuleConfig } from '../types.js';

export interface LegendContent {
  title: string;
  lines: string[];
  swatches: Array<{ label: string; color: string }>;
}

/** Human-readable mapping summary shared by preview and SVG legends. */
// eslint-disable-next-line complexity -- grandfathered (22); refactor when next touched
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
    case 'polar_fan':
      return {
        title: 'POLAR OCTAVE FAN',
        lines: [
          hue,
          ...transpose,
          'Pitch class → spoke angle (octave = 360°)',
          'Duration → segment length',
          'Velocity → stroke weight',
          'Voices share the canvas center',
          'Chords fan from the origin',
        ],
        swatches,
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
    case '3d_note_spheres':
      return {
        title: '3D NOTE SPHERES',
        lines: [
          hue,
          ...transpose,
          'X / Y → note-halo path (same as note halos)',
          'Z (depth) → onset time',
          'Sphere diameter → note duration',
          'Soft halo → outer glow shell',
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
    case 'polar_walk':
      return {
        title: 'POLAR WALK',
        lines: [
          hue,
          ...transpose,
          'Pitch class → absolute path direction (30° per st)',
          'Duration → segment length',
          'Velocity → stroke weight',
          'Voice path starts at center and walks continuously',
          `Rests → ${format(config.gapPolicy)}`,
        ],
        swatches,
      };
    case 'radial_voice_paths':
      return {
        title: 'RADIAL VOICE PATHS',
        lines: [
          hue,
          ...transpose,
          'Voice register → spoke direction (bass ↓, treble ↑)',
          'Onset → distance from center; duration → length',
          'Velocity → stroke weight',
          'Percussion → concentric rings (family → color)',
        ],
        swatches,
      };
    case 'radial_pitch_spokes':
      return {
        title: 'RADIAL PITCH SPOKES',
        lines: [
          'Voice register → radial placement',
          'Onset → distance from center',
          'Pitch class → absolute direction + color',
          'C → yellow + up; 6 st → antiparallel',
          `Spoke length → auto baseline × ${config.radialSpokeScale}×`,
          'Percussion → concentric family-color rings',
        ],
        swatches,
      };
    case '3d_polar_fan':
      return {
        title: '3D POLAR OCTAVE FAN',
        lines: [
          hue,
          ...transpose,
          'X / Y → polar fan (pitch class × 30°)',
          'Z (depth) → onset time',
          'Duration → segment length',
          'Now-plane → current playback moment',
        ],
        swatches,
      };
    case '3d_polar_walk':
      return {
        title: '3D POLAR WALK',
        lines: [
          hue,
          ...transpose,
          'X / Y → polar walk (pitch class × 30°)',
          'Z (depth) → onset time',
          'Duration → segment length',
          'Now-plane → current playback moment',
        ],
        swatches,
      };
    case '3d_radial_voice_paths':
      return {
        title: '3D RADIAL VOICE PATHS',
        lines: [
          hue,
          ...transpose,
          'X / Y → voice spokes (register → direction)',
          'Z (depth) → onset time',
          'Percussion → time rings lifted to discs',
          'Now-plane → current playback moment',
        ],
        swatches,
      };
    case '3d_voice_towers':
      return {
        title: '3D VOICE TOWERS',
        lines: [
          'Voice register → fixed XY tower',
          'Z (depth) → onset time',
          'Pitch class → absolute spoke direction + color',
          'C → yellow + up; 6 st → antiparallel',
          `Spoke length → auto baseline × ${config.radialSpokeScale}×`,
          'Now-plane → current playback moment',
        ],
        swatches,
      };
  }
}

/** Compact live-stage caption drawn from the same deterministic mode explanation as exports. */
export function getRuleCaption(config: RuleConfig): string {
  const content = getLegendContent(config);
  return `${toTitleCase(content.title)} · ${content.lines.slice(0, 3).join(' · ')}`;
}

function format(value: string): string {
  return value.replaceAll('_', ' ');
}

function toTitleCase(value: string): string {
  return value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()).replace(/\b3d\b/gi, '3D');
}
