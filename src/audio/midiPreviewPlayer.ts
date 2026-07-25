import { NoteEvent, Score } from '../core/types.js';
import { applyNoteEnvelope, noteSourceStopTime } from './noteEnvelope.js';
import { LookaheadScheduler, TimedTask } from './playbackScheduler.js';
import {
  buildSustainWindows,
  getSustainedDuration,
  playbackEndTime,
  sustainEventsForChannel,
  SustainWindow,
} from './soundfont/sustainWindows.js';

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
  private masterGain: GainNode | null = null;

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
    this.masterGain = this.context?.createGain() ?? null;
    if (this.masterGain && this.context) this.masterGain.connect(this.context.destination);
    const now = (this.context?.currentTime ?? 0) + 0.03;
    const tracks = selectAudibleTracks(score, voices, opts?.channels);
    const scorePlaybackEnd = playbackEndTime(score);
    const tasks: TimedTask[] = [];
    for (const track of tracks) {
      const index = score.tracks.indexOf(track);
      const settings = voices.get(track.channel) ?? defaultVoiceSettings(index);
      const windows = buildSustainWindows(
        sustainEventsForChannel(score, track.channel),
        scorePlaybackEnd,
      );
      for (const note of track.notes) {
        if (note.onset + getSustainedDuration(note, windows) <= offsetSeconds) continue;
        const at = now + Math.max(0, note.onset - offsetSeconds);
        tasks.push({ at, run: () => this.schedule(note, offsetSeconds, now, settings, windows) });
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
    if (this.masterGain) {
      try { this.masterGain.disconnect(); } catch { /* already disconnected */ }
    }
    this.masterGain = null;
  }

  private schedule(
    note: NoteEvent,
    offset: number,
    now: number,
    settings: VoicePlaybackSettings,
    windows: SustainWindow[],
  ): void {
    if (!this.context) return;
    const sustainedDuration = getSustainedDuration(note, windows);
    if (note.onset + sustainedDuration <= offset) return;
    const delay = Math.max(0, note.onset - offset);
    const playDuration = Math.max(0.03, sustainedDuration - Math.max(0, offset - note.onset));
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = settings.timbre;
    oscillator.frequency.value = 440 * 2 ** ((note.pitch - 69) / 12);
    const volume = noteVolume(note.velocity, settings.gain);
    const start = now + delay;
    const end = start + playDuration;
    const release = applyNoteEnvelope(gain.gain, { start, end, peak: volume });
    const destination = this.masterGain ?? this.context.destination;
    oscillator.connect(gain).connect(destination);
    oscillator.start(start);
    oscillator.stop(noteSourceStopTime(end, release));
    oscillator.onended = () => {
      this.activeSources = this.activeSources.filter((source) => source !== oscillator);
    };
    this.activeSources.push(oscillator);
  }
}

const PREVIEW_TIMBRES: SynthTimbre[] = ['sine', 'triangle', 'sawtooth', 'square'];

/**
 * Per-note peak gain shared by the oscillator and SoundFont sample engines.
 * Lifting the base+scale keeps quiet scores audible; a per-voice `gain` multiply
 * (default 1) and the UI gain slider stay first-class overrides.
 */
export function noteVolume(velocity: number, gain: number): number {
  return (0.12 + (velocity / 127) * 0.18) * gain;
}

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
