import { getInstrumentSlug } from './gmInstrumentSlugs.js';

/**
 * gleitz GM instrument slugs that have no goldst FluidR3 loop JSON (404 on CDN).
 * Soft-fail: playback stays one-shot.
 */
const NO_LOOP_GLEITZ_SLUGS = new Set([
  'electric_grand_piano',
  'slap_bass_2',
]);

/**
 * Known gleitz slug → goldst loop filename slug mismatches for FluidR3_GM.
 * Unlisted slugs use the gleitz name when fetching `*-loop.json`.
 */
const GLEITZ_TO_GOLDST_LOOP_SLUG: Readonly<Record<string, string>> = {
  acoustic_grand_piano: 'yamaha_grand_piano',
  bright_acoustic_piano: 'bright_yamaha_grand',
  drawbar_organ: 'drawbarorgan',
  electric_piano_1: 'rhodes_ep',
  electric_piano_2: 'legend_ep_2',
  honkytonk_piano: 'honky_tonk',
  accordion: 'accordian',
  tango_accordion: 'bandoneon',
  acoustic_guitar_nylon: 'nylon_string_guitar',
  acoustic_guitar_steel: 'steel_string_guitar',
  electric_guitar_jazz: 'jazz_guitar',
  electric_guitar_clean: 'clean_guitar',
  electric_guitar_muted: 'palm_muted_guitar',
  overdriven_guitar: 'overdrive_guitar',
  electric_bass_finger: 'fingered_bass',
  electric_bass_pick: 'picked_bass',
  slap_bass_1: 'slap_bass',
  tremolo_strings: 'tremolo',
  pizzicato_strings: 'pizzicato_section',
  orchestral_harp: 'harp',
  string_ensemble_1: 'strings',
  string_ensemble_2: 'slow_strings',
  choir_aahs: 'ahh_choir',
  voice_oohs: 'ohh_voices',
  synth_choir: 'synth_voice',
  french_horn: 'french_horns',
  lead_1_square: 'square_lead',
  lead_2_sawtooth: 'saw_wave',
  lead_3_calliope: 'calliope_lead',
  lead_4_chiff: 'chiffer_lead',
  lead_5_charang: 'charang',
  lead_6_voice: 'space_voice',
  lead_7_fifths: 'fifth_sawtooth_wave',
  lead_8_bass__lead: 'bass_&_lead',
  pad_1_new_age: 'fantasia',
  pad_2_warm: 'warm_pad',
  pad_3_polysynth: 'polysynth',
  pad_4_choir: 'solo_vox',
  pad_5_bowed: 'bowed_glass',
  pad_6_metallic: 'metal_pad',
  pad_7_halo: 'halo_pad',
  pad_8_sweep: 'sweep_pad',
  fx_1_rain: 'ice_rain',
  fx_2_soundtrack: 'soundtrack',
  fx_3_crystal: 'crystal',
  fx_4_atmosphere: 'atmosphere',
  fx_5_brightness: 'brightness',
  fx_6_goblins: 'goblin',
  fx_7_echoes: 'echo_drops',
  fx_8_scifi: 'star_theme',
  shanai: 'shenai',
  tinkle_bell: 'tinker_bell',
  seashore: 'sea_shore',
  telephone_ring: 'telephone',
  gunshot: 'gun_shot',
  guitar_fret_noise: 'fret_noise',
  blown_bottle: 'bottle_chiff',
};

/**
 * Resolve the goldst loop JSON slug for a gleitz GM instrument slug.
 * Returns `null` when looping is known-unavailable; fetch may still 404 for others.
 */
export function getGoldstLoopSlugForGleitzSlug(gleitzSlug: string): string | null {
  if (NO_LOOP_GLEITZ_SLUGS.has(gleitzSlug)) return null;
  return GLEITZ_TO_GOLDST_LOOP_SLUG[gleitzSlug] ?? gleitzSlug;
}

/** Resolve the goldst loop JSON slug for a General MIDI program number (0–127). */
export function getGoldstLoopSlugForProgram(program: number): string | null {
  return getGoldstLoopSlugForGleitzSlug(getInstrumentSlug(program));
}

/** Exposed for tests and bundle tooling parity checks. */
export function getGleitzToGoldstLoopOverrides(): Readonly<Record<string, string>> {
  return GLEITZ_TO_GOLDST_LOOP_SLUG;
}
