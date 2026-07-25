import { describe, it, expect, vi } from 'vitest';
import { SoundfontPlayer } from '../src/audio/soundfont/soundfontPlayer.js';
import { VoiceRouter } from '../src/audio/soundfont/voiceRouter.js';
import { Score } from '../src/core/types.js';

function demoScore(): Score {
  return {
    title: 't', duration: 2, bpm: 120,
    tracks: [
      {
        name: 'piano', channel: 0, program: 0, instrumentName: 'Acoustic Grand Piano',
        notes: [{ id: 'n1', pitch: 60, onset: 0, duration: 0.5, velocity: 100, voice: 0, pitchClass: 0 }],
        sustainEvents: [],
      },
      {
        name: 'bass', channel: 1, program: 32, instrumentName: 'Acoustic Bass',
        notes: [{ id: 'n2', pitch: 36, onset: 0, duration: 0.5, velocity: 100, voice: 1, pitchClass: 0 }],
        sustainEvents: [],
      },
    ],
  };
}

describe('SoundfontPlayer', () => {
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
    const opts = fallbackStart.mock.calls[0][3] as { channels?: number[] };
    expect(opts.channels?.sort()).toEqual([0, 1]);
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
    const opts = fallbackStart.mock.calls[0][3] as { channels?: number[] };
    expect(opts.channels).toEqual([1]);
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
            name: 'lower', channel: 0, program: 0, instrumentName: 'Acoustic Grand Piano',
            notes: [{ id: 'n1', pitch: 60, onset: 0, duration: 0.5, velocity: 90, voice: 0, pitchClass: 0 }],
            sustainEvents: [],
          },
          {
            name: 'upper', channel: 1, program: 0, instrumentName: 'Acoustic Grand Piano',
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
      const opts = fallbackStart.mock.calls[0][3] as { channels?: number[] };
      expect(opts.channels?.sort()).toEqual([0, 1]);
    });
  });
});
