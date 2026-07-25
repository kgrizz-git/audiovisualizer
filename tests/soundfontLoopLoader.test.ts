import { describe, it, expect, vi } from 'vitest';
import {
  getGoldstLoopSlugForGleitzSlug,
  getGoldstLoopSlugForProgram,
} from '../src/audio/soundfont/gmLoopSlugs.js';
import {
  LOOP_SAMPLE_RATE,
  cdnSoundfontLoopUrl,
  fetchSoundfontLoopMetadata,
  localSoundfontLoopUrl,
  normalizeLoopNoteName,
  parseSoundfontLoopJson,
} from '../src/audio/soundfont/soundfontLoopLoader.js';
import { midiFromNoteName } from '../src/audio/soundfont/midiNoteName.js';

describe('gmLoopSlugs', () => {
  it('maps known gleitz≠goldst mismatches', () => {
    expect(getGoldstLoopSlugForGleitzSlug('drawbar_organ')).toBe('drawbarorgan');
    expect(getGoldstLoopSlugForGleitzSlug('bright_acoustic_piano')).toBe('bright_yamaha_grand');
    expect(getGoldstLoopSlugForGleitzSlug('acoustic_grand_piano')).toBe('yamaha_grand_piano');
  });

  it('passes through matching slugs', () => {
    expect(getGoldstLoopSlugForGleitzSlug('violin')).toBe('violin');
    expect(getGoldstLoopSlugForGleitzSlug('cello')).toBe('cello');
  });

  it('returns null for instruments with no goldst loop file', () => {
    expect(getGoldstLoopSlugForGleitzSlug('electric_grand_piano')).toBeNull();
    expect(getGoldstLoopSlugForGleitzSlug('slap_bass_2')).toBeNull();
  });

  it('resolves program numbers via GM slug table', () => {
    expect(getGoldstLoopSlugForProgram(16)).toBe('drawbarorgan');
    expect(getGoldstLoopSlugForProgram(40)).toBe('violin');
    expect(getGoldstLoopSlugForProgram(2)).toBeNull();
  });
});

describe('soundfontLoopLoader URLs', () => {
  it('builds local and goldst CDN paths', () => {
    expect(localSoundfontLoopUrl('FluidR3_GM', 'cello')).toBe('/soundfonts/FluidR3_GM/cello-loop.json');
    expect(cdnSoundfontLoopUrl('FluidR3_GM', 'cello')).toBe(
      'https://goldst.dev/midi-js-soundfonts/FluidR3_GM/cello-loop.json',
    );
  });
});

describe('normalizeLoopNoteName', () => {
  it('converts flats to sharps for buffer key parity', () => {
    expect(normalizeLoopNoteName('Db4')).toBe('C#4');
    expect(normalizeLoopNoteName('C#4')).toBe('C#4');
  });
});

describe('parseSoundfontLoopJson', () => {
  it('converts frame pairs to seconds keyed by MIDI number', () => {
    const loops = parseSoundfontLoopJson(JSON.stringify({
      C4: [44100, 88200],
      Db4: [88200, 132300],
    }));
    expect(loops).not.toBeNull();
    expect(loops![60]).toEqual([1, 2]);
    expect(loops![midiFromNoteName('C#4')]).toEqual([2, 3]);
    expect(LOOP_SAMPLE_RATE).toBe(44100);
  });

  it('returns null for invalid JSON', () => {
    expect(parseSoundfontLoopJson('not json')).toBeNull();
  });

  it('returns empty object for {}', () => {
    expect(parseSoundfontLoopJson('{}')).toEqual({});
  });
});

describe('fetchSoundfontLoopMetadata', () => {
  it('soft-fails to null on 404 / network errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 } as Response)));
    vi.stubGlobal('caches', undefined);
    await expect(fetchSoundfontLoopMetadata('FluidR3_GM', 'missing_instrument')).resolves.toBeNull();
    vi.unstubAllGlobals();
  });

  it('prefers local bundled loop JSON', async () => {
    const payload = JSON.stringify({ C4: [4410, 8820] });
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('-loop.json') && String(url).startsWith('/soundfonts/')) {
        return { ok: true, text: async () => payload } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('caches', undefined);
    const loops = await fetchSoundfontLoopMetadata('FluidR3_GM', 'violin');
    expect(loops).toEqual({ 60: [0.1, 0.2] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
