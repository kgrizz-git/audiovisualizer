# SoundFont Playback Engine & Asset Bundling Implementation Plan

Status: ready for implementation (revised 2026-07-23 from assessment + pre-flight review)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide General MIDI sample playback (midi-js-soundfonts) with local FluidR3 core assets + CDN fallback, offline sustain (CC64) duration extension, per-track mute/solo/gain/timbre preserved through sample and oscillator engines, and a small Tauri-ready FluidR3 bundle.

**Architecture:** Split **engine** (`sample` | `oscillator`) from **soundbank** (`FluidR3_GM` | `MusyngKite` | `FatBoy`). `SoundfontPatchLoader` parses the midi-js JS wrapper (not JSON), caches patches, and accepts an injectable decoder for tests. `SoundfontPlayer` owns a shared `AudioContext`, parallel-loads patches with a generation guard, schedules samples for ready patches immediately, and batches oscillator fallback for the rest via existing `MidiPreviewPlayer` (channel-filtered so sample and oscillator never double-play). CC64 uses an **offline** sustain-window pre-pass (no live `SustainTracker`). `VoiceRouter` unifies the existing `voicePlayback` map with soundbank/engine choice.

**Tech Stack:** TypeScript, Web Audio API, Vitest (Node + injected fakes), Vite, Node (`scripts/bundle-soundfonts.mjs`).

**Spec:** [`plans/specs/2026-07-22-soundfont-playback.md`](specs/2026-07-22-soundfont-playback.md)

**Product decision (locked):** CDN-first with a **FluidR3 core subset** bundled under `public/soundfonts/` for offline/Tauri. Other banks require network. Full multi-bank offline packaging is out of scope for v1. Shared offline asset path with the audio-file-input / Tauri work: `public/soundfonts/`.

## Global Constraints

- Keep MIDI parser and score-to-geometry mapper deterministic and side-effect free.
- Preserve `MidiPreviewPlayer` as the oscillator engine (shared `AudioContext` via injection).
- Browser MIDI file handling stays local; no telemetry; no user MIDI upload.
- Must pass `npm run validate`.
- Update `ARCHITECTURE.md`, `CHANGELOG.md` (MINOR), `dev-docs/TO_DO.md`; gitignore bulky soundfont `.js` assets.
- Mid-track **program-change handling** is **deferred** (backlog) — do not claim it in docs as shipped.
- Flat test names under `tests/` (e.g. `tests/soundfontPlayer.test.ts`), matching `tests/midiPreview.test.ts`.
- **v1 engine/bank are global UI defaults** — not per-track toggles. Per-track overrides remain gain/mute/solo/timbre only.

### Assessment decisions applied

| Assessment item | Decision |
|---|---|
| B1 SustainTracker dead | Drop class; offline `buildSustainWindows` / `getSustainedDuration` only; clamp open pedal to `score.duration` |
| B2 midi-js is not JSON | `parseMidiJsSoundfontScript` via captured `MIDI` global (`new Function`); allowlisted bank scripts only |
| B3 serial pre-block | `Promise.all` + `generation` guard; schedule samples as patches resolve; fallback batch for misses |
| B4 program changes | Defer; remove from shipped goal wording |
| B5 channel keys | Overrides key on `TrackScore.channel` as resolved by parser (`channel ?? trackIdx`); tests use 0-based |
| BA1 engine + bank | Adopt; **global defaults in v1** (UI sets router defaults; no per-track engine/bank UI) |
| BA6 / G7 voicePlayback | Fold into `VoiceRouter` / `VoiceRouteSettings` (include `timbre`) |
| G4 / G5 banks | Broader FluidR3 core list; UI marks CDN-only banks; BasicSynth → `engine: oscillator` |
| G8 AudioContext | Inject / share one context |
| Docs | Explicit checklist in Task 6 |
| Mixed sample + osc | `MidiPreviewPlayer.start` gains optional `channels?: number[]` allowlist |
| Sustain channel split | Player merges sustain events **per channel** across tracks before building windows |

### Pre-flight locks (2026-07-23 review)

| Topic | Lock |
|---|---|
| Fallback double-play | Fallback only schedules channels whose sample patches failed (or all channels when engine is oscillator) |
| Engine scope | Global `engine` + `soundbank` defaults; per-track mix only |
| Sample scheduling | MIDI pitch → note name; nearest available sample if exact key missing; strip `data:` URI; velocity→gain; honor play offset |
| Lifecycle | `SoundfontPlayer.stop()` stops sample sources **and** fallback; `app.pause()` calls it |
| CI bundler | Dev: full download; CI/docs: `--verify` only (no network download in validate) |
| TO_DO | Split soundfont v1 (done) from deferred program-change / WAV export items |

---

### Task 1: Domain — `SustainEvent`, parser CC64, offline sustain helpers

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/midi/parser.ts`
- Create: `src/audio/soundfont/sustainWindows.ts`
- Test: `tests/sustainWindows.test.ts`
- Test: `tests/midiParserSustain.test.ts` (extend or sibling to `tests/midi.test.ts`)

**Interfaces:**
- Produces: `SustainEvent` on `TrackScore`
- Produces: `buildSustainWindows(events, scoreEnd): { start; end }[]`
- Produces: `getSustainedDuration(note, windows): number` (never `Infinity`)
- Produces (optional helper): `sustainEventsForChannel(score, channel): SustainEvent[]` — merge/sort all tracks on that channel (CC64 is channel-scoped; notes and CC may live on different tracks)

**Sustain algorithm (lock):**
- Pedal down = value ≥ 64; pedal up = value < 64.
- A note held into a pedal-down window extends to `max(note.onset + note.duration, window.end)` for the window that contains the note’s release (or that the note intersects while held).
- If the note starts after pedal is already down, it still sustains until pedal up (or score end).
- Multiple sequential windows: apply the window that covers the note’s natural release time; if none, return natural duration.
- Open pedal at end of event list → clamp `end` to `scoreEnd`.

- [ ] **Step 1: Write failing tests**

`tests/sustainWindows.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildSustainWindows, getSustainedDuration } from '../src/audio/soundfont/sustainWindows.js';
import { NoteEvent } from '../src/core/types.js';

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
});
```

`tests/midiParserSustain.test.ts` — build a tiny MIDI via `@tonejs/midi` (or a checked-in fixture under `tests/fixtures/`) with CC64, then:
```typescript
expect(score.tracks[0].sustainEvents?.length).toBeGreaterThan(0);
expect(score.tracks[0].sustainEvents![0].value).toBeGreaterThanOrEqual(64);
```
Do **not** use `expect(true).toBe(true)` stubs.

- [ ] **Step 2: Run tests — expect FAIL**

`npx vitest run tests/sustainWindows.test.ts tests/midiParserSustain.test.ts`

- [ ] **Step 3: Implement**

```typescript
// types.ts
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

Parser (values are 0–1 from `@tonejs/midi`):
```typescript
const sustainEvents: SustainEvent[] = [];
const sustainCCs = track.controlChanges?.[64] ?? track.controlChanges?.sustain;
if (sustainCCs) {
  for (const cc of sustainCCs) {
    sustainEvents.push({ time: cc.time, value: Math.round(cc.value * 127) });
  }
  sustainEvents.sort((a, b) => a.time - b.time);
}
// push TrackScore with sustainEvents (omit or [] when empty — prefer [] for determinism)
```

`sustainWindows.ts`: implement window builder; on open pedal at end of list use `scoreEnd`, never `Infinity`. Export a channel-merge helper used by the player.

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit** (only if user requested commits)

---

### Task 2: Types, VoiceRouter (engine + bank), unify with voicePlayback

**Files:**
- Create: `src/audio/soundfont/soundfontTypes.ts`
- Create: `src/audio/soundfont/voiceRouter.ts`
- Modify: `src/audio/midiPreviewPlayer.ts` (export `SynthTimbre` already; ensure `VoicePlaybackSettings` stays the oscillator shape)
- Test: `tests/voiceRouter.test.ts`

**Interfaces:**
```typescript
export type SoundbankPreset = 'FluidR3_GM' | 'MusyngKite' | 'FatBoy';
export type PlaybackEngine = 'sample' | 'oscillator';

export interface VoiceRouteSettings {
  channel: number;
  program: number;
  // engine + soundbank are copied from router *defaults* in v1 (global UI).
  // Per-track engine/bank overrides are reserved for a later milestone — do not add UI for them.
  engine: PlaybackEngine;
  soundbank: SoundbankPreset; // used when engine === 'sample'
  timbre: SynthTimbre;        // used when engine === 'oscillator' or fallback
  gain: number;
  muted: boolean;
  solo: boolean;
}
```

`VoiceRouter`:
- Holds **global defaults** `{ engine, soundbank }` set by UI.
- Keys **mix** overrides (gain/mute/solo/timbre) by **`TrackScore.channel` as stored** (post `channel ?? trackIdx`). Document in a one-line comment.
- `resolveTrackSettings(track)` merges global defaults + mix override + track `program`.
- `syncFromVoicePlayback(map: Map<number, VoicePlaybackSettings>)` copies gain/mute/solo/timbre into overrides (or replace map ownership — prefer router as source of truth after UI migration in Task 6).
- **No automatic bank-by-name matching in v1** — global default bank only.
- **No per-track engine/bank UI in v1.**

Tests use channels `0` and `1` to match demo/parser convention.

- [ ] **Step 1–4:** TDD VoiceRouter resolve + override + timbre pass-through + global defaults apply to all tracks
- [ ] **Step 5:** Commit if requested

---

### Task 3: Patch loader — JS wrapper parse, parallel decode, injectable decoder

**Files:**
- Create: `src/audio/soundfont/soundfontPatchLoader.ts`
- Create: `src/audio/soundfont/gmInstrumentSlugs.ts` (full 128-name table; source: gleitz `FluidR3_GM/names.json` / midi-js convention)
- Create: `tests/fixtures/midi-js-acoustic_grand_piano-snippet.js` (tiny truncated fixture with 2–3 notes’ base64 stubs — enough to parse map keys, not full CDN size)
- Test: `tests/soundfontPatchLoader.test.ts`

**Critical:** midi-js-soundfonts files look like:
```js
if (typeof(MIDI) === 'undefined') var MIDI = {};
if (typeof(MIDI.Soundfont) === 'undefined') MIDI.Soundfont = {};
MIDI.Soundfont.acoustic_grand_piano = { "A0": "data:audio/mp3;base64,…", … };
```
Do **not** `JSON.parse` a brace slice of the whole file.

**Security note:** `new Function` is only used on allowlisted bank scripts (bundled under `/soundfonts/` or fetched from the gleitz CDN host). Never evaluate user-uploaded MIDI or arbitrary URLs.

**URL contract (lock):**
```text
Local:  /soundfonts/{Bank}/{slug}-mp3.js
CDN:    https://gleitz.github.io/midi-js-soundfonts/{Bank}/{slug}-mp3.js
```
Bank path segments: `FluidR3_GM` | `MusyngKite` | `FatBoy`. Prefer `-mp3.js` (smaller, widely decoded).

```typescript
export function parseMidiJsSoundfontScript(text: string, slug: string): Record<string, string> {
  const sandbox: { MIDI?: { Soundfont?: Record<string, Record<string, string>> } } = {};
  // Bind `MIDI` as a var in the Function scope that writes into sandbox
  const fn = new Function('MIDI', `${text}; return MIDI;`);
  const MIDI = fn(sandbox.MIDI ?? (sandbox.MIDI = { Soundfont: {} }));
  const map = MIDI?.Soundfont?.[slug];
  if (!map || typeof map !== 'object') throw new Error(`Soundfont slug missing: ${slug}`);
  return map;
}

export type AudioDecoder = (bytes: ArrayBuffer) => Promise<AudioBuffer>;

export class SoundfontPatchLoader {
  constructor(private readonly decode: AudioDecoder) {}
  // getAssetUrl(bank, slug) → local then CDN
  // loadPatch: fetch local; on 404 fetch CDN; parse script; decode each note
  // Promise.all over note entries for decodeAudioData
}
```

Decode path: strip `data:audio/mp3;base64,` (or other `data:` prefix) → `atob` / `Uint8Array` → `decode(bytes)`. Default browser decoder: `(bytes) => context.decodeAudioData(bytes.slice(0))` (copy if needed for detach).

GM slug list: keep full 128 from gleitz names; test `getInstrumentSlug(24) === 'acoustic_guitar_nylon'`.

Tests:
- slug mapping
- URL local vs CDN (`getAssetUrl` / URL builders)
- `parseMidiJsSoundfontScript` on fixture
- `loadPatch` with stub `fetch` + stub decoder returns buffers
- fetch fail → `null`
- local 404 then CDN success (mock fetch sequence)
- data-URI strip before decode (unit helper if extracted)

- [ ] **Step 1–4:** TDD then implement
- [ ] **Step 5:** Commit if requested

---

### Task 4: SoundfontPlayer — parallel load, generation guard, shared context, sustain

**Files:**
- Create: `src/audio/soundfont/soundfontPlayer.ts`
- Modify: `src/audio/midiPreviewPlayer.ts` — accept optional shared `AudioContext`; accept optional `channels?: number[]` allowlist on `start`
- Test: `tests/soundfontPlayer.test.ts`
- Test: extend `tests/midiPreview.test.ts` for channel allowlist (when provided, only those channels schedule)

**Behavior:**
1. `start(score, offset, opts: { engine; soundbank; router; context? })`
2. Bump `this.generation`; capture `localGen`
3. `this.context ??= opts.context ?? new AudioContext()`; pass same context into `MidiPreviewPlayer`
4. Resolve routes from **global** engine/bank defaults; skip muted / non-solo when solo active
5. For `engine === 'oscillator'` globally: schedule entire score via fallback only (`channels` omitted / all audible channels)
6. Else `Promise.all` unique `(soundbank, program)` loads
7. After each await, if `this.generation !== localGen` return (also stop any sources already started for this gen if needed)
8. For each ready patch track: schedule sample notes with channel-merged sustain windows + `getSustainedDuration(..., score.duration)`
9. Collect channels without patches → **one** `fallbackPlayer.start(score, offset, voices, { channels: missingChannels })`
10. Do **not** call `fallbackPlayer.start` per track; do **not** pass channels that already have sample voices (avoids double playback)

**Sample scheduling contract (lock):**
- MIDI pitch `0–127` → note name (`C4`, `C#4`, …) matching midi-js key convention.
- If exact key missing in patch, use **nearest available** sample key (prefer closest pitch; tie → lower).
- Playback start honors `offsetSeconds` the same way `MidiPreviewPlayer` does (skip notes fully before offset; truncate remaining duration).
- Velocity → gain: same spirit as oscillator preview, scaled by router `gain` (document constants next to schedule helper).
- Strip/decode data URIs in the loader (Task 3), not in the player.
- Track active `AudioBufferSourceNode`s (and gains); `stop()` stops them all and calls `fallbackPlayer.stop()`.

**`MidiPreviewPlayer` change:**
```typescript
start(
  score: Score,
  offsetSeconds: number,
  voices: Map<number, VoicePlaybackSettings>,
  opts?: { channels?: number[] }, // when set, only schedule these TrackScore.channel values
): Promise<void>
```

Mute/solo/gain/timbre must come from `VoiceRouter`, not hard-coded `'sine'`.

Tests (injected loader / stub context):
- all patches null → fallback `start` called once with all audible channels
- mixed ready/miss → samples for ready channels; fallback `start` once with **only** miss channels
- muted track → no scheduled sample for that channel
- sustain extends duration (spy on schedule or expose helper)
- generation bump cancels stale start (optional but preferred)
- `stop()` clears sample sources and invokes fallback `stop`

- [ ] **Step 1–4:** TDD then implement
- [ ] **Step 5:** Commit if requested

---

### Task 5: Bundler, license, gitignore, manifest

**Files:**
- Create: `scripts/bundle-soundfonts.mjs`
- Create: `public/soundfonts/LICENSE.txt`
- Modify: `.gitignore` — ignore `public/soundfonts/**/*.js` (keep `LICENSE.txt` and `manifest.json` if committed)
- Optional: `public/soundfonts/FluidR3_GM/manifest.json` written by script (slug, url, sha256, bytes)

**Product scope:** FluidR3_GM core cross-section for offline (CDN-first elsewhere). Same `public/soundfonts/` tree is the Tauri/desktop offline asset path.

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

Document ~20–30 MB budget in script header comments. Script flags:
- default: download missing (dev / local setup)
- `--verify`: check sha256 vs manifest; **no download** — use this in CI / docs; do **not** add network download to `npm run validate`
- write/update `manifest.json`

LICENSE.txt: FluidR3 CC BY 3.0 attribution (Frank Wen) + link to gleitz/midi-js-soundfonts. Note MusyngKite/FatBoy are CDN-only and BY-SA when used online.

Do **not** commit downloaded `.js` blobs.

- [ ] **Step 1:** Implement script + LICENSE + gitignore
- [ ] **Step 2:** `node scripts/bundle-soundfonts.mjs` (network, local/dev only) — document that CI uses `--verify` when a manifest is present
- [ ] **Step 3:** Add `package.json` scripts:
  - `"bundle:soundfonts": "node scripts/bundle-soundfonts.mjs"`
  - `"bundle:soundfonts:verify": "node scripts/bundle-soundfonts.mjs --verify"`
- [ ] **Step 4:** Commit script/LICENSE/gitignore/package.json (not assets) if requested

---

### Task 6: UI, docs, validation

**Files:**
- Modify: `index.html`, `src/ui/app.ts`
- Modify: `ARCHITECTURE.md`, `CHANGELOG.md`, `CHANGELOG.dev.md`, `dev-docs/TO_DO.md`, `README.md` (short playback note)

**UI:**
- Replace “LOCAL SYNTH” label with engine/bank controls:
  - Engine: Sample SoundFont | Oscillator synth (**global**)
  - Bank select: FluidR3 GM (local+CDN); MusyngKite (network); FatBoy (network)
- Wire `SoundfontPlayer`; on play pass router synced from existing audio-voice rows (timbre/gain/mute/solo)
- On pause / scrub / new score: call `soundfontPlayer.stop()` (not only `midiPreview.stop()`)
- Keep existing per-track timbre selects meaningful for oscillator engine and for sample→fallback tracks
- Disable or visually de-emphasize timbre when sample engine is active **and** the track has a loaded patch (optional polish; fallback tracks still need timbre)

**Docs checklist (each item required):**
- [ ] `ARCHITECTURE.md` — Stack row for SoundFont loader/player; domain `SustainEvent` / `VoiceRouteSettings`; **rewrite** “Playback and source boundaries” (no longer “oscillator only”); note `public/soundfonts/` for Tauri offline
- [ ] `CHANGELOG.md` Unreleased — Added sample playback + bank/engine controls; SemVer **MINOR**
- [ ] `CHANGELOG.dev.md` — bundler, tests, gitignore policy
- [ ] `dev-docs/TO_DO.md` — **split** the current “Finalize robust MIDI playback…” item:
  - Mark **done**: selectable GM SoundFonts, sustain (CC64), engine/bank controls, voice mix through sample+oscillator
  - Keep/add **deferred** (unchecked): mid-track program-change handling; deterministic WAV / audio-export policy; per-track engine/bank overrides; channel-10 drums; auto bank-by-name
- [ ] `README.md` — one short paragraph on SoundFont preview / FluidR3 core / CDN banks / `npm run bundle:soundfonts`

- [ ] **Step: `npm run validate`** must PASS
- [ ] Commit if requested

---

## Spec coverage (post-revision)

| Spec / goal claim | Plan treatment |
|---|---|
| Sample GM playback | Tasks 3–4 |
| CC64 sustain | Task 1 offline windows (clamped) + per-channel merge in player |
| Local then CDN | Task 3 URL contract |
| Offline FluidR3 subset | Task 5 CDN-first decision |
| Per-track mute/solo/gain/timbre | Tasks 2, 4, 6 |
| Global engine/bank | Task 2 + Task 6 (no per-track engine UI in v1) |
| Mixed sample + osc | Task 4 channel allowlist on fallback |
| Auto bank-by-name match | **Deferred** — global default only |
| Program-change mid-track | **Deferred** — backlog |
| Seamless while loading | Parallel load + gen guard; fallback for misses (no mid-note crossfade in v1) |

## Out of scope (v1)

- Mid-track program changes
- Channel-10 drum kits / separate percussion banks
- Full multi-bank offline packaging
- Automatic bank selection from track names
- Per-track engine/bank overrides (global defaults only)
- Live `SustainTracker` event API
- Deterministic WAV audio export (backlog)
- Network download inside `npm run validate` / CI

## Execution Handoff

Plan revised 2026-07-23 from assessment + pre-flight review (mixed-playback allowlist, global engine scope, sustain edge cases, URL/scheduling/lifecycle locks, TO_DO split, CI verify-only). Assessment artifact (may be gitignored): `tmp/2026-07-23T0902-soundfont-playback-plan-assessment.md`.

**Recommended approach:** Subagent-Driven or Inline Execution — either is fine; start at Task 1.
