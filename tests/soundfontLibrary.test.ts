import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getCacheStatus,
  clearSoundfontCache,
  prefetchBank,
} from '../src/audio/soundfont/soundfontLibrary.js';
import { GM_INSTRUMENT_SLUGS } from '../src/audio/soundfont/gmInstrumentSlugs.js';
import { cdnSoundfontUrl } from '../src/audio/soundfont/soundfontPatchLoader.js';

const SCRIPT = 'MIDI.Soundfont.instrument = {"C4":"data:audio/mp3;base64,AQID"}';

function stubCache(store: Map<string, string>) {
  const cache = {
    match: vi.fn(async (k: string) => (store.has(k) ? { text: async () => store.get(k)! } : undefined)),
    put: vi.fn(async (k: string, resp: Response) => { store.set(k, await resp.text()); }),
  };
  const deleted = { value: false };
  vi.stubGlobal('caches', {
    open: vi.fn(async () => cache),
    delete: vi.fn(async () => { store.clear(); deleted.value = true; return true; }),
  });
  return { cache, deleted };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('soundfontLibrary', () => {
  it('reports availability=false when CacheStorage is missing', async () => {
    const status = await getCacheStatus('FluidR3_GM');
    expect(status.available).toBe(false);
    expect(status.total).toBe(GM_INSTRUMENT_SLUGS.length);
  });

  it('counts cached instruments', async () => {
    const store = new Map<string, string>([
      [cdnSoundfontUrl('FluidR3_GM', 'violin'), SCRIPT],
      [cdnSoundfontUrl('FluidR3_GM', 'flute'), SCRIPT],
    ]);
    stubCache(store);
    const status = await getCacheStatus('FluidR3_GM');
    expect(status.available).toBe(true);
    expect(status.cached).toBe(2);
  });

  it('prefetches every instrument into the cache under the loader key', async () => {
    const store = new Map<string, string>();
    stubCache(store);
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      String(url).startsWith('/soundfonts/')
        ? ({ ok: false, status: 404 } as Response)
        : ({ ok: true, text: async () => SCRIPT } as Response)));

    const progress: number[] = [];
    const result = await prefetchBank('FluidR3_GM', (p) => progress.push(p.done));

    expect(result.ok).toBe(GM_INSTRUMENT_SLUGS.length);
    expect(result.failed).toBe(0);
    expect(result.aborted).toBe(false);
    expect(store.has(cdnSoundfontUrl('FluidR3_GM', 'violin'))).toBe(true);
    expect(progress.length).toBe(GM_INSTRUMENT_SLUGS.length);
  });

  it('stops early when aborted', async () => {
    stubCache(new Map());
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => SCRIPT } as Response)));
    const controller = new AbortController();
    controller.abort();
    const result = await prefetchBank('FluidR3_GM', undefined, controller.signal);
    expect(result.aborted).toBe(true);
    expect(result.ok).toBe(0);
  });

  it('clearSoundfontCache empties the cache', async () => {
    const store = new Map<string, string>([[cdnSoundfontUrl('FluidR3_GM', 'violin'), SCRIPT]]);
    stubCache(store);
    expect(await clearSoundfontCache()).toBe(true);
    expect(store.size).toBe(0);
  });
});
