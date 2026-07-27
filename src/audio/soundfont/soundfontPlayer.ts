import { MidiPreviewPlayer, noteVolume } from '../midiPreviewPlayer.js';
import { applyNoteEnvelope, noteSourceStopTime } from '../noteEnvelope.js';
import { NoteEvent, Score, TrackScore } from '../../core/types.js';
import { SoundfontPatchLoader } from './soundfontPatchLoader.js';
import { InstrumentPatch, PatchStatus, SoundbankPreset } from './soundfontTypes.js';
import { VoiceRouter } from './voiceRouter.js';
import {
  buildSustainWindows,
  getSustainedDuration,
  playbackEndTime,
  sustainEventsForChannel,
} from './sustainWindows.js';
import { midiFromNoteName, nearestSampleKey, midiNoteName } from './midiNoteName.js';
import { LookaheadScheduler, TimedTask } from '../playbackScheduler.js';
import { loadDrumKitPatch } from './drumkitLoader.js';

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
  private warnedDrumkitMissing = false;
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

    const audible = score.tracks.filter((track, index) => {
      const s = opts.router.resolveTrackSettings(track, index);
      return !s.muted && (![...voices.values()].some((v) => v.solo) || s.solo);
    });

    const melodicAudible = audible.filter((track) => !track.isPercussion);
    const percussionAudible = audible.filter((track) => track.isPercussion);

    for (const track of audible) {
      this.status.set(track.channel, 'loading');
    }

    // Load Drum Kit if there are any percussion tracks
    let drumKitPatch: InstrumentPatch | null = null;
    if (percussionAudible.length > 0) {
      try {
        drumKitPatch = await loadDrumKitPatch(this.loader.decode);
      } catch {
        drumKitPatch = null;
      }
      if (this.generation !== localGen) return;
      if (!drumKitPatch) {
        if (!this.warnedDrumkitMissing) {
          console.warn('Failed to load standard drum kit patch');
          this.warnedDrumkitMissing = true;
        }
      }
      for (const track of percussionAudible) {
        this.status.set(track.channel, drumKitPatch ? 'drumkit' : 'drumkit-missing');
      }
    }

    if (defaults.engine === 'oscillator') {
      for (const track of melodicAudible) {
        this.status.set(track.channel, 'fallback');
      }
      // Start fallback for melodic tracks
      if (melodicAudible.length > 0) {
        await this.fallback.start(score, offsetSeconds, voices, { tracks: melodicAudible });
      }
      if (this.generation !== localGen) return;

      // Schedule percussion notes if drum kit is loaded
      if (drumKitPatch) {
        const now = this.context.currentTime + 0.03;
        const scorePlaybackEnd = playbackEndTime(score);
        const tasks: TimedTask[] = [];
        for (const track of percussionAudible) {
          const route = opts.router.resolveTrackSettings(track);
          const windows = buildSustainWindows(
            sustainEventsForChannel(score, track.channel),
            scorePlaybackEnd,
          );
          for (const note of track.notes) {
            if (note.onset + getSustainedDuration(note, windows) <= offsetSeconds) continue;
            const at = now + Math.max(0, note.onset - offsetSeconds);
            tasks.push({
              at,
              run: () => this.schedulePercussionSample(note, offsetSeconds, now, drumKitPatch!, route.gain, windows),
            });
          }
        }
        this.scheduler = new LookaheadScheduler(tasks, () => this.context?.currentTime ?? 0);
        this.scheduler.start();
      }
      return;
    }

    // Melodic sample loading path
    const uniqueMelodic = new Map<string, { bank: SoundbankPreset; program: number; tracks: TrackScore[] }>();
    for (const track of melodicAudible) {
      const bank = defaults.soundbank;
      const program = opts.router.resolveTrackSettings(track).program;
      const key = `${bank}:${program}`;
      const entry = uniqueMelodic.get(key) ?? { bank, program, tracks: [] };
      entry.tracks.push(track);
      uniqueMelodic.set(key, entry);
    }

    const loadedMelodic = await Promise.all(
      [...uniqueMelodic.values()].map(async (entry) => ({
        ...entry,
        patch: await this.loader.loadPatch(entry.bank, entry.program),
      })),
    );
    if (this.generation !== localGen) return;

    const loadedPatches = new Map<string, InstrumentPatch | null>();
    for (const item of loadedMelodic) {
      loadedPatches.set(`${item.bank}:${item.program}`, item.patch);
    }

    const patchByChannelProgram = new Map<string, InstrumentPatch>();
    const melodicMissTracks: TrackScore[] = [];

    for (const track of melodicAudible) {
      const bank = defaults.soundbank;
      const resolvedProgram = opts.router.resolveTrackSettings(track).program;
      const patch = loadedPatches.get(`${bank}:${resolvedProgram}`);
      if (patch) {
        patchByChannelProgram.set(`${track.channel}:${resolvedProgram}`, patch);
      } else {
        melodicMissTracks.push(track);
      }
    }

    // Set melodic channels status
    const channelsWithMelodic = new Set(melodicAudible.map(t => t.channel));
    const channelsWithMelodicMiss = new Set(melodicMissTracks.map(t => t.channel));
    for (const ch of channelsWithMelodic) {
      if (channelsWithMelodicMiss.has(ch)) {
        this.status.set(ch, 'fallback');
      } else {
        this.status.set(ch, 'loaded');
      }
    }

    const now = this.context.currentTime + 0.03;
    const scorePlaybackEnd = playbackEndTime(score);
    const tasks: TimedTask[] = [];

    // Schedule melodic tracks
    for (const track of melodicAudible) {
      const resolvedProgram = opts.router.resolveTrackSettings(track).program;
      const patch = patchByChannelProgram.get(`${track.channel}:${resolvedProgram}`);
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

    // Schedule percussion tracks
    if (drumKitPatch) {
      for (const track of percussionAudible) {
        const route = opts.router.resolveTrackSettings(track);
        const windows = buildSustainWindows(
          sustainEventsForChannel(score, track.channel),
          scorePlaybackEnd,
        );
        for (const note of track.notes) {
          if (note.onset + getSustainedDuration(note, windows) <= offsetSeconds) continue;
          const at = now + Math.max(0, note.onset - offsetSeconds);
          tasks.push({
            at,
            run: () => this.schedulePercussionSample(note, offsetSeconds, now, drumKitPatch!, route.gain, windows),
          });
        }
      }
    }

    this.scheduler = new LookaheadScheduler(tasks, () => this.context?.currentTime ?? 0);
    this.scheduler.start();

    // Start fallback for melodic misses
    if (melodicMissTracks.length > 0) {
      await this.fallback.start(score, offsetSeconds, voices, { tracks: melodicMissTracks });
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

  private schedulePercussionSample(
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
    const key = midiNoteName(note.pitch);
    const buffer = patch.buffers[key];
    if (!buffer) return;

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 1;

    const gain = this.context.createGain();
    const volume = noteVolume(note.velocity, gainMul);
    const start = now + delay;
    const end = start + playDuration;
    const release = applyNoteEnvelope(gain.gain, { start, end, peak: volume });

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
