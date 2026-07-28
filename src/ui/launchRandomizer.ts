import { LengthBasis, Variation } from '../core/types.js';

export const VARIATIONS: readonly Variation[] = [
  'lines',
  'circles',
  'vertical_tone',
  'tonal_time_lines',
  'polar_fan',
  'polar_walk',
  'radial_voice_paths',
  'radial_pitch_spokes',
  '3d_lines',
  '3d_note_halos',
  '3d_note_spheres',
  '3d_piano_roll',
  '3d_polar_fan',
  '3d_polar_walk',
  '3d_radial_voice_paths',
  '3d_voice_towers',
] as const;

/**
 * Picks a random item from a non-empty array using the provided `rand` function.
 * Throws an Error if the array is empty.
 */
export function pickRandom<T>(arr: readonly T[], rand: () => number): T {
  if (arr.length === 0) {
    throw new Error('Cannot pick random item from empty array');
  }
  const index = Math.floor(rand() * arr.length);
  const safeIndex = Math.min(index, arr.length - 1);
  return arr[safeIndex];
}

/** Visual-option fields the launch randomizer rolls alongside the variation. */
export interface RandomVisualOptions {
  lengthProportionalTo: LengthBasis;
  velocityGlow: boolean;
  constantStrokeWidth: boolean;
  ringFlashes3D: boolean;
  velocityOpacity: boolean;
}

/**
 * Rolls each visual option independently (uniform pick per field) using the provided
 * `rand` function. Each candidate list leads with the DEFAULT_CONFIG value, so
 * `rand` pinned to 0 reproduces the defaults.
 */
export function randomVisualOptions(rand: () => number): RandomVisualOptions {
  return {
    lengthProportionalTo: pickRandom<LengthBasis>(['duration', 'velocity'], rand),
    velocityGlow: pickRandom([false, true], rand),
    constantStrokeWidth: pickRandom([false, true], rand),
    ringFlashes3D: pickRandom([true, false], rand),
    velocityOpacity: pickRandom([false, true], rand),
  };
}
