import { NoteEvent, Score } from '../core/types.js';

export type SynthTimbre = 'sine' | 'triangle' | 'sawtooth' | 'square';

export interface VoicePlaybackSettings {
  timbre: SynthTimbre;
  gain: number;
  muted: boolean;
  solo: boolean;
}

/** Local Web Audio audition engine; this is a preview synth, not General MIDI playback. */
export class MidiPreviewPlayer {
  private context: AudioContext | null = null;
  private activeSources: OscillatorNode[] = [];

  public async start(score: Score, offsetSeconds: number, voices: Map<number, VoicePlaybackSettings>): Promise<void> {
    this.stop();
    this.context ??= new AudioContext();
    await this.context.resume();
    const now = this.context.currentTime + 0.03;
    const hasSolo = [...voices.values()].some((settings) => settings.solo);
    score.tracks.forEach((track) => {
      const settings = voices.get(track.channel) ?? defaultVoiceSettings(track.program);
      if (settings.muted || (hasSolo && !settings.solo)) return;
      track.notes.forEach((note) => this.schedule(note, offsetSeconds, now, settings));
    });
  }

  public stop(): void {
    this.activeSources.forEach((source) => { try { source.stop(); } catch { /* source already ended */ } });
    this.activeSources = [];
  }

  private schedule(note: NoteEvent, offset: number, now: number, settings: VoicePlaybackSettings): void {
    if (!this.context || note.onset + note.duration <= offset) return;
    const delay = Math.max(0, note.onset - offset);
    const duration = Math.max(0.03, note.duration - Math.max(0, offset - note.onset));
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = settings.timbre;
    oscillator.frequency.value = 440 * 2 ** ((note.pitch - 69) / 12);
    const volume = (0.035 + (note.velocity / 127) * 0.065) * settings.gain;
    const start = now + delay;
    const end = start + duration;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.02, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
    oscillator.onended = () => { this.activeSources = this.activeSources.filter((source) => source !== oscillator); };
    this.activeSources.push(oscillator);
  }
}

export function defaultVoiceSettings(program: number): VoicePlaybackSettings {
  const timbres: SynthTimbre[] = ['sine', 'triangle', 'sawtooth', 'square'];
  return { timbre: timbres[Math.floor(program / 32) % timbres.length], gain: 1, muted: false, solo: false };
}
