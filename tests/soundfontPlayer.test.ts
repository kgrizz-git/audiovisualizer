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
});
