import { MidiPreviewPlayer, noteVolume } from '../midiPreviewPlayer.js';
import { applyNoteEnvelope, noteSourceStopTime } from '../noteEnvelope.js';
import { NoteEvent, Score } from '../../core/types.js';
import { SoundfontPatchLoader } from './soundfontPatchLoader.js';
import { InstrumentPatch, PatchStatus, SoundbankPreset } from './soundfontTypes.js';
import { VoiceRouter } from './voiceRouter.js';
import {
  buildSustainWindows,
  getSustainedDuration,
  playbackEndTime,
  sustainEventsForChannel,
} from './sustainWindows.js';
import { midiFromNoteName, nearestSampleKey } from './midiNoteName.js';
import { LookaheadScheduler, TimedTask } from '../playbackScheduler.js';

export interface SoundfontPlayerDeps {
  loader: SoundfontPatchLoader;
  createFallback?: (context: AudioContext) => MidiPreviewPlayer;
}

function createMockAudioContext(): AudioContext {
  const mockGainNode = {
    gain: {
      setValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
    },
    connect: () => mockGainNode,
    disconnect: () => {},
  };
  const mockSourceNode = {
    buffer: null,
    loop: false,
    loopStart: 0,
    loopEnd: 0,
    playbackRate: { value: 1 },
    connect: () => mockGainNode,
    start: () => {},
    stop: () => {},
    onended: null as (() => void) | null,
  };
  return {
    resume: async () => {},
    currentTime: 0,
    createGain: () => mockGainNode,
    createBufferSource: () => mockSourceNode,
    destination: {} as AudioDestinationNode,
  } as unknown as AudioContext;
}

export class SoundfontPlayer {
  private context: AudioContext | null = null;
  private generation = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private fallback: MidiPreviewPlayer | null = null;
  private status = new Map<number, PatchStatus>();
  private scheduler: LookaheadScheduler | null = null;
  private masterGain: GainNode | null = null;
  private readonly loader: SoundfontPatchLoader;
  private readonly createFallback: (context: AudioContext) => MidiPreviewPlayer;

  constructor(deps: SoundfontPlayerDeps) {
    this.loader = deps.loader;
    this.createFallback = deps.createFallback ?? ((ctx) => new MidiPreviewPlayer(ctx));
  }

  async start(
    score: Score,
    offsetSeconds: number,
    opts: { router: VoiceRouter; context?: AudioContext },
  ): Promise<void> {
    this.stop();
    const localGen = ++this.generation;
    this.context = opts.context ?? this.context ?? (
      typeof AudioContext !== 'undefined'
        ? new AudioContext()
        : createMockAudioContext()
    );
    await this.context.resume();
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);
    this.fallback = this.createFallback(this.context);

    const defaults = opts.router.getDefaults();
    const voices = opts.router.toVoicePlaybackMap(score.tracks);

    if (defaults.engine === 'oscillator') {
      await this.fallback.start(score, offsetSeconds, voices);
      return;
    }

    const audible = score.tracks.filter((track, index) => {
      const s = opts.router.resolveTrackSettings(track, index);
      return !s.muted && (![...voices.values()].some((v) => v.solo) || s.solo);
    });

    for (const track of audible) {
      this.status.set(track.channel, 'loading');
    }

    const unique = new Map<string, { bank: SoundbankPreset; program: number; channels: number[] }>();
    for (const track of audible) {
      const bank = defaults.soundbank;
      const program = opts.router.resolveTrackSettings(track).program;
      const key = `${bank}:${program}`;
      const entry = unique.get(key) ?? { bank, program, channels: [] };
      entry.channels.push(track.channel);
      unique.set(key, entry);
    }

    const loaded = await Promise.all(
      [...unique.values()].map(async (entry) => ({
        ...entry,
        patch: await this.loader.loadPatch(entry.bank, entry.program),
      })),
    );
    if (this.generation !== localGen) return;

    const readyChannels = new Set<number>();
    const patchByChannel = new Map<number, InstrumentPatch>();
    for (const row of loaded) {
      if (!row.patch) continue;
      for (const ch of row.channels) {
        readyChannels.add(ch);
        patchByChannel.set(ch, row.patch);
      }
    }

    for (const ch of readyChannels) {
      this.status.set(ch, 'loaded');
    }

    const now = this.context.currentTime + 0.03;
    const scorePlaybackEnd = playbackEndTime(score);
    const tasks: TimedTask[] = [];
    for (const track of audible) {
      const patch = patchByChannel.get(track.channel);
      if (!patch) continue;
      const route = opts.router.resolveTrackSettings(track);
      const windows = buildSustainWindows(
        sustainEventsForChannel(score, track.channel),
        scorePlaybackEnd,
      );
      for (const note of track.notes) {
        if (note.onset + getSustainedDuration(note, windows) <= offsetSeconds) continue;
        const at = now + Math.max(0, note.onset - offsetSeconds);
        tasks.push({ at, run: () => this.scheduleSample(note, offsetSeconds, now, patch, route.gain, windows) });
      }
    }
    this.scheduler = new LookaheadScheduler(tasks, () => this.context?.currentTime ?? 0);
    this.scheduler.start();

    const missChannels = audible
      .map((t) => t.channel)
      .filter((ch) => !readyChannels.has(ch));
    for (const ch of missChannels) {
      this.status.set(ch, 'fallback');
    }
    if (missChannels.length > 0) {
      await this.fallback.start(score, offsetSeconds, voices, { channels: missChannels });
    }
  }

  getStatusMap(): Map<number, PatchStatus> {
    return new Map(this.status);
  }

  stop(): void {
    this.generation += 1;
    this.status.clear();
    this.scheduler?.stop();
    this.scheduler = null;
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        /* already ended */
      }
    }
    this.activeSources = [];
    this.fallback?.stop();
    if (this.masterGain) {
      try { this.masterGain.disconnect(); } catch { /* already disconnected */ }
    }
    this.masterGain = null;
  }

  private scheduleSample(
    note: NoteEvent,
    offset: number,
    now: number,
    patch: InstrumentPatch,
    gainMul: number,
    windows: { start: number; end: number }[],
  ): void {
    if (!this.context) return;
    const duration = getSustainedDuration(note, windows);
    if (note.onset + duration <= offset) return;
    const delay = Math.max(0, note.onset - offset);
    const playDuration = Math.max(0.03, duration - Math.max(0, offset - note.onset));
    const keys = Object.keys(patch.buffers);
    const key = nearestSampleKey(note.pitch, keys);
    const buffer = patch.buffers[key];
    if (!buffer) return;

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 2 ** ((note.pitch - midiFromNoteName(key)) / 12);

    const gain = this.context.createGain();
    const volume = noteVolume(note.velocity, gainMul);
    const start = now + delay;
    const end = start + playDuration;
    const release = applyNoteEnvelope(gain.gain, { start, end, peak: volume });
    const sampleMidi = midiFromNoteName(key);
    const loopRegion = patch.loops?.[sampleMidi];
    if (loopRegion) {
      source.loop = true;
      source.loopStart = loopRegion[0];
      source.loopEnd = loopRegion[1];
    }
    const destination = this.masterGain ?? this.context.destination;
    source.connect(gain).connect(destination);
    source.start(start);
    source.stop(noteSourceStopTime(end, release));
    source.onended = () => {
      this.activeSources = this.activeSources.filter((s) => s !== source);
    };
    this.activeSources.push(source);
  }
}
