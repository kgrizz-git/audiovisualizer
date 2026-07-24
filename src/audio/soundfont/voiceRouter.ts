import { defaultVoiceSettings, VoicePlaybackSettings } from '../midiPreviewPlayer.js';
import { TrackScore } from '../../core/types.js';
import { VoiceRouteDefaults, VoiceRouteSettings } from './soundfontTypes.js';

/** Mix overrides keyed by TrackScore.channel as stored by the parser (channel ?? trackIdx). */
export class VoiceRouter {
  private defaults: VoiceRouteDefaults;
  private mix = new Map<number, VoicePlaybackSettings>();
  private programs = new Map<number, number>();

  constructor(defaults: VoiceRouteDefaults) {
    this.defaults = { ...defaults };
  }

  setDefaults(defaults: Partial<VoiceRouteDefaults>): void {
    this.defaults = { ...this.defaults, ...defaults };
  }

  getDefaults(): VoiceRouteDefaults {
    return { ...this.defaults };
  }

  setMix(channel: number, settings: VoicePlaybackSettings): void {
    this.mix.set(channel, { ...settings });
  }

  setProgram(channel: number, program: number): void {
    this.programs.set(channel, program);
  }

  getProgram(channel: number): number | undefined {
    return this.programs.get(channel);
  }

  clearPrograms(): void {
    this.programs.clear();
  }

  syncFromVoicePlayback(map: Map<number, VoicePlaybackSettings>): void {
    this.mix = new Map([...map.entries()].map(([ch, s]) => [ch, { ...s }]));
  }

  resolveTrackSettings(track: TrackScore, voiceIndex = 0): VoiceRouteSettings {
    const mix = this.mix.get(track.channel) ?? defaultVoiceSettings(voiceIndex);
    return {
      channel: track.channel,
      program: this.programs.get(track.channel) ?? track.program,
      engine: this.defaults.engine,
      soundbank: this.defaults.soundbank,
      timbre: mix.timbre,
      gain: mix.gain,
      muted: mix.muted,
      solo: mix.solo,
    };
  }

  /** Build the Map shape MidiPreviewPlayer expects. */
  toVoicePlaybackMap(tracks: TrackScore[]): Map<number, VoicePlaybackSettings> {
    const out = new Map<number, VoicePlaybackSettings>();
    tracks.forEach((track, index) => {
      const s = this.resolveTrackSettings(track, index);
      out.set(track.channel, { timbre: s.timbre, gain: s.gain, muted: s.muted, solo: s.solo });
    });
    return out;
  }
}
