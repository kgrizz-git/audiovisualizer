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
import { cdnSoundfontLoopUrl } from '../src/audio/soundfont/soundfontLoopLoader.js';

function withNoLoopFetch(handler: (url: string) => Promise<Response>) {
  return vi.fn(async (url: string) => {
    if (String(url).includes('-loop.json')) return { ok: false, status: 404 } as Response;
    return handler(url);
  });
}

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

  it('tolerates the trailing comma present in real midi-js files', () => {
    const text =
      'MIDI.Soundfont.acoustic_grand_piano = {\n' +
      '"C4": "data:audio/mp3;base64,AQID",\n' +
      '"D4": "data:audio/mp3;base64,BAUG",\n' +
      '}\n';
    const map = parseMidiJsSoundfontScript(text, 'acoustic_grand_piano');
    expect(Object.keys(map).sort()).toEqual(['C4', 'D4']);
    expect(map.D4).toBe('data:audio/mp3;base64,BAUG');
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
    const fetchMock = withNoLoopFetch(async (url: string) => {
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

  it('falls through to the CDN when the local asset returns SPA index.html (200)', async () => {
    const decode = vi.fn(async () => ({ duration: 0.1 } as AudioBuffer));
    const script = readFileSync(
      new URL('./fixtures/midi-js-acoustic_grand_piano-snippet.js', import.meta.url),
      'utf8',
    );
    const fetchMock = withNoLoopFetch(async (url: string) => {
      if (String(url).startsWith('/soundfonts/')) {
        // dev server / SPA host answers a missing asset with index.html + 200
        return { ok: true, text: async () => '<!DOCTYPE html><html><body>app</body></html>' } as Response;
      }
      return { ok: true, text: async () => script } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const loader = new SoundfontPatchLoader(decode);
    const patch = await loader.loadPatch('FluidR3_GM', 0);
    expect(patch).not.toBeNull();
    expect(patch!.slug).toBe('acoustic_grand_piano');
    expect(fetchMock).toHaveBeenCalledTimes(4); // local script, CDN script, local loop 404, CDN loop 404
    vi.unstubAllGlobals();
  });

  it('reads a cached script without fetching', async () => {
    const scriptText = readFileSync(
      new URL('./fixtures/midi-js-acoustic_grand_piano-snippet.js', import.meta.url),
      'utf8',
    );
    const cacheKey = cdnSoundfontUrl('FluidR3_GM', 'acoustic_grand_piano');
    const loopCacheKey = cdnSoundfontLoopUrl('FluidR3_GM', 'yamaha_grand_piano');
    const store = new Map<string, string>([
      [cacheKey, scriptText],
      [loopCacheKey, '{}'],
    ]);
    const cache = {
      match: vi.fn(async (k: string) => (store.has(k) ? ({ text: async () => store.get(k)! } as unknown as Response) : undefined)),
      put: vi.fn(async (k: string, resp: Response) => { store.set(k, await resp.text()); }),
    };
    vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
    vi.stubGlobal('fetch', withNoLoopFetch(async () => {
      throw new Error('network should not be hit');
    }));

    const loader = new SoundfontPatchLoader(async () => ({ duration: 0.1 } as AudioBuffer));
    const patch = await loader.loadPatch('FluidR3_GM', 0);

    expect(patch).not.toBeNull();
    expect(cache.match).toHaveBeenCalledWith(cacheKey);
    vi.unstubAllGlobals();
  });

  it('attaches loop metadata when goldst loop JSON is available', async () => {
    const scriptText = readFileSync(
      new URL('./fixtures/midi-js-acoustic_grand_piano-snippet.js', import.meta.url),
      'utf8',
    );
    const loopText = JSON.stringify({ C4: [4410, 8820] });
    const fetchMock = vi.fn(async (url: string) => {
      const s = String(url);
      if (s.includes('yamaha_grand_piano-loop.json')) {
        if (s.startsWith('https://')) return { ok: true, text: async () => loopText } as Response;
        return { ok: false, status: 404 } as Response;
      }
      if (s.startsWith('/soundfonts/')) {
        return { ok: false, status: 404 } as Response;
      }
      return { ok: true, text: async () => scriptText } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('caches', undefined);
    const loader = new SoundfontPatchLoader(async () => ({ duration: 0.1 } as AudioBuffer));
    const patch = await loader.loadPatch('FluidR3_GM', 0);
    expect(patch?.loops?.[60]).toEqual([0.1, 0.2]);
    vi.unstubAllGlobals();
  });

  it('writes a freshly fetched script into the cache', async () => {
    const scriptText = readFileSync(
      new URL('./fixtures/midi-js-acoustic_grand_piano-snippet.js', import.meta.url),
      'utf8',
    );
    const cacheKey = cdnSoundfontUrl('FluidR3_GM', 'acoustic_grand_piano');
    const store = new Map<string, string>();
    const cache = {
      match: vi.fn(async (k: string) => (store.has(k) ? ({ text: async () => store.get(k)! } as unknown as Response) : undefined)),
      put: vi.fn(async (k: string, resp: Response) => { store.set(k, await resp.text()); }),
    };
    vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
    // local 404, CDN ok
    vi.stubGlobal('fetch', withNoLoopFetch(async (url: string) =>
      String(url).startsWith('/soundfonts/')
        ? ({ ok: false, status: 404 } as Response)
        : ({ ok: true, text: async () => scriptText } as Response)));

    const loader = new SoundfontPatchLoader(async () => ({ duration: 0.1 } as AudioBuffer));
    await loader.loadPatch('FluidR3_GM', 0);

    expect(cache.put).toHaveBeenCalledWith(cacheKey, expect.anything());
    expect(store.get(cacheKey)).toBe(scriptText);
    vi.unstubAllGlobals();
  });
});

