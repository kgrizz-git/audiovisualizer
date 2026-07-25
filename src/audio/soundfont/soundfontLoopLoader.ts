import { midiFromNoteName } from './midiNoteName.js';
import { SoundbankPreset } from './soundfontTypes.js';
import { SOUNDFONT_CACHE_NAME } from './soundfontPatchLoader.js';

/** goldst loop metadata frame rate (matches smplr / SF2 extraction). */
export const LOOP_SAMPLE_RATE = 44100;

/** Loop region in seconds: `[loopStart, loopEnd]`. */
export type LoopRegionSeconds = [number, number];

/** MIDI note number → loop region in seconds. */
export type LoopPointsByMidi = Record<number, LoopRegionSeconds>;

const FLAT_TO_SHARP: Readonly<Record<string, string>> = {
  Db: 'C#',
  Eb: 'D#',
  Gb: 'F#',
  Ab: 'G#',
  Bb: 'A#',
};

/**
 * Normalize goldst loop JSON note names (may use flats) to midi-js sharp keys.
 * Example: `Db4` → `C#4`.
 */
export function normalizeLoopNoteName(name: string): string {
  const match = /^([A-G])(b|#)?(-?\d+)$/.exec(name);
  if (!match) return name;
  const [, letter, accidental, octave] = match;
  if (accidental === 'b') {
    const sharp = FLAT_TO_SHARP[`${letter}b`];
    if (sharp) return `${sharp}${octave}`;
  }
  return `${letter}${accidental ?? ''}${octave}`;
}

/**
 * Parse goldst `*-loop.json` text into loop points keyed by MIDI note number.
 * Returns `null` when JSON is invalid; returns `{}` for an empty object (no loops).
 */
export function parseSoundfontLoopJson(text: string): LoopPointsByMidi | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const loops: LoopPointsByMidi = {};
  for (const [noteName, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value) || value.length < 2) continue;
    const startFrame = Number(value[0]);
    const endFrame = Number(value[1]);
    if (!Number.isFinite(startFrame) || !Number.isFinite(endFrame) || endFrame <= startFrame) continue;
    const midi = midiFromNoteName(normalizeLoopNoteName(noteName));
    loops[midi] = [startFrame / LOOP_SAMPLE_RATE, endFrame / LOOP_SAMPLE_RATE];
  }
  return loops;
}

export function localSoundfontLoopUrl(bank: SoundbankPreset, goldstSlug: string): string {
  return `/soundfonts/${bank}/${goldstSlug}-loop.json`;
}

export function cdnSoundfontLoopUrl(bank: SoundbankPreset, goldstSlug: string): string {
  return `https://goldst.dev/midi-js-soundfonts/${bank}/${goldstSlug}-loop.json`;
}

/**
 * Load loop metadata: local bundle → CacheStorage → goldst CDN. Soft-fails to `null`.
 */
export async function fetchSoundfontLoopMetadata(
  bank: SoundbankPreset,
  goldstSlug: string,
): Promise<LoopPointsByMidi | null> {
  const cacheKey = cdnSoundfontLoopUrl(bank, goldstSlug);
  const cache = await openSoundfontCache();

  if (cache) {
    try {
      const match = await cache.match(cacheKey);
      if (match) {
        const parsed = parseSoundfontLoopJson(await match.text());
        if (parsed) return parsed;
      }
    } catch {
      /* ignore cache read error */
    }
  }

  for (const url of [localSoundfontLoopUrl(bank, goldstSlug), cdnSoundfontLoopUrl(bank, goldstSlug)]) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const text = await response.text();
      const parsed = parseSoundfontLoopJson(text);
      if (!parsed) continue;
      if (cache) {
        try {
          await cache.put(cacheKey, new Response(text, { headers: { 'Content-Type': 'application/json' } }));
        } catch {
          /* ignore cache write error */
        }
      }
      return parsed;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function openSoundfontCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(SOUNDFONT_CACHE_NAME);
  } catch {
    return null;
  }
}
