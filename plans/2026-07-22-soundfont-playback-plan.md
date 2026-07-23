# SoundFont Playback Engine & Asset Bundling Implementation Plan

Status: ready for implementation (weaker-model-ready revision 2026-07-23)

> **For agentic workers:** Implement **one task at a time**. Follow steps in order. Do not invent APIs that contradict the skeletons below. Do not claim mid-track program changes as shipped. Do **not** invent the 128 GM instrument names — copy them from the URL in Task 3.

**Goal:** Provide General MIDI sample playback (midi-js-soundfonts) with local FluidR3 core assets + CDN fallback, offline sustain (CC64) duration extension, per-track mute/solo/gain/timbre preserved through sample and oscillator engines, and a small Tauri-ready FluidR3 bundle.

**Architecture:** Split **engine** (`sample` | `oscillator`) from **soundbank** (`FluidR3_GM` | `MusyngKite` | `FatBoy`). `SoundfontPatchLoader` parses the midi-js JS wrapper (not JSON), caches patches, and accepts an injectable decoder for tests. `SoundfontPlayer` owns a shared `AudioContext`, parallel-loads patches with a generation guard, schedules samples for ready patches, and batches oscillator fallback for **miss channels only** via `MidiPreviewPlayer`. CC64 uses offline sustain windows. `VoiceRouter` holds global engine/bank + per-channel mix.

**Tech Stack:** TypeScript, Web Audio API, Vitest (Node + injected fakes), Vite, Node (`scripts/bundle-soundfonts.mjs`).

**Spec:** [`plans/specs/2026-07-22-soundfont-playback.md`](specs/2026-07-22-soundfont-playback.md)

**Product decision (locked):** CDN-first with a **FluidR3 core subset** under `public/soundfonts/` for offline/Tauri. Other banks require network.

## Global Constraints

- Keep MIDI parser and score-to-geometry mapper deterministic and side-effect free.
- Preserve `MidiPreviewPlayer` as the oscillator engine (shared `AudioContext` via injection).
- Browser MIDI file handling stays local; no telemetry; no user MIDI upload.
- Must pass `npm run validate`.
- Update `ARCHITECTURE.md`, `CHANGELOG.md` (MINOR), `dev-docs/TO_DO.md`; gitignore bulky soundfont `.js` assets.
- Mid-track **program-change handling** is **deferred**.
- Flat test names under `tests/` (e.g. `tests/soundfontPlayer.test.ts`).
- **v1 engine/bank are global UI defaults** — per-track overrides are gain/mute/solo/timbre only.
- **Do not invent GM slug names.** Copy the 128-entry array from  
  `https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/names.json`  
  into `src/audio/soundfont/gmInstrumentSlugs.ts` (program `i` → `GM_INSTRUMENT_SLUGS[i]`).
- Commits only if the user requested them.
- When stubbing Web Audio in Vitest: **do not** require a real `AudioContext`. Inject fakes (loader decode fn, fake player methods, spies). Prefer testing pure helpers (`midiNoteName`, `nearestSampleKey`, `getSustainedDuration`) over browser audio.

### Pre-flight locks

| Topic | Lock |
|---|---|
| Fallback double-play | Fallback only schedules channels whose sample patches failed (or all when engine is oscillator) |
| Engine scope | Global `engine` + `soundbank`; per-track mix only |
| Sample scheduling | MIDI pitch → `#`-sharp note name; nearest key; strip `data:` URI in loader; velocity→gain; honor offset |
| Lifecycle | `SoundfontPlayer.stop()` stops samples **and** fallback; `app.pause()` / scrub / `setScore` call it |
| CI bundler | Dev downloads; CI uses `--verify` only; never add download to `npm run validate` |
| Load strategy | `Promise.all` unique patches **first**, then schedule all ready samples, then **one** fallback call (simpler than mid-await scheduling; generation guard still required) |

---

### Task 1: Domain — `SustainEvent`, parser CC64, offline sustain helpers

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/midi/parser.ts`
- Create: `src/audio/soundfont/sustainWindows.ts`
- Test: `tests/sustainWindows.test.ts`
- Test: `tests/midiParserSustain.test.ts`

**Sustain algorithm (lock):**
- Pedal down = value ≥ 64; pedal up = value < 64.
- Natural release = `note.onset + note.duration`.
- Find the window where `window.start <= naturalRelease` and `naturalRelease < window.end` **or** the note overlaps the window while held; extend to `max(naturalRelease, window.end) - note.onset` as the sustained duration (i.e. stop at `window.end` if later).
- Concrete rule to implement:  
  `release = note.onset + note.duration`  
  Find first window with `window.start <= release && release <= window.end` (inclusive end OK).  
  If found: return `window.end - note.onset`.  
  Else: return `note.duration`.  
  (Tests below encode this.)
- Open pedal at end of list → clamp `end` to `scoreEnd`. Never return `Infinity`.

- [ ] **Step 1: Write failing tests**

Create `tests/sustainWindows.test.ts` **exactly** (adapt imports only if path differs):

```typescript
import { describe, it, expect } from 'vitest';
import {
  buildSustainWindows,
  getSustainedDuration,
  sustainEventsForChannel,
} from '../src/audio/soundfont/sustainWindows.js';
import { NoteEvent, Score } from '../src/core/types.js';

const note = (partial: Partial<NoteEvent> & Pick<NoteEvent, 'onset' | 'duration'>): NoteEvent => ({
  id: 'n', pitch: 60, velocity: 100, voice: 0, pitchClass: 0, ...partial,
});

describe('offline sustain windows', () => {
  it('extends note duration through the pedal-up time', () => {
    const windows = buildSustainWindows(
      [{ time: 0.5, value: 127 }, { time: 2.0, value: 0 }],
      10,
    );
    expect(windows).toEqual([{ start: 0.5, end: 2.0 }]);
    // onset 0.4, natural release 0.7 → inside [0.5, 2.0] → duration 2.0 - 0.4 = 1.6
    expect(getSustainedDuration(note({ onset: 0.4, duration: 0.3 }), windows)).toBeCloseTo(1.6);
  });

  it('clamps an open pedal to score end (never Infinity)', () => {
    const windows = buildSustainWindows([{ time: 1, value: 100 }], 5);
    expect(windows[0].end).toBe(5);
    expect(Number.isFinite(getSustainedDuration(note({ onset: 1.2, duration: 0.2 }), windows))).toBe(true);
  });

  it('sustains a note that starts after pedal is already down', () => {
    const windows = buildSustainWindows(
      [{ time: 0, value: 127 }, { time: 3, value: 0 }],
      10,
    );
    expect(getSustainedDuration(note({ onset: 1, duration: 0.2 }), windows)).toBeCloseTo(2);
  });

  it('leaves duration unchanged when release is outside any pedal window', () => {
    const windows = buildSustainWindows(
      [{ time: 2, value: 127 }, { time: 4, value: 0 }],
      10,
    );
    expect(getSustainedDuration(note({ onset: 0, duration: 0.5 }), windows)).toBeCloseTo(0.5);
  });

  it('handles two sequential pedal windows', () => {
    const windows = buildSustainWindows(
      [
        { time: 0, value: 127 }, { time: 1, value: 0 },
        { time: 2, value: 127 }, { time: 4, value: 0 },
      ],
      10,
    );
    expect(windows).toEqual([{ start: 0, end: 1 }, { start: 2, end: 4 }]);
    expect(getSustainedDuration(note({ onset: 2.1, duration: 0.2 }), windows)).toBeCloseTo(1.9);
  });

  it('merges sustain events across tracks that share a channel', () => {
    const score = {
      title: 't', duration: 10, bpm: 120,
      tracks: [
        { name: 'a', channel: 0, program: 0, instrumentName: 'p', notes: [], sustainEvents: [{ time: 0, value: 127 }] },
        { name: 'b', channel: 0, program: 0, instrumentName: 'p', notes: [], sustainEvents: [{ time: 2, value: 0 }] },
        { name: 'c', channel: 1, program: 32, instrumentName: 'b', notes: [], sustainEvents: [{ time: 1, value: 127 }] },
      ],
    } as Score;
    expect(sustainEventsForChannel(score, 0)).toEqual([
      { time: 0, value: 127 },
      { time: 2, value: 0 },
    ]);
  });
});
```

Create `tests/midiParserSustain.test.ts` with this **byte fixture** (do not invent a different format):

```typescript
import { describe, expect, it } from 'vitest';
import { parseMidiData } from '../src/core/midi/parser.js';

describe('MIDI parser sustain (CC64)', () => {
  it('captures sustain pedal control changes as 0–127 values', () => {
    // Type-0 SMF: CC64=127 at t=0, note 60, CC64=0, end. Division 96 PPQ.
    const bytes = new Uint8Array([
      0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96, // MThd
      0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 20,                   // MTrk length 20
      0, 0xb0, 64, 127,                                       // CC64 down
      0, 0x90, 60, 100,                                       // note on
      96, 0x80, 60, 64,                                       // note off after 96 ticks
      0, 0xb0, 64, 0,                                         // CC64 up
      0, 0xff, 0x2f, 0,                                       // end of track
    ]);
    const score = parseMidiData(bytes.buffer, 'Sustain Fixture');
    expect(score.tracks.length).toBeGreaterThanOrEqual(1);
    const events = score.tracks[0].sustainEvents ?? [];
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].value).toBeGreaterThanOrEqual(64);
    expect(events.some((e) => e.value < 64)).toBe(true);
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/sustainWindows.test.ts tests/midiParserSustain.test.ts` — expect FAIL

- [ ] **Step 3: Implement**

In `src/core/types.ts`, add to `TrackScore` and export:

```typescript
export interface SustainEvent {
  time: number;  // seconds
  value: number; // 0-127; >= 64 = pedal down
}

export interface TrackScore {
  name: string;
  channel: number;
  program: number;
  instrumentName: string;
  notes: NoteEvent[];
  sustainEvents?: SustainEvent[];
}
```

In `src/core/midi/parser.ts`, when building each track (after notes), add:

```typescript
const sustainEvents: SustainEvent[] = [];
const sustainCCs = track.controlChanges?.[64] ?? track.controlChanges?.sustain;
if (sustainCCs) {
  for (const cc of sustainCCs) {
    sustainEvents.push({ time: cc.time, value: Math.round(cc.value * 127) });
  }
  sustainEvents.sort((a, b) => a.time - b.time);
}
// include sustainEvents: sustainEvents (always [] when empty) on the TrackScore push
```

Create `src/audio/soundfont/sustainWindows.ts`:

```typescript
import { NoteEvent, Score, SustainEvent } from '../../core/types.js';

export interface SustainWindow {
  start: number;
  end: number;
}

export function buildSustainWindows(events: SustainEvent[], scoreEnd: number): SustainWindow[] {
  const windows: SustainWindow[] = [];
  let openAt: number | null = null;
  const sorted = [...events].sort((a, b) => a.time - b.time);
  for (const event of sorted) {
    const down = event.value >= 64;
    if (down && openAt === null) openAt = event.time;
    if (!down && openAt !== null) {
      windows.push({ start: openAt, end: event.time });
      openAt = null;
    }
  }
  if (openAt !== null) windows.push({ start: openAt, end: scoreEnd });
  return windows;
}

export function getSustainedDuration(note: NoteEvent, windows: SustainWindow[]): number {
  const release = note.onset + note.duration;
  for (const window of windows) {
    if (window.start <= release && release <= window.end) {
      return Math.max(note.duration, window.end - note.onset);
    }
  }
  return note.duration;
}

export function sustainEventsForChannel(score: Score, channel: number): SustainEvent[] {
  const merged: SustainEvent[] = [];
  for (const track of score.tracks) {
    if (track.channel !== channel) continue;
    if (track.sustainEvents) merged.push(...track.sustainEvents);
  }
  return merged.sort((a, b) => a.time - b.time);
}
```

Also update `generateDemoScore()` tracks to include `sustainEvents: []` if TypeScript requires it (optional field — OK to omit).

- [ ] **Step 4:** Tests PASS  
- [ ] **Step 5:** Commit only if user requested

---

### Task 2: Types, VoiceRouter, unify with voicePlayback

**Files:**
- Create: `src/audio/soundfont/soundfontTypes.ts`
- Create: `src/audio/soundfont/voiceRouter.ts`
- Modify: `src/audio/midiPreviewPlayer.ts` only if needed to re-export `SynthTimbre` (already exported)
- Test: `tests/voiceRouter.test.ts`

- [ ] **Step 1: Write failing tests** — create `tests/voiceRouter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { VoiceRouter } from '../src/audio/soundfont/voiceRouter.js';
import { TrackScore } from '../src/core/types.js';
import { VoicePlaybackSettings } from '../src/audio/midiPreviewPlayer.js';

const track = (channel: number, program: number): TrackScore => ({
  name: `ch${channel}`,
  channel,
  program,
  instrumentName: 'x',
  notes: [],
  sustainEvents: [],
});

describe('VoiceRouter', () => {
  it('applies global engine and soundbank defaults to every track', () => {
    const router = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
    const a = router.resolveTrackSettings(track(0, 0));
    const b = router.resolveTrackSettings(track(1, 32));
    expect(a.engine).toBe('sample');
    expect(a.soundbank).toBe('FluidR3_GM');
    expect(b.engine).toBe('sample');
    expect(b.program).toBe(32);
  });

  it('merges per-channel mix overrides without changing global engine', () => {
    const router = new VoiceRouter({ engine: 'sample', soundbank: 'FatBoy' });
    router.setMix(0, { timbre: 'square', gain: 0.5, muted: true, solo: false });
    const a = router.resolveTrackSettings(track(0, 0));
    expect(a.timbre).toBe('square');
    expect(a.gain).toBe(0.5);
    expect(a.muted).toBe(true);
    expect(a.engine).toBe('sample');
    expect(a.soundbank).toBe('FatBoy');
  });

  it('syncFromVoicePlayback copies mix fields by channel', () => {
    const router = new VoiceRouter({ engine: 'oscillator', soundbank: 'FluidR3_GM' });
    const map = new Map<number, VoicePlaybackSettings>([
      [1, { timbre: 'sawtooth', gain: 1.2, muted: false, solo: true }],
    ]);
    router.syncFromVoicePlayback(map);
    const b = router.resolveTrackSettings(track(1, 40));
    expect(b.timbre).toBe('sawtooth');
    expect(b.gain).toBe(1.2);
    expect(b.solo).toBe(true);
    expect(b.engine).toBe('oscillator');
  });

  it('setDefaults updates engine/bank for subsequent resolves', () => {
    const router = new VoiceRouter({ engine: 'sample', soundbank: 'MusyngKite' });
    router.setDefaults({ engine: 'oscillator', soundbank: 'FluidR3_GM' });
    expect(router.resolveTrackSettings(track(0, 0)).engine).toBe('oscillator');
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/voiceRouter.test.ts` — FAIL

- [ ] **Step 3: Implement**

`src/audio/soundfont/soundfontTypes.ts`:

```typescript
import { SynthTimbre } from '../midiPreviewPlayer.js';

export type SoundbankPreset = 'FluidR3_GM' | 'MusyngKite' | 'FatBoy';
export type PlaybackEngine = 'sample' | 'oscillator';

export interface VoiceRouteDefaults {
  engine: PlaybackEngine;
  soundbank: SoundbankPreset;
}

export interface VoiceRouteSettings {
  channel: number;
  program: number;
  engine: PlaybackEngine;
  soundbank: SoundbankPreset;
  timbre: SynthTimbre;
  gain: number;
  muted: boolean;
  solo: boolean;
}

export interface InstrumentPatch {
  bank: SoundbankPreset;
  program: number;
  slug: string;
  /** midi-js note name → decoded buffer */
  buffers: Record<string, AudioBuffer>;
}
```

`src/audio/soundfont/voiceRouter.ts`:

```typescript
import { defaultVoiceSettings, SynthTimbre, VoicePlaybackSettings } from '../midiPreviewPlayer.js';
import { TrackScore } from '../../core/types.js';
import { PlaybackEngine, SoundbankPreset, VoiceRouteDefaults, VoiceRouteSettings } from './soundfontTypes.js';

/** Mix overrides keyed by TrackScore.channel as stored by the parser (channel ?? trackIdx). */
export class VoiceRouter {
  private defaults: VoiceRouteDefaults;
  private mix = new Map<number, VoicePlaybackSettings>();

  constructor(defaults: VoiceRouteDefaults) {
    this.defaults = { ...defaults };
  }

  setDefaults(defaults: Partial<VoiceRouteDefaults>): void {
    this.defaults = { ...this.defaults, ...defaults };
  }

  getDefaults(): VoiceRouteDefaults {
    return { ...this.defaults };
  }

  setMix(channel: number, settings: VoicePlaybackSettings): void {
    this.mix.set(channel, { ...settings });
  }

  syncFromVoicePlayback(map: Map<number, VoicePlaybackSettings>): void {
    this.mix = new Map([...map.entries()].map(([ch, s]) => [ch, { ...s }]));
  }

  resolveTrackSettings(track: TrackScore, voiceIndex = 0): VoiceRouteSettings {
    const mix = this.mix.get(track.channel) ?? defaultVoiceSettings(voiceIndex);
    return {
      channel: track.channel,
      program: track.program,
      engine: this.defaults.engine,
      soundbank: this.defaults.soundbank,
      timbre: mix.timbre,
      gain: mix.gain,
      muted: mix.muted,
      solo: mix.solo,
    };
  }

  /** Build the Map shape MidiPreviewPlayer expects. */
  toVoicePlaybackMap(tracks: TrackScore[]): Map<number, VoicePlaybackSettings> {
    const out = new Map<number, VoicePlaybackSettings>();
    tracks.forEach((track, index) => {
      const s = this.resolveTrackSettings(track, index);
      out.set(track.channel, { timbre: s.timbre, gain: s.gain, muted: s.muted, solo: s.solo });
    });
    return out;
  }
}
```

- [ ] **Step 4:** Tests PASS  
- [ ] **Step 5:** Commit if requested

---

### Task 3: Patch loader — JS parse, URLs, decode, GM slugs

**Files:**
- Create: `src/audio/soundfont/gmInstrumentSlugs.ts`
- Create: `src/audio/soundfont/soundfontPatchLoader.ts`
- Create: `src/audio/soundfont/midiNoteName.ts` (pitch helpers used by Task 4; create here so loader tests can stay focused)
- Create: `tests/fixtures/midi-js-acoustic_grand_piano-snippet.js`
- Test: `tests/soundfontPatchLoader.test.ts`
- Test: `tests/midiNoteName.test.ts`

**CRITICAL — do not invent names:** Download/copy the JSON array from  
`https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/names.json`  
into:

```typescript
// src/audio/soundfont/gmInstrumentSlugs.ts
/** General MIDI program 0–127 → midi-js-soundfonts slug. Source: gleitz FluidR3_GM/names.json */
export const GM_INSTRUMENT_SLUGS: readonly string[] = [
  'acoustic_grand_piano',
  'bright_acoustic_piano',
  // … paste all 128 entries from names.json in order …
  'gunshot',
];

export function getInstrumentSlug(program: number): string {
  const index = Math.max(0, Math.min(127, Math.trunc(program)));
  return GM_INSTRUMENT_SLUGS[index] ?? 'acoustic_grand_piano';
}
```

Verify length 128 and `getInstrumentSlug(24) === 'acoustic_guitar_nylon'`.

**Fixture file** `tests/fixtures/midi-js-acoustic_grand_piano-snippet.js` (commit this tiny file):

```js
if (typeof(MIDI) === 'undefined') var MIDI = {};
if (typeof(MIDI.Soundfont) === 'undefined') MIDI.Soundfont = {};
MIDI.Soundfont.acoustic_grand_piano = {
  "C4": "data:audio/mp3;base64,AAAA",
  "D4": "data:audio/mp3;base64,AAAA",
  "E4": "data:audio/mp3;base64,AAAA"
};
```

**URL contract:**
```text
Local:  /soundfonts/{Bank}/{slug}-mp3.js
CDN:    https://gleitz.github.io/midi-js-soundfonts/{Bank}/{slug}-mp3.js
```

- [ ] **Step 1: Write failing tests**

`tests/midiNoteName.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { midiNoteName, midiFromNoteName, nearestSampleKey } from '../src/audio/soundfont/midiNoteName.js';

describe('midi note names (midi-js convention, sharps only)', () => {
  it('maps MIDI 60 to C4 and 61 to C#4', () => {
    expect(midiNoteName(60)).toBe('C4');
    expect(midiNoteName(61)).toBe('C#4');
    expect(midiNoteName(69)).toBe('A4');
  });

  it('picks nearest available sample key (tie → lower)', () => {
    const available = ['C4', 'E4'];
    expect(nearestSampleKey(60, available)).toBe('C4');      // exact
    expect(nearestSampleKey(62, available)).toBe('C4');      // D4 missing; closer to C4? D=62, C=60, E=64 → distances 2 and 2 → lower → C4
    expect(nearestSampleKey(63, available)).toBe('E4');      // closer to E4
  });
});
```

`tests/soundfontPatchLoader.test.ts`:

```typescript
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
```

- [ ] **Step 2:** Run the two test files — FAIL

- [ ] **Step 3: Implement helpers + loader**

`src/audio/soundfont/midiNoteName.ts`:

```typescript
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** midi-js-soundfonts key names use sharps only (never flats). MIDI 60 = C4. */
export function midiNoteName(midi: number): string {
  const n = Math.max(0, Math.min(127, Math.trunc(midi)));
  const name = NAMES[n % 12];
  const octave = Math.floor(n / 12) - 1;
  return `${name}${octave}`;
}

export function midiFromNoteName(name: string): number {
  const match = /^([A-G]#?)(-?\d+)$/.exec(name);
  if (!match) return 60;
  const pc = NAMES.indexOf(match[1] as typeof NAMES[number]);
  const octave = Number(match[2]);
  if (pc < 0) return 60;
  return (octave + 1) * 12 + pc;
}

export function nearestSampleKey(midi: number, availableKeys: string[]): string {
  if (availableKeys.length === 0) return midiNoteName(midi);
  const exact = midiNoteName(midi);
  if (availableKeys.includes(exact)) return exact;
  let best = availableKeys[0];
  let bestDist = Infinity;
  for (const key of availableKeys) {
    const dist = Math.abs(midiFromNoteName(key) - midi);
    const bestMidi = midiFromNoteName(best);
    if (dist < bestDist || (dist === bestDist && midiFromNoteName(key) < bestMidi)) {
      best = key;
      bestDist = dist;
    }
  }
  return best;
}
```

`src/audio/soundfont/soundfontPatchLoader.ts` (implement fully):

```typescript
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
  const MIDI: { Soundfont: Record<string, Record<string, string>> } = { Soundfont: {} };
  // Parameter MIDI is defined, so `var MIDI = {}` inside the script is skipped.
  const run = new Function('MIDI', `${text}\n; return MIDI;`);
  const result = run(MIDI) as typeof MIDI;
  const map = result?.Soundfont?.[slug];
  if (!map || typeof map !== 'object') throw new Error(`Soundfont slug missing: ${slug}`);
  return map;
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
```

- [ ] **Step 4:** Tests PASS  
- [ ] **Step 5:** Commit if requested

---

### Task 4: SoundfontPlayer + MidiPreviewPlayer channel allowlist

**Files:**
- Create: `src/audio/soundfont/soundfontPlayer.ts`
- Modify: `src/audio/midiPreviewPlayer.ts`
- Test: `tests/soundfontPlayer.test.ts`
- Extend: `tests/midiPreview.test.ts`

**Velocity→gain constant (lock, match oscillator spirit):**
```typescript
const volume = (0.035 + (note.velocity / 127) * 0.065) * route.gain;
```

**Load strategy (lock):** bump generation → resolve audible tracks → if oscillator, fallback all → else `Promise.all` loads → if stale gen, return → schedule samples for ready → **one** fallback for miss channels.

- [ ] **Step 1: Write failing tests**

Replace/extend `tests/midiPreview.test.ts` with:

```typescript
import { describe, it, expect } from 'vitest';
import { defaultVoiceSettings, selectAudibleTracks } from '../src/audio/midiPreviewPlayer.js';
import { Score } from '../src/core/types.js';

describe('MIDI preview voice defaults', () => {
  it('assigns distinct timbres by voice order, wrapping after four voices', () => {
    expect(defaultVoiceSettings(0).timbre).toBe('sine');
    expect(defaultVoiceSettings(1).timbre).toBe('triangle');
    expect(defaultVoiceSettings(2).timbre).toBe('sawtooth');
    expect(defaultVoiceSettings(3).timbre).toBe('square');
    expect(defaultVoiceSettings(4).timbre).toBe('sine');
  });
});

describe('selectAudibleTracks', () => {
  const score: Score = {
    title: 't', duration: 1, bpm: 120,
    tracks: [
      { name: 'a', channel: 0, program: 0, instrumentName: 'p', notes: [], sustainEvents: [] },
      { name: 'b', channel: 1, program: 32, instrumentName: 'b', notes: [], sustainEvents: [] },
    ],
  };

  it('filters to allowlisted channels', () => {
    const voices = new Map([
      [0, defaultVoiceSettings(0)],
      [1, defaultVoiceSettings(1)],
    ]);
    expect(selectAudibleTracks(score, voices, [1]).map((t) => t.channel)).toEqual([1]);
  });

  it('respects mute', () => {
    const voices = new Map([
      [0, { ...defaultVoiceSettings(0), muted: true }],
      [1, defaultVoiceSettings(1)],
    ]);
    expect(selectAudibleTracks(score, voices).map((t) => t.channel)).toEqual([1]);
  });
});
```

`tests/soundfontPlayer.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { SoundfontPlayer } from '../src/audio/soundfont/soundfontPlayer.js';
import { VoiceRouter } from '../src/audio/soundfont/voiceRouter.js';
import { Score } from '../src/core/types.js';

function demoScore(): Score {
  return {
    title: 't', duration: 2, bpm: 120,
    tracks: [
      {
        name: 'piano', channel: 0, program: 0, instrumentName: 'Acoustic Grand Piano',
        notes: [{ id: 'n1', pitch: 60, onset: 0, duration: 0.5, velocity: 100, voice: 0, pitchClass: 0 }],
        sustainEvents: [],
      },
      {
        name: 'bass', channel: 1, program: 32, instrumentName: 'Acoustic Bass',
        notes: [{ id: 'n2', pitch: 36, onset: 0, duration: 0.5, velocity: 100, voice: 1, pitchClass: 0 }],
        sustainEvents: [],
      },
    ],
  };
}

describe('SoundfontPlayer', () => {
  it('calls fallback start once with all channels when every patch is null', async () => {
    const fallbackStart = vi.fn(async () => {});
    const fallbackStop = vi.fn();
    const loader = { loadPatch: vi.fn(async () => null) };
    const player = new SoundfontPlayer({
      loader: loader as never,
      createFallback: () => ({ start: fallbackStart, stop: fallbackStop }) as never,
    });
    const router = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
    await player.start(demoScore(), 0, { router });
    expect(fallbackStart).toHaveBeenCalledTimes(1);
    const opts = fallbackStart.mock.calls[0][3] as { channels?: number[] };
    expect(opts.channels?.sort()).toEqual([0, 1]);
  });

  it('passes only miss channels to fallback when some patches load', async () => {
    const fallbackStart = vi.fn(async () => {});
    const fakeBuffer = {} as AudioBuffer;
    const loader = {
      loadPatch: vi.fn(async (_bank: string, program: number) => {
        if (program !== 0) return null;
        return {
          bank: 'FluidR3_GM', program: 0, slug: 'acoustic_grand_piano',
          buffers: { C4: fakeBuffer },
        };
      }),
    };
    const player = new SoundfontPlayer({
      loader: loader as never,
      createFallback: () => ({ start: fallbackStart, stop: vi.fn() }) as never,
      // scheduleSample optional spy seam — if player exposes scheduleCount for tests, assert > 0
    });
    const router = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
    await player.start(demoScore(), 0, { router });
    expect(fallbackStart).toHaveBeenCalledTimes(1);
    const opts = fallbackStart.mock.calls[0][3] as { channels?: number[] };
    expect(opts.channels).toEqual([1]);
  });

  it('stop invokes fallback stop', async () => {
    const fallbackStop = vi.fn();
    const player = new SoundfontPlayer({
      loader: { loadPatch: vi.fn(async () => null) } as never,
      createFallback: () => ({ start: vi.fn(async () => {}), stop: fallbackStop }) as never,
    });
    const router = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
    await player.start(demoScore(), 0, { router });
    player.stop();
    expect(fallbackStop).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2:** Tests FAIL

- [ ] **Step 3: Modify `MidiPreviewPlayer`**

Change constructor / fields to accept optional shared context, and use `selectAudibleTracks`:

```typescript
export class MidiPreviewPlayer {
  private context: AudioContext | null = null;
  private activeSources: OscillatorNode[] = [];

  constructor(context?: AudioContext) {
    this.context = context ?? null;
  }

  public async start(
    score: Score,
    offsetSeconds: number,
    voices: Map<number, VoicePlaybackSettings>,
    opts?: { channels?: number[] },
  ): Promise<void> {
    this.stop();
    this.context ??= new AudioContext();
    await this.context.resume();
    const now = this.context.currentTime + 0.03;
    const tracks = selectAudibleTracks(score, voices, opts?.channels);
    for (const track of tracks) {
      const index = score.tracks.indexOf(track);
      const settings = voices.get(track.channel) ?? defaultVoiceSettings(index);
      track.notes.forEach((note) => this.schedule(note, offsetSeconds, now, settings));
    }
  }
  // stop() + schedule() unchanged in behavior
}

export function selectAudibleTracks(
  score: Score,
  voices: Map<number, VoicePlaybackSettings>,
  channels?: number[],
): Score['tracks'] {
  const hasSolo = [...voices.values()].some((settings) => settings.solo);
  const allow = channels ? new Set(channels) : null;
  return score.tracks.filter((track, index) => {
    if (allow && !allow.has(track.channel)) return false;
    const settings = voices.get(track.channel) ?? defaultVoiceSettings(index);
    if (settings.muted || (hasSolo && !settings.solo)) return false;
    return true;
  });
}
```

- [ ] **Step 3b: Implement `SoundfontPlayer`**

```typescript
// src/audio/soundfont/soundfontPlayer.ts
import { MidiPreviewPlayer, VoicePlaybackSettings } from '../midiPreviewPlayer.js';
import { NoteEvent, Score } from '../../core/types.js';
import { SoundfontPatchLoader } from './soundfontPatchLoader.js';
import { InstrumentPatch, SoundbankPreset } from './soundfontTypes.js';
import { VoiceRouter } from './voiceRouter.js';
import { buildSustainWindows, getSustainedDuration, sustainEventsForChannel } from './sustainWindows.js';
import { midiFromNoteName, nearestSampleKey } from './midiNoteName.js';

export interface SoundfontPlayerDeps {
  loader: SoundfontPatchLoader;
  createFallback?: (context: AudioContext) => MidiPreviewPlayer;
}

export class SoundfontPlayer {
  private context: AudioContext | null = null;
  private generation = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private fallback: MidiPreviewPlayer | null = null;
  private readonly loader: SoundfontPatchLoader;
  private readonly createFallback: (context: AudioContext) => MidiPreviewPlayer;

  constructor(deps: SoundfontPlayerDeps) {
    this.loader = deps.loader;
    this.createFallback = deps.createFallback ?? ((ctx) => new MidiPreviewPlayer(ctx));
  }

  async start(
    score: Score,
    offsetSeconds: number,
    opts: { router: VoiceRouter; context?: AudioContext },
  ): Promise<void> {
    this.stop();
    const localGen = ++this.generation;
    this.context = opts.context ?? this.context ?? new AudioContext();
    await this.context.resume();
    this.fallback = this.createFallback(this.context);

    const defaults = opts.router.getDefaults();
    const voices = opts.router.toVoicePlaybackMap(score.tracks);

    if (defaults.engine === 'oscillator') {
      await this.fallback.start(score, offsetSeconds, voices);
      return;
    }

    const audible = score.tracks.filter((track, index) => {
      const s = opts.router.resolveTrackSettings(track, index);
      return !s.muted && (![...voices.values()].some((v) => v.solo) || s.solo);
    });

    const unique = new Map<string, { bank: SoundbankPreset; program: number; channels: number[] }>();
    for (const track of audible) {
      const bank = defaults.soundbank;
      const key = `${bank}:${track.program}`;
      const entry = unique.get(key) ?? { bank, program: track.program, channels: [] };
      entry.channels.push(track.channel);
      unique.set(key, entry);
    }

    const loaded = await Promise.all(
      [...unique.values()].map(async (entry) => ({
        ...entry,
        patch: await this.loader.loadPatch(entry.bank, entry.program),
      })),
    );
    if (this.generation !== localGen) return;

    const readyChannels = new Set<number>();
    const patchByChannel = new Map<number, InstrumentPatch>();
    for (const row of loaded) {
      if (!row.patch) continue;
      for (const ch of row.channels) {
        readyChannels.add(ch);
        patchByChannel.set(ch, row.patch);
      }
    }

    const now = this.context.currentTime + 0.03;
    for (const track of audible) {
      const patch = patchByChannel.get(track.channel);
      if (!patch) continue;
      const route = opts.router.resolveTrackSettings(track);
      const windows = buildSustainWindows(
        sustainEventsForChannel(score, track.channel),
        score.duration,
      );
      for (const note of track.notes) {
        this.scheduleSample(note, offsetSeconds, now, patch, route.gain, windows);
      }
    }

    const missChannels = audible
      .map((t) => t.channel)
      .filter((ch) => !readyChannels.has(ch));
    if (missChannels.length > 0) {
      await this.fallback.start(score, offsetSeconds, voices, { channels: missChannels });
    }
  }

  stop(): void {
    this.generation += 1;
    for (const source of this.activeSources) {
      try { source.stop(); } catch { /* already ended */ }
    }
    this.activeSources = [];
    this.fallback?.stop();
  }

  private scheduleSample(
    note: NoteEvent,
    offset: number,
    now: number,
    patch: InstrumentPatch,
    gainMul: number,
    windows: { start: number; end: number }[],
  ): void {
    if (!this.context) return;
    const duration = getSustainedDuration(note, windows);
    if (note.onset + duration <= offset) return;
    const delay = Math.max(0, note.onset - offset);
    const playDuration = Math.max(0.03, duration - Math.max(0, offset - note.onset));
    const keys = Object.keys(patch.buffers);
    const key = nearestSampleKey(note.pitch, keys);
    const buffer = patch.buffers[key];
    if (!buffer) return;

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 2 ** ((note.pitch - midiFromNoteName(key)) / 12);

    const gain = this.context.createGain();
    const volume = (0.035 + (note.velocity / 127) * 0.065) * gainMul;
    const start = now + delay;
    const end = start + playDuration;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.02, playDuration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    source.connect(gain).connect(this.context.destination);
    source.start(start);
    source.stop(end + 0.02);
    source.onended = () => {
      this.activeSources = this.activeSources.filter((s) => s !== source);
    };
    this.activeSources.push(source);
  }
}
```

**UI construction (locked — Task 6):** create context + loader + player once on first play:
```typescript
this.audioContext ??= new AudioContext();
this.soundfontPlayer ??= new SoundfontPlayer({
  loader: new SoundfontPatchLoader((bytes) => this.audioContext!.decodeAudioData(bytes.slice(0))),
});
```

- [ ] **Step 4:** Tests PASS  
- [ ] **Step 5:** Commit if requested

---

### Task 5: Bundler, license, gitignore, manifest

**Files:**
- Create: `scripts/bundle-soundfonts.mjs`
- Create: `public/soundfonts/LICENSE.txt`
- Create: `public/soundfonts/.gitkeep` (optional)
- Modify: `.gitignore`
- Modify: `package.json`

**Core slugs (exact list):**
```js
const CORE_INSTRUMENT_SLUGS = [
  'acoustic_grand_piano', 'bright_acoustic_piano', 'electric_piano_1', 'harpsichord',
  'vibraphone', 'acoustic_guitar_nylon', 'acoustic_guitar_steel', 'overdriven_guitar',
  'acoustic_bass', 'electric_bass_finger',
  'violin', 'viola', 'cello', 'string_ensemble_1', 'choir_aahs',
  'trumpet', 'trombone', 'french_horn', 'alto_sax', 'tenor_sax', 'flute',
  'synth_strings_1',
];
```

- [ ] **Step 1: `.gitignore`** — append:
```gitignore
# SoundFont sample blobs (regenerate with npm run bundle:soundfonts)
public/soundfonts/**/*.js
!public/soundfonts/**/.gitkeep
```

- [ ] **Step 2: `public/soundfonts/LICENSE.txt`** — write attribution:

```text
FluidR3 GM samples via midi-js-soundfonts
https://github.com/gleitz/midi-js-soundfonts

Fluid R3 SoundFont — Copyright (c) 2000-2002, 2003 by Frank Wen
License: Creative Commons Attribution 3.0
https://creativecommons.org/licenses/by/3.0/

MusyngKite and FatBoy banks are not bundled; when fetched from the CDN they are
subject to their upstream Creative Commons licenses (see gleitz/midi-js-soundfonts).
```

- [ ] **Step 3: Implement `scripts/bundle-soundfonts.mjs`** (Node ESM):

```javascript
#!/usr/bin/env node
/**
 * Download FluidR3_GM core midi-js mp3 soundfont scripts into public/soundfonts/.
 * Budget: ~20–30 MB. Do not commit the .js blobs (gitignored).
 *
 * Usage:
 *   node scripts/bundle-soundfonts.mjs           # download missing
 *   node scripts/bundle-soundfonts.mjs --verify  # sha256 check only, no download
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BANK = 'FluidR3_GM';
const OUT = path.join(ROOT, 'public', 'soundfonts', BANK);
const CDN = `https://gleitz.github.io/midi-js-soundfonts/${BANK}`;
const MANIFEST = path.join(OUT, 'manifest.json');

const CORE_INSTRUMENT_SLUGS = [ /* paste list above */ ];

const verifyOnly = process.argv.includes('--verify');

async function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function main() {
  await mkdir(OUT, { recursive: true });
  let manifest = { bank: BANK, files: [] };
  try {
    manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  } catch { /* new */ }

  const files = [];
  for (const slug of CORE_INSTRUMENT_SLUGS) {
    const name = `${slug}-mp3.js`;
    const dest = path.join(OUT, name);
    const url = `${CDN}/${name}`;

    if (verifyOnly) {
      const buf = await readFile(dest);
      const entry = (manifest.files || []).find((f) => f.slug === slug);
      if (!entry) throw new Error(`Missing manifest entry for ${slug}`);
      const hash = await sha256(buf);
      if (hash !== entry.sha256) throw new Error(`Hash mismatch: ${slug}`);
      if (buf.byteLength !== entry.bytes) throw new Error(`Size mismatch: ${slug}`);
      console.log('ok', slug);
      files.push(entry);
      continue;
    }

    let buf;
    try {
      await access(dest);
      buf = await readFile(dest);
      console.log('exists', slug);
    } catch {
      console.log('download', url);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      buf = Buffer.from(await res.arrayBuffer());
      await writeFile(dest, buf);
    }
    files.push({ slug, file: name, url, sha256: await sha256(buf), bytes: buf.byteLength });
  }

  if (!verifyOnly) {
    await writeFile(MANIFEST, JSON.stringify({ bank: BANK, files }, null, 2));
    console.log('wrote', MANIFEST);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: `package.json` scripts**
```json
"bundle:soundfonts": "node scripts/bundle-soundfonts.mjs",
"bundle:soundfonts:verify": "node scripts/bundle-soundfonts.mjs --verify"
```

- [ ] **Step 5:** Locally run `npm run bundle:soundfonts` once (network). Do **not** add it to `validate`. Commit script/LICENSE/gitignore/package.json/`manifest.json` if present — **not** the `.js` blobs.

---

### Task 6: UI, docs, validation

**Files:**
- Modify: `index.html`, `src/ui/app.ts`, `src/ui/styles.css` (minimal if needed)
- Modify: `ARCHITECTURE.md`, `CHANGELOG.md`, `CHANGELOG.dev.md`, `dev-docs/TO_DO.md`, `README.md`

- [ ] **Step 1: Replace playback-bar label in `index.html`**

Find:
```html
<span class="audio-label">LOCAL SYNTH</span>
```

Replace with:
```html
<label class="audio-engine">
  <span class="audio-label">Engine</span>
  <select id="playback-engine-select" aria-label="Playback engine">
    <option value="sample" selected>Sample SoundFont</option>
    <option value="oscillator">Oscillator synth</option>
  </select>
</label>
<label class="audio-engine">
  <span class="audio-label">Bank</span>
  <select id="playback-bank-select" aria-label="SoundFont bank">
    <option value="FluidR3_GM" selected>FluidR3 GM (local+CDN)</option>
    <option value="MusyngKite">MusyngKite (network)</option>
    <option value="FatBoy">FatBoy (network)</option>
  </select>
</label>
```

Update legend text “Local synth voices” → “Mix / timbre” if present.

- [ ] **Step 2: Wire `src/ui/app.ts`**

Imports — add:
```typescript
import { SoundfontPatchLoader } from '../audio/soundfont/soundfontPatchLoader.js';
import { SoundfontPlayer } from '../audio/soundfont/soundfontPlayer.js';
import { VoiceRouter } from '../audio/soundfont/voiceRouter.js';
import { PlaybackEngine, SoundbankPreset } from '../audio/soundfont/soundfontTypes.js';
```

Fields — add (keep `voicePlayback` in sync for existing row UI, or migrate rows to router in the same change):
```typescript
private audioContext: AudioContext | null = null;
private soundfontPlayer: SoundfontPlayer | null = null;
private voiceRouter = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
```

In `bindEvents`, after other listeners:
```typescript
this.element<HTMLSelectElement>('playback-engine-select').addEventListener('change', (event) => {
  this.voiceRouter.setDefaults({ engine: (event.target as HTMLSelectElement).value as PlaybackEngine });
});
this.element<HTMLSelectElement>('playback-bank-select').addEventListener('change', (event) => {
  this.voiceRouter.setDefaults({ soundbank: (event.target as HTMLSelectElement).value as SoundbankPreset });
});
```

When mix UI changes timbre/gain/mute/solo, also call `this.voiceRouter.setMix(track.channel, settings)` (or `syncFromVoicePlayback(this.voicePlayback)` after each change / before play).

Replace `togglePlay` audio start:
```typescript
private async togglePlay(): Promise<void> {
  if (this.isPlaying) { this.pause(); return; }
  if (this.currentTime >= this.currentScore.duration) this.currentTime = 0;
  try {
    this.audioContext ??= new AudioContext();
    this.soundfontPlayer ??= new SoundfontPlayer({
      loader: new SoundfontPatchLoader((bytes) => this.audioContext!.decodeAudioData(bytes.slice(0))),
    });
    this.voiceRouter.syncFromVoicePlayback(this.voicePlayback);
    await this.soundfontPlayer.start(this.currentScore, this.currentTime, {
      router: this.voiceRouter,
      context: this.audioContext,
    });
    this.isPlaying = true;
    this.playbackOffset = this.currentTime;
    this.playbackStart = performance.now();
    this.element<HTMLButtonElement>('play-btn').textContent = '❚❚';
    this.setStatus('Playing MIDI preview');
    this.tick();
  } catch {
    this.setStatus('Audio preview could not start in this browser.', true);
  }
}
```

Replace `pause`:
```typescript
private pause(): void {
  this.isPlaying = false;
  this.soundfontPlayer?.stop();
  this.midiPreview.stop(); // safe no-op if unused; or remove midiPreview field if fully replaced
  if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
  this.animationFrameId = null;
  this.element<HTMLButtonElement>('play-btn').textContent = '▶';
}
```

Ensure scrubber `input` handler and `setScore` already call `pause()` (they do today).

- [ ] **Step 3: Docs checklist**
- [ ] `ARCHITECTURE.md` — rewrite “Playback and source boundaries” to describe sample + oscillator engines, VoiceRouter, `public/soundfonts/`, CDN fallback. Add stack row for SoundFont loader/player.
- [ ] `CHANGELOG.md` Unreleased **Added**: Sample SoundFont playback with engine/bank controls and CC64 sustain; SemVer **MINOR**.
- [ ] `CHANGELOG.dev.md` — bundler scripts, gitignore for `public/soundfonts/**/*.js`, tests.
- [ ] `dev-docs/TO_DO.md` — **split** the playback item:
  - Done: selectable GM SoundFonts, CC64 sustain, engine/bank controls, mix through sample+oscillator
  - Deferred (new unchecked bullets): mid-track program changes; deterministic WAV export; per-track engine/bank; channel-10 drums; auto bank-by-name
- [ ] `README.md` — short paragraph: sample preview, FluidR3 core via `npm run bundle:soundfonts`, other banks CDN.

- [ ] **Step 4:** `npm run validate` must PASS  
- [ ] **Step 5:** Commit if requested

---

## Spec coverage

| Claim | Treatment |
|---|---|
| Sample GM playback | Tasks 3–4 |
| CC64 sustain | Task 1 + per-channel merge |
| Local then CDN | Task 3 URL contract |
| Offline FluidR3 subset | Task 5 |
| Per-track mute/solo/gain/timbre | Tasks 2, 4, 6 |
| Global engine/bank | Tasks 2, 6 |
| No double-play | Task 4 channel allowlist |
| Program changes / auto bank / drums / WAV | Deferred |

## Out of scope (v1)

- Mid-track program changes; channel-10 drums; full multi-bank offline; auto bank-by-name; per-track engine/bank UI; live SustainTracker; WAV export; network download in `validate`.

## Execution

Start at Task 1. Finish each task’s tests before the next. Do not skip copying `names.json` into `gmInstrumentSlugs.ts`.
