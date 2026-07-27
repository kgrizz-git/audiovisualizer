import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadDrumKitPatch, resetCachedDrumKit } from '../src/audio/soundfont/drumkitLoader.js';

const DRUMKIT_CDN_URL = 'https://henrikvilhelmberglund.com/midi-js-compat-soundfonts/GM-soundfonts/FluidR3_GM/drumkits/Standard-mp3.js';
const DRUMKIT_LOCAL_URL = '/soundfonts/FluidR3_GM/percussion/Standard-mp3.js';

describe('drumkitLoader', () => {
  beforeEach(() => {
    resetCachedDrumKit();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('tries local URL first, then CDN, and re-keys standard kit to drumkit-standard', async () => {
    const decode = vi.fn(async () => ({ duration: 0.1 } as AudioBuffer));
    const script = `
      if (typeof(MIDI) === 'undefined') var MIDI = {};
      if (typeof(MIDI.Soundfont) === 'undefined') MIDI.Soundfont = {};
      MIDI.Soundfont.marimba = {
        "C2": "data:audio/mp3;base64,AAAA",
        "D2": "data:audio/mp3;base64,AAAA"
      };
    `;

    const fetchMock = vi.fn(async (url: string) => {
      if (url === DRUMKIT_LOCAL_URL) {
        return { ok: false, status: 404 } as Response;
      }
      if (url === DRUMKIT_CDN_URL) {
        return {
          ok: true,
          text: async () => script,
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    vi.stubGlobal('fetch', fetchMock);

    const patch = await loadDrumKitPatch(decode);
    expect(patch).not.toBeNull();
    expect(patch!.slug).toBe('drumkit-standard');
    expect(patch!.bank).toBe('FluidR3_GM');
    expect(patch!.program).toBe(0);
    expect(Object.keys(patch!.buffers).sort()).toEqual(['C2', 'D2']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, DRUMKIT_LOCAL_URL);
    expect(fetchMock).toHaveBeenNthCalledWith(2, DRUMKIT_CDN_URL);
  });

  it('rejects SPA index.html responses and falls back', async () => {
    const decode = vi.fn(async () => ({ duration: 0.1 } as AudioBuffer));
    const script = `
      MIDI.Soundfont.marimba = {
        "C2": "data:audio/mp3;base64,AAAA"
      };
    `;

    const fetchMock = vi.fn(async (url: string) => {
      if (url === DRUMKIT_LOCAL_URL) {
        return {
          ok: true,
          text: async () => '<!DOCTYPE html><html><body>SPA</body></html>',
        } as Response;
      }
      if (url === DRUMKIT_CDN_URL) {
        return {
          ok: true,
          text: async () => script,
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    vi.stubGlobal('fetch', fetchMock);

    const patch = await loadDrumKitPatch(decode);
    expect(patch).not.toBeNull();
    expect(patch!.slug).toBe('drumkit-standard');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses caches and stores the fetched script under the CDN URL key', async () => {
    const decode = vi.fn(async () => ({ duration: 0.1 } as AudioBuffer));
    const script = `
      MIDI.Soundfont.marimba = {
        "C2": "data:audio/mp3;base64,AAAA"
      };
    `;

    const store = new Map<string, string>();
    const cache = {
      match: vi.fn(async (k: string) =>
        store.has(k)
          ? ({ text: async () => store.get(k)! } as unknown as Response)
          : undefined
      ),
      put: vi.fn(async (k: string, resp: Response) => {
        store.set(k, await resp.text());
      }),
    };

    vi.stubGlobal('caches', {
      open: vi.fn(async (name) => {
        expect(name).toBe('soundfonts-v1');
        return cache;
      }),
    });

    const fetchMock = vi.fn(async (url: string) => {
      if (url === DRUMKIT_LOCAL_URL) {
        return { ok: false, status: 404 } as Response;
      }
      if (url === DRUMKIT_CDN_URL) {
        return {
          ok: true,
          text: async () => script,
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    // First load: fetches from network, stores in cache
    const patch1 = await loadDrumKitPatch(decode);
    expect(patch1).not.toBeNull();
    expect(cache.put).toHaveBeenCalledWith(DRUMKIT_CDN_URL, expect.anything());
    expect(store.get(DRUMKIT_CDN_URL)).toBe(script);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Reset in-memory cache to force reading from cache
    resetCachedDrumKit();

    // Second load: loads from cache, no fetch
    fetchMock.mockClear();
    const patch2 = await loadDrumKitPatch(decode);
    expect(patch2).not.toBeNull();
    expect(patch2!.slug).toBe('drumkit-standard');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cache.match).toHaveBeenCalledWith(DRUMKIT_CDN_URL);
  });

  it('uses in-memory cache on subsequent calls without hitting CacheStorage or network', async () => {
    const decode = vi.fn(async () => ({ duration: 0.1 } as AudioBuffer));
    const script = `
      MIDI.Soundfont.marimba = {
        "C2": "data:audio/mp3;base64,AAAA"
      };
    `;

    const cacheOpenSpy = vi.fn(async () => ({
      match: async () => undefined,
      put: async () => {},
    } as any));
    vi.stubGlobal('caches', { open: cacheOpenSpy });

    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => script,
    } as any));
    vi.stubGlobal('fetch', fetchMock);

    const patch1 = await loadDrumKitPatch(decode);
    expect(patch1).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1); // Loaded from local URL immediately since it was OK

    // Call again, should use in-memory cache directly
    fetchMock.mockClear();
    cacheOpenSpy.mockClear();

    const patch2 = await loadDrumKitPatch(decode);
    expect(patch2).toBe(patch1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cacheOpenSpy).not.toHaveBeenCalled();
  });
});
