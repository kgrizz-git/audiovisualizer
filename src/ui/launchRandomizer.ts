import { Variation } from '../core/types.js';

export const VARIATIONS: readonly Variation[] = [
  'lines',
  'circles',
  'vertical_tone',
  'tonal_time_lines',
  'polar_fan',
  'polar_walk',
  '3d_lines',
  '3d_note_halos',
  '3d_note_spheres',
  '3d_piano_roll',
  '3d_polar_fan',
  '3d_polar_walk',
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
