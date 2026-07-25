import { SynthTimbre } from '../midiPreviewPlayer.js';

export type SoundbankPreset = 'FluidR3_GM' | 'MusyngKite' | 'FatBoy';
export type PlaybackEngine = 'sample' | 'oscillator';

export interface VoiceRouteDefaults {
  engine: PlaybackEngine;
  soundbank: SoundbankPreset;
}

export interface VoiceRouteSettings {
  channel: number;
  program: number;
  engine: PlaybackEngine;
  soundbank: SoundbankPreset;
  timbre: SynthTimbre;
  gain: number;
  muted: boolean;
  solo: boolean;
}

import type { LoopPointsByMidi } from './soundfontLoopLoader.js';

export interface InstrumentPatch {
  bank: SoundbankPreset;
  program: number;
  slug: string;
  /** midi-js note name → decoded buffer */
  buffers: Record<string, AudioBuffer>;
  /** Optional goldst loop regions keyed by MIDI note number (seconds). */
  loops?: LoopPointsByMidi;
}

export type PatchStatus = 'loading' | 'loaded' | 'fallback';

