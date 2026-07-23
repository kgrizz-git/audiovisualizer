// @ts-ignore
import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import { getInstrumentSlug } from '../src/audio/soundfont/gmInstrumentSlugs.js';
import {
  parseMidiJsSoundfontScript,
  dataUriToArrayBuffer,
  localSoundfontUrl,
  cdnSoundfontUrl,
  SoundfontPatchLoader,
} from '../src/audio/soundfont/soundfontPatchLoader.js';

describe('GM slugs', () => {
  it('maps program 24 to acoustic_guitar_nylon', () => {
    expect(getInstrumentSlug(24)).toBe('acoustic_guitar_nylon');
  });
});

describe('URL builders', () => {
  it('builds local then CDN paths', () => {
    expect(localSoundfontUrl('FluidR3_GM', 'violin')).toBe('/soundfonts/FluidR3_GM/violin-mp3.js');
    expect(cdnSoundfontUrl('FluidR3_GM', 'violin')).toBe(
      'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/violin-mp3.js',
    );
  });
});

describe('parseMidiJsSoundfontScript', () => {
  it('parses the fixture into note→dataURI map', () => {
    const text = readFileSync(
      new URL('./fixtures/midi-js-acoustic_grand_piano-snippet.js', import.meta.url),
      'utf8',
    );
    const map = parseMidiJsSoundfontScript(text, 'acoustic_grand_piano');
    expect(Object.keys(map).sort()).toEqual(['C4', 'D4', 'E4']);
    expect(map.C4.startsWith('data:')).toBe(true);
  });
});

describe('dataUriToArrayBuffer', () => {
  it('decodes base64 payload', () => {
    const bytes = new Uint8Array(dataUriToArrayBuffer('data:audio/mp3;base64,AQID'));
    expect([...bytes]).toEqual([1, 2, 3]);
  });
});

describe('SoundfontPatchLoader.loadPatch', () => {
  it('uses CDN after local 404 and returns buffers from decoder', async () => {
    const decode = vi.fn(async () => ({ duration: 0.1 } as AudioBuffer));
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).startsWith('/soundfonts/')) {
        return { ok: false, status: 404 } as Response;
      }
      return {
        ok: true,
        text: async () => readFileSync(
          new URL('./fixtures/midi-js-acoustic_grand_piano-snippet.js', import.meta.url),
          'utf8',
        ),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const loader = new SoundfontPatchLoader(decode);
    const patch = await loader.loadPatch('FluidR3_GM', 0);
    expect(patch).not.toBeNull();
    expect(patch!.slug).toBe('acoustic_grand_piano');
    expect(Object.keys(patch!.buffers)).toEqual(expect.arrayContaining(['C4', 'D4', 'E4']));
    expect(decode).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('returns null when local and CDN fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 } as Response)));
    const loader = new SoundfontPatchLoader(async () => ({ duration: 0 } as AudioBuffer));
    expect(await loader.loadPatch('FluidR3_GM', 0)).toBeNull();
    vi.unstubAllGlobals();
  });
});
