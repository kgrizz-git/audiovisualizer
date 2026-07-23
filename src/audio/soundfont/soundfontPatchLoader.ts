import { getInstrumentSlug } from './gmInstrumentSlugs.js';
import { InstrumentPatch, SoundbankPreset } from './soundfontTypes.js';

export type AudioDecoder = (bytes: ArrayBuffer) => Promise<AudioBuffer>;

export function localSoundfontUrl(bank: SoundbankPreset, slug: string): string {
  return `/soundfonts/${bank}/${slug}-mp3.js`;
}

export function cdnSoundfontUrl(bank: SoundbankPreset, slug: string): string {
  return `https://gleitz.github.io/midi-js-soundfonts/${bank}/${slug}-mp3.js`;
}

/**
 * Evaluate an allowlisted midi-js soundfont script.
 * Only call on bundled /soundfonts assets or gleitz CDN responses — never on user MIDI.
 */
export function parseMidiJsSoundfontScript(text: string, slug: string): Record<string, string> {
  const match = text.match(/MIDI\.Soundfont\.[a-zA-Z0-9_]+\s*=\s*(\{[\s\S]+\});?/);
  if (!match) throw new Error(`Soundfont script invalid format: ${slug}`);
  return JSON.parse(match[1]);
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
    for (const url of [localSoundfontUrl(bank, slug), cdnSoundfontUrl(bank, slug)]) {
      try {
        const response = await fetch(url);
        if (response.ok) return await response.text();
      } catch {
        /* try next */
      }
    }
    return null;
  }
}
