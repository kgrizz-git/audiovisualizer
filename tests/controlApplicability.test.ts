/**
 * Unit tests for per-variation studio control applicability.
 * Inputs: Variation × StudioControlKey pairs from controlApplicability.ts.
 * Asserts: DESIGN.md / docs/modes.md ignore notes stay encoded in the map.
 */
import { describe, expect, it } from 'vitest';
import {
  isControlApplicable,
  showsThreeDControls,
  STUDIO_CONTROL_KEYS,
  StudioControlKey,
} from '../src/ui/controlApplicability.js';
import { Variation } from '../src/core/types.js';

describe('controlApplicability', () => {
  it('hides growth direction and rests for polar fan (DESIGN.md)', () => {
    expect(isControlApplicable('polar_fan', 'originMode')).toBe(false);
    expect(isControlApplicable('polar_fan', 'gapPolicy')).toBe(false);
    expect(isControlApplicable('3d_polar_fan', 'originMode')).toBe(false);
    expect(isControlApplicable('3d_polar_fan', 'gapPolicy')).toBe(false);
  });

  it('hides growth direction for polar walk but keeps rests and chord layout', () => {
    expect(isControlApplicable('polar_walk', 'originMode')).toBe(false);
    expect(isControlApplicable('polar_walk', 'gapPolicy')).toBe(true);
    expect(isControlApplicable('polar_walk', 'chordLayout')).toBe(true);
    expect(isControlApplicable('3d_polar_walk', 'chordLayout')).toBe(true);
  });

  it('hides origin/gap for radial voice paths; keeps pitch hue', () => {
    expect(isControlApplicable('radial_voice_paths', 'originMode')).toBe(false);
    expect(isControlApplicable('radial_voice_paths', 'gapPolicy')).toBe(false);
    expect(isControlApplicable('radial_voice_paths', 'pitchHueMode')).toBe(true);
    expect(isControlApplicable('radial_voice_paths', 'lengthScale')).toBe(false);
  });

  it('hides color source and length scale for radial pitch spokes; shows spoke + length source', () => {
    expect(isControlApplicable('radial_pitch_spokes', 'pitchHueMode')).toBe(false);
    expect(isControlApplicable('radial_pitch_spokes', 'originMode')).toBe(false);
    expect(isControlApplicable('radial_pitch_spokes', 'gapPolicy')).toBe(false);
    expect(isControlApplicable('radial_pitch_spokes', 'lengthScale')).toBe(false);
    expect(isControlApplicable('radial_pitch_spokes', 'lengthSource')).toBe(true);
    expect(isControlApplicable('radial_pitch_spokes', 'radialSpokeScale')).toBe(true);
    expect(isControlApplicable('3d_voice_towers', 'radialSpokeScale')).toBe(true);
    expect(isControlApplicable('3d_voice_towers', 'pitchHueMode')).toBe(false);
  });

  it('enables interval path and origin for lines/circles and their 3D lifts', () => {
    for (const mode of ['lines', 'circles', '3d_lines', '3d_note_halos', '3d_note_spheres'] as Variation[]) {
      expect(isControlApplicable(mode, 'originMode')).toBe(true);
      expect(isControlApplicable(mode, 'intervalPath')).toBe(true);
      expect(isControlApplicable(mode, 'gapPolicy')).toBe(true);
      expect(isControlApplicable(mode, 'lengthScale')).toBe(true);
    }
  });

  it('limits chord layout to lines and polar walk families', () => {
    expect(isControlApplicable('lines', 'chordLayout')).toBe(true);
    expect(isControlApplicable('3d_lines', 'chordLayout')).toBe(true);
    expect(isControlApplicable('circles', 'chordLayout')).toBe(false);
    expect(isControlApplicable('polar_fan', 'chordLayout')).toBe(false);
  });

  it('shows time-line density only for tonal_time_lines', () => {
    expect(isControlApplicable('tonal_time_lines', 'timeLineDensity')).toBe(true);
    expect(isControlApplicable('lines', 'timeLineDensity')).toBe(false);
    expect(isControlApplicable('tonal_time_lines', 'lengthScale')).toBe(false);
    expect(isControlApplicable('tonal_time_lines', 'originMode')).toBe(false);
  });

  it('shows Three.js controls only for 3D variations', () => {
    expect(showsThreeDControls('lines')).toBe(false);
    expect(showsThreeDControls('3d_polar_fan')).toBe(true);
  });

  it('covers every StudioControlKey for a representative mode without throwing', () => {
    const sample: Variation = 'lines';
    for (const key of STUDIO_CONTROL_KEYS) {
      expect(typeof isControlApplicable(sample, key as StudioControlKey)).toBe('boolean');
    }
  });
});
