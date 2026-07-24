import { getInstrumentSlug } from './gmInstrumentSlugs.js';
import { InstrumentPatch, SoundbankPreset } from './soundfontTypes.js';

export type AudioDecoder = (bytes: ArrayBuffer) => Promise<AudioBuffer>;

/** CacheStorage bucket shared by the patch loader and the library prefetcher. */
export const SOUNDFONT_CACHE_NAME = 'soundfonts-v1';

export function localSoundfontUrl(bank: SoundbankPreset, slug: string): string {
  return `/soundfonts/${bank}/${slug}-mp3.js`;
}

export function cdnSoundfontUrl(bank: SoundbankPreset, slug: string): string {
  return `https://gleitz.github.io/midi-js-soundfonts/${bank}/${slug}-mp3.js`;
}

/**
 * True when the text is actually a midi-js soundfont script (not, e.g., the SPA
 * `index.html` some dev servers / static hosts return for a missing asset with a
 * 200 status). Used to reject those so the loader falls through to the CDN.
 */
export function looksLikeSoundfontScript(text: string): boolean {
  return text.includes('MIDI.Soundfont');
}

/**
 * Evaluate an allowlisted midi-js soundfont script.
 * Only call on bundled /soundfonts assets or gleitz CDN responses — never on user MIDI.
 */
export function parseMidiJsSoundfontScript(text: string, slug: string): Record<string, string> {
  const match = text.match(/MIDI\.Soundfont\.[a-zA-Z0-9_]+\s*=\s*(\{[\s\S]+\});?/);
  if (!match) throw new Error(`Soundfont script invalid format: ${slug}`);
  // midi-js soundfont files are JS object literals with a trailing comma before
  // the closing brace, which strict JSON.parse rejects — strip it first.
  const json = match[1].replace(/,\s*}/g, '}');
  return JSON.parse(json);
}

export function dataUriToArrayBuffer(dataUri: string): ArrayBuffer {
  const comma = dataUri.indexOf(',');
  const meta = comma >= 0 ? dataUri.slice(0, comma) : '';
  const payload = comma >= 0 ? dataUri.slice(comma + 1) : dataUri;
  const raw = meta.includes(';base64') ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

export class SoundfontPatchLoader {
  private cache = new Map<string, InstrumentPatch | null>();

  constructor(private readonly decode: AudioDecoder) {}

  async loadPatch(bank: SoundbankPreset, program: number): Promise<InstrumentPatch | null> {
    const slug = getInstrumentSlug(program);
    const key = `${bank}:${slug}`;
    if (this.cache.has(key)) return this.cache.get(key) ?? null;

    const text = await this.fetchScript(bank, slug);
    if (!text) {
      this.cache.set(key, null);
      return null;
    }

    try {
      const noteMap = parseMidiJsSoundfontScript(text, slug);
      const buffers: Record<string, AudioBuffer> = {};
      await Promise.all(
        Object.entries(noteMap).map(async ([note, uri]) => {
          buffers[note] = await this.decode(dataUriToArrayBuffer(uri));
        }),
      );
      const patch: InstrumentPatch = { bank, program, slug, buffers };
      this.cache.set(key, patch);
      return patch;
    } catch {
      this.cache.set(key, null);
      return null;
    }
  }

  private async fetchScript(bank: SoundbankPreset, slug: string): Promise<string | null> {
    const cacheKey = cdnSoundfontUrl(bank, slug); // stable https key for both read + write
    const cache = await this.openCache();

    if (cache) {
      try {
        const match = await cache.match(cacheKey);
        // Ignore poisoned cache entries (e.g. an SPA index.html cached under this key
        // by an earlier buggy fetch) so we re-fetch a real script.
        if (match) {
          const cached = await match.text();
          if (looksLikeSoundfontScript(cached)) return cached;
        }
      } catch {
        /* ignore cache read error */
      }
    }

    for (const url of [localSoundfontUrl(bank, slug), cdnSoundfontUrl(bank, slug)]) {
      try {
        const response = await fetch(url);
        if (!response.ok) continue;
        const text = await response.text();
        // A missing local asset can return the SPA index.html with a 200 status;
        // only accept genuine soundfont scripts, otherwise fall through to the CDN.
        if (!looksLikeSoundfontScript(text)) continue;
        if (cache) {
          try {
            await cache.put(cacheKey, new Response(text));
          } catch {
            /* ignore cache write error */
          }
        }
        return text;
      } catch {
        /* try next */
      }
    }
    return null;
  }

  private async openCache(): Promise<Cache | null> {
    if (typeof caches === 'undefined') return null;
    try {
      return await caches.open(SOUNDFONT_CACHE_NAME);
    } catch {
      return null;
    }
  }
}

