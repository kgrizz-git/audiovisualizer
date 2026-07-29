/**
 * Control applicability for Visual Score Studio.
 *
 * Inputs: a Variation (geometry mode).
 * Outputs: which Compose/Refine studio controls affect that mode.
 * Requirements: stay aligned with DESIGN.md / docs/modes.md ignore notes and the
 * mapper’s actual use of RuleConfig fields. Pure — no DOM side effects.
 *
 * The UI hides inactive controls so users do not tweak values that the active
 * mode ignores. Config values remain in RuleConfig so switching modes restores them.
 */

import { is3DVariation, Variation } from '../core/types.js';

/** Studio controls that may be mode-specific. Always-on controls are omitted. */
export type StudioControlKey =
  | 'originMode'
  | 'pitchHueMode'
  | 'gapPolicy'
  | 'chordLayout'
  | 'intervalPath'
  | 'lengthScale'
  | 'lengthSource'
  | 'timeLineDensity'
  | 'radialSpokeScale';

const PATH_WALK: readonly Variation[] = [
  'lines',
  'circles',
  '3d_lines',
  '3d_note_halos',
  '3d_note_spheres',
];

const POLAR_FAN: readonly Variation[] = ['polar_fan', '3d_polar_fan'];
const POLAR_WALK: readonly Variation[] = ['polar_walk', '3d_polar_walk'];
const RADIAL_PITCH: readonly Variation[] = ['radial_pitch_spokes', '3d_voice_towers'];

const ALL_VARIATIONS: readonly Variation[] = [
  'lines', 'circles', 'vertical_tone', 'tonal_time_lines',
  'polar_fan', 'polar_walk', 'radial_voice_paths', 'radial_pitch_spokes',
  '3d_lines', '3d_note_halos', '3d_note_spheres', '3d_piano_roll',
  '3d_polar_fan', '3d_polar_walk', '3d_radial_voice_paths', '3d_voice_towers',
];

function setOf(...groups: readonly (readonly Variation[])[]): ReadonlySet<Variation> {
  return new Set(groups.flat());
}

function allExcept(...excluded: readonly Variation[]): ReadonlySet<Variation> {
  const skip = new Set(excluded);
  return new Set(ALL_VARIATIONS.filter((v) => !skip.has(v)));
}

/** Variations for which each studio control affects geometry. */
const APPLICABLE: Record<StudioControlKey, ReadonlySet<Variation>> = {
  // Polar/radial fix the origin; timelines and piano-roll use their own axes.
  originMode: setOf(PATH_WALK),
  // Absolute pitch-class color is mandatory for radial pitch / voice towers.
  pitchHueMode: allExcept(...RADIAL_PITCH),
  gapPolicy: setOf(PATH_WALK, POLAR_WALK),
  // Polyphony branching is implemented for line paths and polar walk (2D + 3D).
  chordLayout: setOf(['lines', '3d_lines'], POLAR_WALK),
  // Interval turns / turn-per-octave / spiral bias only on origin-heading paths.
  intervalPath: setOf(PATH_WALK),
  // Duration × lengthScale — not radial time-radius or tonal bands.
  lengthScale: setOf(PATH_WALK, POLAR_FAN, POLAR_WALK),
  // getVisualDuration feeds lengthScale modes and radial pitch auto-scale.
  lengthSource: setOf(PATH_WALK, POLAR_FAN, POLAR_WALK, RADIAL_PITCH),
  timeLineDensity: setOf(['tonal_time_lines']),
  radialSpokeScale: setOf(RADIAL_PITCH),
};

/**
 * Returns whether the given studio control affects geometry for `variation`.
 * When false, the UI should hide or disable the control and may show
 * “Ignored by this mode”.
 */
export function isControlApplicable(variation: Variation, key: StudioControlKey): boolean {
  return APPLICABLE[key].has(variation);
}

/** All control keys, for tests and bulk UI updates. */
export const STUDIO_CONTROL_KEYS: readonly StudioControlKey[] = [
  'originMode',
  'pitchHueMode',
  'gapPolicy',
  'chordLayout',
  'intervalPath',
  'lengthScale',
  'lengthSource',
  'timeLineDensity',
  'radialSpokeScale',
] as const;

/** True when the variation uses the Three.js control subgroup (camera, bloom, cues). */
export function showsThreeDControls(variation: Variation): boolean {
  return is3DVariation(variation);
}
