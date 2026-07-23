import { MidiPreviewPlayer } from '../midiPreviewPlayer.js';
import { NoteEvent, Score } from '../../core/types.js';
import { SoundfontPatchLoader } from './soundfontPatchLoader.js';
import { InstrumentPatch, SoundbankPreset } from './soundfontTypes.js';
import { VoiceRouter } from './voiceRouter.js';
import { buildSustainWindows, getSustainedDuration, sustainEventsForChannel } from './sustainWindows.js';
import { midiFromNoteName, nearestSampleKey } from './midiNoteName.js';

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
  };
  const mockSourceNode = {
    buffer: null,
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

    const unique = new Map<string, { bank: SoundbankPreset; program: number; channels: number[] }>();
    for (const track of audible) {
      const bank = defaults.soundbank;
      const key = `${bank}:${track.program}`;
      const entry = unique.get(key) ?? { bank, program: track.program, channels: [] };
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

    const now = this.context.currentTime + 0.03;
    for (const track of audible) {
      const patch = patchByChannel.get(track.channel);
      if (!patch) continue;
      const route = opts.router.resolveTrackSettings(track);
      const windows = buildSustainWindows(
        sustainEventsForChannel(score, track.channel),
        score.duration,
      );
      for (const note of track.notes) {
        this.scheduleSample(note, offsetSeconds, now, patch, route.gain, windows);
      }
    }

    const missChannels = audible
      .map((t) => t.channel)
      .filter((ch) => !readyChannels.has(ch));
    if (missChannels.length > 0) {
      await this.fallback.start(score, offsetSeconds, voices, { channels: missChannels });
    }
  }

  stop(): void {
    this.generation += 1;
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        /* already ended */
      }
    }
    this.activeSources = [];
    this.fallback?.stop();
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
    const volume = (0.035 + (note.velocity / 127) * 0.065) * gainMul;
    const start = now + delay;
    const end = start + playDuration;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.02, playDuration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    source.connect(gain).connect(this.context.destination);
    source.start(start);
    source.stop(end + 0.02);
    source.onended = () => {
      this.activeSources = this.activeSources.filter((s) => s !== source);
    };
    this.activeSources.push(source);
  }
}
