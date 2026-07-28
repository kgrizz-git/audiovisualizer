import { GM_INSTRUMENT_SLUGS } from './gmInstrumentSlugs.js';
import { SoundbankPreset } from './soundfontTypes.js';
import { cdnSoundfontUrl, localSoundfontUrl, looksLikeSoundfontScript, SOUNDFONT_CACHE_NAME } from './soundfontPatchLoader.js';

export interface PrefetchProgress {
  done: number;
  total: number;
  slug: string;
  ok: boolean;
}

export interface PrefetchResult {
  ok: number;
  failed: number;
  aborted: boolean;
}

export interface CacheStatus {
  /** Whether the CacheStorage API is usable in this environment. */
  available: boolean;
  cached: number;
  total: number;
}

async function openCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(SOUNDFONT_CACHE_NAME);
  } catch {
    return null;
  }
}

/** Count how many of a bank's GM instruments already have a cached script. */
export async function getCacheStatus(bank: SoundbankPreset = 'FluidR3_GM'): Promise<CacheStatus> {
  const total = GM_INSTRUMENT_SLUGS.length;
  const cache = await openCache();
  if (!cache) return { available: false, cached: 0, total };
  let cached = 0;
  await Promise.all(
    GM_INSTRUMENT_SLUGS.map(async (slug) => {
      const match = await cache.match(cdnSoundfontUrl(bank, slug));
      if (match && looksLikeSoundfontScript(await match.text())) cached += 1;
    }),
  );
  return { available: true, cached, total };
}

/** Drop the entire soundfont cache. Returns false when CacheStorage is unavailable. */
export async function clearSoundfontCache(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    return await caches.delete(SOUNDFONT_CACHE_NAME);
  } catch {
    return false;
  }
}

/**
 * Fetch every GM instrument script for a bank and store it in CacheStorage under the
 * same key the patch loader reads (`cdnSoundfontUrl`), so future playback loads from cache.
 * Scripts already cached are skipped. Progress is reported per instrument; pass an
 * AbortSignal to cancel partway through.
 */
// eslint-disable-next-line complexity -- grandfathered (18); refactor when next touched
export async function prefetchBank(
  bank: SoundbankPreset,
  onProgress?: (progress: PrefetchProgress) => void,
  signal?: AbortSignal,
): Promise<PrefetchResult> {
  const cache = await openCache();
  const total = GM_INSTRUMENT_SLUGS.length;
  let done = 0;
  let ok = 0;
  let failed = 0;

  for (const slug of GM_INSTRUMENT_SLUGS) {
    if (signal?.aborted) {
      return { ok, failed, aborted: true };
    }
    const cacheKey = cdnSoundfontUrl(bank, slug);
    let succeeded = false;
    try {
      const cachedMatch = cache ? await cache.match(cacheKey) : undefined;
      if (cachedMatch && looksLikeSoundfontScript(await cachedMatch.text())) {
        succeeded = true;
      } else {
        for (const url of [localSoundfontUrl(bank, slug), cdnSoundfontUrl(bank, slug)]) {
          const response = await fetch(url, signal ? { signal } : undefined);
          if (!response.ok) continue;
          const text = await response.text();
          // Skip non-scripts (e.g. an SPA index.html returned for a missing local asset).
          if (!looksLikeSoundfontScript(text)) continue;
          if (cache) {
            try {
              await cache.put(cacheKey, new Response(text));
            } catch {
              /* ignore cache write error */
            }
          }
          succeeded = true;
          break;
        }
      }
    } catch {
      if (signal?.aborted) return { ok, failed, aborted: true };
      succeeded = false;
    }
    done += 1;
    if (succeeded) ok += 1;
    else failed += 1;
    onProgress?.({ done, total, slug, ok: succeeded });
  }

  return { ok, failed, aborted: false };
}
