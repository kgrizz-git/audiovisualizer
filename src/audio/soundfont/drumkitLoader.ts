import {
  looksLikeSoundfontScript,
  parseMidiJsSoundfontScript,
  dataUriToArrayBuffer,
  SOUNDFONT_CACHE_NAME,
  AudioDecoder,
} from './soundfontPatchLoader.js';
import { InstrumentPatch } from './soundfontTypes.js';

const DRUMKIT_CDN_URL = 'https://henrikvilhelmberglund.com/midi-js-compat-soundfonts/GM-soundfonts/FluidR3_GM/drumkits/Standard-mp3.js';
const DRUMKIT_LOCAL_URL = '/soundfonts/FluidR3_GM/percussion/Standard-mp3.js';

let cachedDrumKit: InstrumentPatch | null = null;

/**
 * Resets the in-memory cache for the drum kit patch. Useful for tests.
 */
export function resetCachedDrumKit(): void {
  cachedDrumKit = null;
}

/**
 * Loads the FluidR3 GM Standard drum kit patch.
 * Tries local URL first, then falls back to CDN. Caches in CacheStorage (using CDN URL as key)
 * and in-memory.
 */
export async function loadDrumKitPatch(decode: AudioDecoder): Promise<InstrumentPatch | null> {
  if (cachedDrumKit) {
    return cachedDrumKit;
  }

  const cache = await openCache();
  if (cache) {
    try {
      const match = await cache.match(DRUMKIT_CDN_URL);
      if (match) {
        const cachedText = await match.text();
        if (looksLikeSoundfontScript(cachedText)) {
          const patch = await buildPatchFromScript(cachedText, decode);
          if (patch) {
            cachedDrumKit = patch;
            return patch;
          }
        }
      }
    } catch {
      /* ignore cache read errors */
    }
  }

  const urls = [DRUMKIT_LOCAL_URL, DRUMKIT_CDN_URL];
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        continue;
      }
      const text = await response.text();
      if (!looksLikeSoundfontScript(text)) {
        continue;
      }

      if (cache) {
        try {
          await cache.put(DRUMKIT_CDN_URL, new Response(text));
        } catch {
          /* ignore cache write errors */
        }
      }

      const patch = await buildPatchFromScript(text, decode);
      if (patch) {
        cachedDrumKit = patch;
        return patch;
      }
    } catch {
      /* try next */
    }
  }

  return null;
}

async function buildPatchFromScript(text: string, decode: AudioDecoder): Promise<InstrumentPatch | null> {
  try {
    const noteMap = parseMidiJsSoundfontScript(text, 'drumkit-standard');
    const buffers: Record<string, AudioBuffer> = {};
    await Promise.all(
      Object.entries(noteMap).map(async ([note, uri]) => {
        buffers[note] = await decode(dataUriToArrayBuffer(uri));
      })
    );
    return {
      bank: 'FluidR3_GM',
      program: 0,
      slug: 'drumkit-standard',
      buffers,
    };
  } catch {
    return null;
  }
}

async function openCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') {
    return null;
  }
  try {
    return await caches.open(SOUNDFONT_CACHE_NAME);
  } catch {
    return null;
  }
}
