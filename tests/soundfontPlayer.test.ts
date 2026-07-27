import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SoundfontPlayer } from '../src/audio/soundfont/soundfontPlayer.js';
import { VoiceRouter } from '../src/audio/soundfont/voiceRouter.js';
import { Score } from '../src/core/types.js';
import { resetCachedDrumKit } from '../src/audio/soundfont/drumkitLoader.js';

function demoScore(): Score {
  return {
    title: 't', duration: 2, bpm: 120,
    tracks: [
      {
        name: 'piano', channel: 0, program: 0, instrumentName: 'Acoustic Grand Piano', isPercussion: false,
        notes: [{ id: 'n1', pitch: 60, onset: 0, duration: 0.5, velocity: 100, voice: 0, pitchClass: 0 }],
        sustainEvents: [],
      },
      {
        name: 'bass', channel: 1, program: 32, instrumentName: 'Acoustic Bass', isPercussion: false,
        notes: [{ id: 'n2', pitch: 36, onset: 0, duration: 0.5, velocity: 100, voice: 1, pitchClass: 0 }],
        sustainEvents: [],
      },
    ],
  };
}

describe('SoundfontPlayer', () => {
  beforeEach(() => {
    resetCachedDrumKit();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('calls fallback start once with all channels when every patch is null', async () => {
    const fallbackStart = vi.fn(async (..._args: unknown[]) => {});
    const fallbackStop = vi.fn();
    const loader = { loadPatch: vi.fn(async () => null) };
    const player = new SoundfontPlayer({
      loader: loader as never,
      createFallback: () => ({ start: fallbackStart, stop: fallbackStop }) as never,
    });
    const router = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
    await player.start(demoScore(), 0, { router });
    expect(fallbackStart).toHaveBeenCalledTimes(1);
    const opts = fallbackStart.mock.calls[0][3] as { tracks?: Score['tracks'] };
    expect(opts.tracks?.map((t) => t.channel).sort()).toEqual([0, 1]);
  });

  it('passes only miss channels to fallback when some patches load', async () => {
    const fallbackStart = vi.fn(async (..._args: unknown[]) => {});
    const fakeBuffer = {} as AudioBuffer;
    const loader = {
      loadPatch: vi.fn(async (_bank: string, program: number) => {
        if (program !== 0) return null;
        return {
          bank: 'FluidR3_GM', program: 0, slug: 'acoustic_grand_piano',
          buffers: { C4: fakeBuffer },
        };
      }),
    };
    const player = new SoundfontPlayer({
      loader: loader as never,
      createFallback: () => ({ start: fallbackStart, stop: vi.fn() }) as never,
    });
    const router = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
    await player.start(demoScore(), 0, { router });
    expect(fallbackStart).toHaveBeenCalledTimes(1);
    const opts = fallbackStart.mock.calls[0][3] as { tracks?: Score['tracks'] };
    expect(opts.tracks?.map((t) => t.channel)).toEqual([1]);
  });

  it('stop invokes fallback stop', async () => {
    const fallbackStop = vi.fn();
    const player = new SoundfontPlayer({
      loader: { loadPatch: vi.fn(async () => null) } as never,
      createFallback: () => ({ start: vi.fn(async () => {}), stop: fallbackStop }) as never,
    });
    const router = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
    await player.start(demoScore(), 0, { router });
    player.stop();
    expect(fallbackStop).toHaveBeenCalled();
  });

  it('reports loaded vs fallback status per channel', async () => {
    const fakeBuffer = {} as AudioBuffer;
    const loader = {
      loadPatch: vi.fn(async (_bank: string, program: number) =>
        program === 0
          ? { bank: 'FluidR3_GM', program: 0, slug: 'acoustic_grand_piano', buffers: { C4: fakeBuffer } }
          : null),
    };
    const player = new SoundfontPlayer({
      loader: loader as never,
      createFallback: () => ({ start: vi.fn(async () => {}), stop: vi.fn() }) as never,
    });
    const router = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
    await player.start(demoScore(), 0, { router });

    const status = player.getStatusMap();
    expect(status.get(0)).toBe('loaded');   // program 0 patch resolved
    expect(status.get(1)).toBe('fallback'); // program 32 patch null
  });

  it('clears status on stop', async () => {
    const player = new SoundfontPlayer({
      loader: { loadPatch: vi.fn(async () => null) } as never,
      createFallback: () => ({ start: vi.fn(async () => {}), stop: vi.fn() }) as never,
    });
    const router = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
    await player.start(demoScore(), 0, { router });
    player.stop();
    expect(player.getStatusMap().size).toBe(0);
  });

  it('loads the overridden program, not the track program', async () => {
    const loadPatch = vi.fn<(bank: string, program: number) => Promise<null>>(async () => null);
    const player = new SoundfontPlayer({
      loader: { loadPatch } as never,
      createFallback: () => ({ start: vi.fn(async () => {}), stop: vi.fn() }) as never,
    });
    const router = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
    router.setProgram(0, 40); // track 0's stored program is 0
    await player.start(demoScore(), 0, { router });
    const programs = loadPatch.mock.calls.map((c) => c[1]);
    expect(programs).toContain(40);
    expect(programs).not.toContain(0);
  });

  describe('two voices sharing one GM program (e.g. Bach prelude, both piano)', () => {
    function twoPianoScore(): Score {
      return {
        title: 't', duration: 1, bpm: 120,
        tracks: [
          {
            name: 'lower', channel: 0, program: 0, instrumentName: 'Acoustic Grand Piano', isPercussion: false,
            notes: [{ id: 'n1', pitch: 60, onset: 0, duration: 0.5, velocity: 90, voice: 0, pitchClass: 0 }],
            sustainEvents: [],
          },
          {
            name: 'upper', channel: 1, program: 0, instrumentName: 'Acoustic Grand Piano', isPercussion: false,
            notes: [{ id: 'n2', pitch: 72, onset: 0, duration: 0.5, velocity: 90, voice: 1, pitchClass: 0 }],
            sustainEvents: [],
          },
        ],
      };
    }

    it('loads the shared patch once and marks both channels loaded (no per-channel synth split)', async () => {
      const fakeBuffer = {} as AudioBuffer;
      const loadPatch = vi.fn(async () => ({
        bank: 'FluidR3_GM', program: 0, slug: 'acoustic_grand_piano', buffers: { C4: fakeBuffer },
      }));
      const player = new SoundfontPlayer({
        loader: { loadPatch } as never,
        createFallback: () => ({ start: vi.fn(async () => {}), stop: vi.fn() }) as never,
      });
      const router = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
      await player.start(twoPianoScore(), 0, { router });
      expect(loadPatch).toHaveBeenCalledTimes(1);
      const status = player.getStatusMap();
      expect(status.get(0)).toBe('loaded');
      expect(status.get(1)).toBe('loaded');
    });

    it('falls back to synth for BOTH voices when the shared patch fails (not just the upper)', async () => {
      const fallbackStart = vi.fn(async (..._args: unknown[]) => {});
      const player = new SoundfontPlayer({
        loader: { loadPatch: vi.fn(async () => null) } as never,
        createFallback: () => ({ start: fallbackStart, stop: vi.fn() }) as never,
      });
      const router = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
      await player.start(twoPianoScore(), 0, { router });
      const status = player.getStatusMap();
      expect(status.get(0)).toBe('fallback');
      expect(status.get(1)).toBe('fallback');
      const opts = fallbackStart.mock.calls[0][3] as { tracks?: Score['tracks'] };
      expect(opts.tracks?.map((t) => t.channel).sort()).toEqual([0, 1]);
    });
  });

  it('enables AudioBufferSourceNode looping when patch loop metadata exists for the sample key', async () => {
    const fakeBuffer = {} as AudioBuffer;
    const createdSources: Array<{
      loop: boolean;
      loopStart: number;
      loopEnd: number;
    }> = [];
    const mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(() => ({ connect: vi.fn() })),
    };
    const mockContext = {
      resume: async () => {},
      currentTime: 0,
      createGain: () => mockGain,
      createBufferSource: () => {
        const source = {
          buffer: null as AudioBuffer | null,
          loop: false,
          loopStart: 0,
          loopEnd: 0,
          playbackRate: { value: 1 },
          connect: vi.fn(() => mockGain),
          start: vi.fn(),
          stop: vi.fn(),
          onended: null as (() => void) | null,
        };
        createdSources.push(source);
        return source;
      },
      destination: {},
    } as unknown as AudioContext;

    const loader = {
      loadPatch: vi.fn(async () => ({
        bank: 'FluidR3_GM',
        program: 42,
        slug: 'cello',
        buffers: { C4: fakeBuffer },
        loops: { 60: [1.5, 2.0] },
      })),
    };
    const player = new SoundfontPlayer({
      loader: loader as never,
      createFallback: () => ({ start: vi.fn(async () => {}), stop: vi.fn() }) as never,
    });
    const router = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
    const score: Score = {
      title: 'loop', duration: 1, bpm: 120,
      tracks: [{
        name: 'cello', channel: 0, program: 42, instrumentName: 'Cello', isPercussion: false,
        notes: [{ id: 'n1', pitch: 60, onset: 0, duration: 0.5, velocity: 100, voice: 0, pitchClass: 0 }],
        sustainEvents: [],
      }],
    };
    await player.start(score, 0, { router, context: mockContext });
    expect(createdSources.length).toBeGreaterThan(0);
    expect(createdSources[0].loop).toBe(true);
    expect(createdSources[0].loopStart).toBe(1.5);
    expect(createdSources[0].loopEnd).toBe(2.0);
  });

  it('leaves loop disabled when patch has no loop metadata', async () => {
    const fakeBuffer = {} as AudioBuffer;
    const createdSources: Array<{ loop: boolean }> = [];
    const mockGain = {
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(() => ({ connect: vi.fn() })),
    };
    const mockContext = {
      resume: async () => {},
      currentTime: 0,
      createGain: () => mockGain,
      createBufferSource: () => {
        const source = {
          buffer: null as AudioBuffer | null,
          loop: false,
          loopStart: 0,
          loopEnd: 0,
          playbackRate: { value: 1 },
          connect: vi.fn(() => mockGain),
          start: vi.fn(),
          stop: vi.fn(),
          onended: null as (() => void) | null,
        };
        createdSources.push(source);
        return source;
      },
      destination: {},
    } as unknown as AudioContext;

    const loader = {
      loadPatch: vi.fn(async () => ({
        bank: 'FluidR3_GM', program: 0, slug: 'acoustic_grand_piano', buffers: { C4: fakeBuffer },
      })),
    };
    const player = new SoundfontPlayer({
      loader: loader as never,
      createFallback: () => ({ start: vi.fn(async () => {}), stop: vi.fn() }) as never,
    });
    const router = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
    await player.start(demoScore(), 0, { router, context: mockContext });
    expect(createdSources.length).toBeGreaterThan(0);
    expect(createdSources[0].loop).toBe(false);
  });

  describe('Routing, drum kit, and track-scoped fallback', () => {
    it('handles collision regression: two split tracks sharing one channel load distinct patches', async () => {
      const loadPatch = vi.fn(async (bank: string, program: number) => ({
        bank: bank as any,
        program,
        slug: program === 0 ? 'piano' : 'organ',
        buffers: { C4: {} as AudioBuffer }
      }));
      const player = new SoundfontPlayer({
        loader: { loadPatch } as never,
        createFallback: () => ({ start: vi.fn(), stop: vi.fn() }) as never,
      });
      const router = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
      // Tracks share channel 0, but have different program overrides or source programs
      const score: Score = {
        title: 'collision', duration: 1, bpm: 120,
        tracks: [
          { name: 'piano', channel: 0, program: 0, instrumentName: 'Piano', isPercussion: false, notes: [], sustainEvents: [] },
          { name: 'organ', channel: 0, program: 19, instrumentName: 'Organ', isPercussion: false, notes: [], sustainEvents: [] },
        ]
      };
      await player.start(score, 0, { router });
      expect(loadPatch).toHaveBeenCalledTimes(2);
      expect(loadPatch).toHaveBeenCalledWith('FluidR3_GM', 0);
      expect(loadPatch).toHaveBeenCalledWith('FluidR3_GM', 19);
      expect(player.getStatusMap().get(0)).toBe('loaded');
    });

    it('drum routing: channel 9 track loads standard drum kit, sets status to drumkit', async () => {
      const script = `
        MIDI.Soundfont.marimba = {
          "C2": "data:audio/mp3;base64,AAAA"
        };
      `;
      vi.stubGlobal('fetch', vi.fn(async () => ({
        ok: true,
        text: async () => script
      } as Response)));
      
      const loadPatch = vi.fn();
      const decode = vi.fn(async () => ({ duration: 0.1 } as AudioBuffer));
      const player = new SoundfontPlayer({
        loader: { loadPatch, decode } as never,
        createFallback: () => ({ start: vi.fn(), stop: vi.fn() }) as never,
      });
      const router = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
      const score: Score = {
        title: 'drum-route', duration: 1, bpm: 120,
        tracks: [
          { name: 'drums', channel: 9, program: 0, instrumentName: 'Drums', isPercussion: true, notes: [], sustainEvents: [] },
        ]
      };
      await player.start(score, 0, { router });
      expect(player.getStatusMap().get(9)).toBe('drumkit');
    });

    it('oscillator carve-out: melodic tracks fall back to oscillator, percussion track still loads drumkit', async () => {
      const fallbackStart = vi.fn();
      const script = `
        MIDI.Soundfont.marimba = {
          "C2": "data:audio/mp3;base64,AAAA"
        };
      `;
      vi.stubGlobal('fetch', vi.fn(async () => ({
        ok: true,
        text: async () => script
      } as Response)));

      const loadPatch = vi.fn();
      const decode = vi.fn(async () => ({ duration: 0.1 } as AudioBuffer));
      const player = new SoundfontPlayer({
        loader: { loadPatch, decode } as never,
        createFallback: () => ({ start: fallbackStart, stop: vi.fn() }) as never,
      });
      // Set engine to oscillator
      const router = new VoiceRouter({ engine: 'oscillator', soundbank: 'FluidR3_GM' });
      const score: Score = {
        title: 'carve-out', duration: 1, bpm: 120,
        tracks: [
          { name: 'piano', channel: 0, program: 0, instrumentName: 'Piano', isPercussion: false, notes: [], sustainEvents: [] },
          { name: 'drums', channel: 9, program: 0, instrumentName: 'Drums', isPercussion: true, notes: [], sustainEvents: [] },
        ]
      };
      await player.start(score, 0, { router });
      // Melodic track status should be fallback, drums should be drumkit
      expect(player.getStatusMap().get(0)).toBe('fallback');
      expect(player.getStatusMap().get(9)).toBe('drumkit');
      
      // Melodic fallback should be started with the melodic track only
      expect(fallbackStart).toHaveBeenCalledTimes(1);
      const opts = fallbackStart.mock.calls[0][3] as { tracks?: Score['tracks'] };
      expect(opts.tracks?.map(t => t.name)).toEqual(['piano']);
    });

    it('drumkit-missing: status is set to drumkit-missing on failed drum kit load, percussion is silent', async () => {
      // Fetch returns 404 for drumkit
      vi.stubGlobal('fetch', vi.fn(async () => ({
        ok: false,
        status: 404
      } as Response)));

      const loadPatch = vi.fn();
      const decode = vi.fn();
      const player = new SoundfontPlayer({
        loader: { loadPatch, decode } as never,
        createFallback: () => ({ start: vi.fn(), stop: vi.fn() }) as never,
      });
      const router = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
      const score: Score = {
        title: 'drum-missing', duration: 1, bpm: 120,
        tracks: [
          { name: 'drums', channel: 9, program: 0, instrumentName: 'Drums', isPercussion: true, notes: [], sustainEvents: [] },
        ]
      };
      await player.start(score, 0, { router });
      expect(player.getStatusMap().get(9)).toBe('drumkit-missing');
    });

    it('piano loads / organ misses on same channel -> only organ notes fall back to oscillator', async () => {
      const fallbackStart = vi.fn();
      // Mock loader so piano (program 0) loads, but organ (program 19) fails (returns null)
      const loadPatch = vi.fn(async (bank: string, program: number) => {
        if (program === 0) {
          return {
            bank: bank as any,
            program,
            slug: 'piano',
            buffers: { C4: {} as AudioBuffer }
          };
        }
        return null;
      });

      const player = new SoundfontPlayer({
        loader: { loadPatch } as never,
        createFallback: () => ({ start: fallbackStart, stop: vi.fn() }) as never,
      });
      const router = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
      // Both share channel 0
      const score: Score = {
        title: 'partial-miss', duration: 1, bpm: 120,
        tracks: [
          { name: 'piano', channel: 0, program: 0, instrumentName: 'Piano', isPercussion: false, notes: [], sustainEvents: [] },
          { name: 'organ', channel: 0, program: 19, instrumentName: 'Organ', isPercussion: false, notes: [], sustainEvents: [] },
        ]
      };
      await player.start(score, 0, { router });
      
      // The channel status becomes 'fallback' because organ failed
      expect(player.getStatusMap().get(0)).toBe('fallback');
      
      // Fallback start should be called with only the organ track
      expect(fallbackStart).toHaveBeenCalledTimes(1);
      const opts = fallbackStart.mock.calls[0][3] as { tracks?: Score['tracks'] };
      expect(opts.tracks?.map(t => t.name)).toEqual(['organ']);
    });
  });
});
