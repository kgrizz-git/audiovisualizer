import { NoteEvent, Score } from '../core/types.js';
import { LookaheadScheduler, TimedTask } from './playbackScheduler.js';

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
  private scheduler: LookaheadScheduler | null = null;

  constructor(context?: AudioContext) {
    this.context = context ?? null;
  }

  public async start(
    score: Score,
    offsetSeconds: number,
    voices: Map<number, VoicePlaybackSettings>,
    opts?: { channels?: number[] },
  ): Promise<void> {
    this.stop();
    if (!this.context && typeof AudioContext !== 'undefined') {
      this.context = new AudioContext();
    }
    await this.context?.resume();
    const now = (this.context?.currentTime ?? 0) + 0.03;
    const tracks = selectAudibleTracks(score, voices, opts?.channels);
    const tasks: TimedTask[] = [];
    for (const track of tracks) {
      const index = score.tracks.indexOf(track);
      const settings = voices.get(track.channel) ?? defaultVoiceSettings(index);
      for (const note of track.notes) {
        if (note.onset + note.duration <= offsetSeconds) continue;
        const at = now + Math.max(0, note.onset - offsetSeconds);
        tasks.push({ at, run: () => this.schedule(note, offsetSeconds, now, settings) });
      }
    }
    this.scheduler = new LookaheadScheduler(tasks, () => this.context?.currentTime ?? 0);
    this.scheduler.start();
  }

  public stop(): void {
    this.scheduler?.stop();
    this.scheduler = null;
    this.activeSources.forEach((source) => {
      try {
        source.stop();
      } catch {
        /* source already ended */
      }
    });
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
    oscillator.onended = () => {
      this.activeSources = this.activeSources.filter((source) => source !== oscillator);
    };
    this.activeSources.push(oscillator);
  }
}

const PREVIEW_TIMBRES: SynthTimbre[] = ['sine', 'triangle', 'sawtooth', 'square'];

/**
 * Default local-synth settings for a score voice.
 * Timbre cycles by voice order so different tracks sound distinct even when they share a MIDI program.
 */
export function defaultVoiceSettings(voiceIndex: number): VoicePlaybackSettings {
  const index = ((Math.trunc(voiceIndex) % PREVIEW_TIMBRES.length) + PREVIEW_TIMBRES.length) % PREVIEW_TIMBRES.length;
  return { timbre: PREVIEW_TIMBRES[index], gain: 1, muted: false, solo: false };
}

export function selectAudibleTracks(
  score: Score,
  voices: Map<number, VoicePlaybackSettings>,
  channels?: number[],
): Score['tracks'] {
  const hasSolo = [...voices.values()].some((settings) => settings.solo);
  const allow = channels ? new Set(channels) : null;
  return score.tracks.filter((track, index) => {
    if (allow && !allow.has(track.channel)) return false;
    const settings = voices.get(track.channel) ?? defaultVoiceSettings(index);
    if (settings.muted || (hasSolo && !settings.solo)) return false;
    return true;
  });
}
