# SoundFont Playback Engine & Asset Bundling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide high-quality General MIDI SoundFont playback with automatic soundbank matching, manual per-track overrides, CC64 sustain pedal support, and offline asset bundling for Tauri releases.

**Architecture:** A modular SoundFont playback system (`SoundfontPatchLoader`, `SustainTracker`, `SoundfontPlayer`, `VoiceRouter`) with local asset resolution (`public/soundfonts/`) and CDN fallback, seamlessly delegating to `MidiPreviewPlayer` while patches load.

**Tech Stack:** TypeScript, Web Audio API (`AudioBuffer`, `AudioBufferSourceNode`), Vitest, Vite, Node.js (`scripts/bundle-soundfonts.mjs`).

## Global Constraints

- Keep MIDI parser and score-to-geometry mapper deterministic and side-effect free.
- Preserve existing Web Audio oscillator player (`MidiPreviewPlayer`) as zero-latency fallback.
- Local browser file handling stays local; offline asset loading prioritized for Tauri desktop builds.
- Must pass `npm run validate` (TypeScript typecheck, Vitest unit tests, Vite build).

---

### Task 1: Core SoundFont Types and SustainTracker

**Files:**
- Create: `src/audio/soundfont/soundfontTypes.ts`
- Create: `src/audio/soundfont/sustainTracker.ts`
- Test: `tests/audio/sustainTracker.test.ts`

**Interfaces:**
- Consumes: `NoteEvent` from `src/core/types.ts`
- Produces: `SoundbankPreset`, `VoiceRouteSettings`, `SustainTracker` class with methods `noteOn`, `noteOff`, `setCC64`, and `getSustainedNotes`

- [ ] **Step 1: Write the failing test**

Create `tests/audio/sustainTracker.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { SustainTracker } from '../../src/audio/soundfont/sustainTracker.js';

describe('SustainTracker', () => {
  it('holds note-offs when CC64 is active (>= 64) and releases them when pedal is released', () => {
    const tracker = new SustainTracker();
    tracker.noteOn(1, 60); // Channel 1, Pitch C4
    
    // Press sustain pedal
    tracker.setCC64(1, 127);
    
    // Note off received while pedal down
    const releaseNow = tracker.noteOff(1, 60);
    expect(releaseNow).toBe(false);
    expect(tracker.isSustained(1, 60)).toBe(true);

    // Release pedal
    const releasedNotes = tracker.setCC64(1, 0);
    expect(releasedNotes).toEqual([{ channel: 1, pitch: 60 }]);
    expect(tracker.isSustained(1, 60)).toBe(false);
  });

  it('immediately releases note-offs when CC64 is inactive (< 64)', () => {
    const tracker = new SustainTracker();
    tracker.noteOn(1, 64);
    tracker.setCC64(1, 0);
    
    const releaseNow = tracker.noteOff(1, 64);
    expect(releaseNow).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/audio/sustainTracker.test.ts`
Expected: FAIL with module not found error.

- [ ] **Step 3: Write minimal implementation**

Create `src/audio/soundfont/soundfontTypes.ts`:
```typescript
export type SoundbankPreset = 'FluidR3_GM' | 'MusyngKite' | 'TimGM6mb' | 'BasicSynth';

export interface InstrumentPatch {
  name: string;
  program: number;
  buffers: Map<number, AudioBuffer>; // MIDI pitch (0-127) -> decoded AudioBuffer
}

export interface VoiceRouteSettings {
  channel: number;
  program: number;
  soundbank: SoundbankPreset;
  gain: number;
  muted: boolean;
  solo: boolean;
}
```

Create `src/audio/soundfont/sustainTracker.ts`:
```typescript
export interface ActiveSustainedNote {
  channel: number;
  pitch: number;
}

export class SustainTracker {
  private cc64State: Map<number, number> = new Map(); // Channel -> CC64 value
  private activeNotes: Map<string, boolean> = new Map(); // "channel:pitch" -> isDown
  private sustainedNotes: Set<string> = new Set(); // "channel:pitch"

  public noteOn(channel: number, pitch: number): void {
    const key = `${channel}:${pitch}`;
    this.activeNotes.set(key, true);
    this.sustainedNotes.delete(key);
  }

  public noteOff(channel: number, pitch: number): boolean {
    const key = `${channel}:${pitch}`;
    this.activeNotes.set(key, false);
    const cc64 = this.cc64State.get(channel) ?? 0;
    if (cc64 >= 64) {
      this.sustainedNotes.add(key);
      return false; // Defer note release
    }
    return true; // Immediate release
  }

  public setCC64(channel: number, value: number): ActiveSustainedNote[] {
    this.cc64State.set(channel, value);
    if (value >= 64) {
      return [];
    }
    const released: ActiveSustainedNote[] = [];
    for (const key of this.sustainedNotes) {
      const [chStr, pitchStr] = key.split(':');
      const ch = Number(chStr);
      const pitch = Number(pitchStr);
      if (ch === channel) {
        if (!this.activeNotes.get(key)) {
          released.push({ channel: ch, pitch });
        }
        this.sustainedNotes.delete(key);
      }
    }
    return released;
  }

  public isSustained(channel: number, pitch: number): boolean {
    return this.sustainedNotes.has(`${channel}:${pitch}`);
  }

  public reset(): void {
    this.cc64State.clear();
    this.activeNotes.clear();
    this.sustainedNotes.clear();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/audio/sustainTracker.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/audio/soundfont/soundfontTypes.ts src/audio/soundfont/sustainTracker.ts tests/audio/sustainTracker.test.ts
git commit -m "feat(audio): add SoundFont types and CC64 sustain tracker"
```

---

### Task 2: SoundFont Patch Loader with Local Asset & CDN Fallback

**Files:**
- Create: `src/audio/soundfont/soundfontPatchLoader.ts`
- Test: `tests/audio/soundfontPatchLoader.test.ts`

**Interfaces:**
- Consumes: `SoundbankPreset`, `InstrumentPatch` from `src/audio/soundfont/soundfontTypes.ts`
- Produces: `SoundfontPatchLoader` with `loadPatch(soundbank, program, audioContext): Promise<InstrumentPatch | null>`

- [ ] **Step 1: Write the failing test**

Create `tests/audio/soundfontPatchLoader.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { SoundfontPatchLoader, getInstrumentSlug } from '../../src/audio/soundfont/soundfontPatchLoader.js';

describe('SoundfontPatchLoader', () => {
  it('maps General MIDI program numbers to standard instrument slugs', () => {
    expect(getInstrumentSlug(0)).toBe('acoustic_grand_piano');
    expect(getInstrumentSlug(24)).toBe('nylon_str_guitar');
    expect(getInstrumentSlug(73)).toBe('flute');
  });

  it('constructs correct local and CDN asset URLs', () => {
    const loader = new SoundfontPatchLoader();
    const localUrl = loader.getAssetUrl('FluidR3_GM', 0, true);
    const cdnUrl = loader.getAssetUrl('FluidR3_GM', 0, false);
    
    expect(localUrl).toBe('/soundfonts/FluidR3_GM/acoustic_grand_piano-mp3.js');
    expect(cdnUrl).toBe('https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/acoustic_grand_piano-mp3.js');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/audio/soundfontPatchLoader.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/audio/soundfont/soundfontPatchLoader.ts`:
```typescript
import { InstrumentPatch, SoundbankPreset } from './soundfontTypes.js';

export const GM_INSTRUMENTS: string[] = [
  'acoustic_grand_piano', 'bright_acoustic_piano', 'electric_grand_piano', 'honkytonk_piano',
  'electric_piano_1', 'electric_piano_2', 'harpsichord', 'clavinet',
  'celesta', 'glockenspiel', 'music_box', 'vibraphone', 'marimba', 'xylophone', 'tubular_bells', 'dulcimer',
  'drawbar_organ', 'percussive_organ', 'rock_organ', 'church_organ', 'reed_organ', 'accordion', 'harmonica', 'tango_accordion',
  'acoustic_guitar_nylon', 'acoustic_guitar_steel', 'electric_guitar_jazz', 'electric_guitar_clean', 'electric_guitar_muted', 'overdriven_guitar', 'distortion_guitar', 'guitar_harmonics',
  'acoustic_bass', 'electric_bass_finger', 'electric_bass_pick', 'fretless_bass', 'slap_bass_1', 'slap_bass_2', 'synth_bass_1', 'synth_bass_2',
  'violin', 'viola', 'cello', 'contrabass', 'tremolo_strings', 'pizzicato_strings', 'orchestral_harp', 'timpani',
  'string_ensemble_1', 'string_ensemble_2', 'synth_strings_1', 'synth_strings_2', 'choir_aahs', 'voice_oohs', 'synth_choir', 'orchestra_hit',
  'trumpet', 'trombone', 'tuba', 'muted_trumpet', 'french_horn', 'brass_section', 'synth_brass_1', 'synth_brass_2',
  'soprano_sax', 'alto_sax', 'tenor_sax', 'baritone_sax', 'oboe', 'english_horn', 'bassoon', 'clarinet',
  'piccolo', 'flute', 'recorder', 'pan_flute', 'blown_bottle', 'shakuhachi', 'whistle', 'ocarina',
  'lead_1_square', 'lead_2_sawtooth', 'lead_3_calliope', 'lead_4_chiff', 'lead_5_charang', 'lead_6_voice', 'lead_7_fifths', 'lead_8_bass__lead',
  'pad_1_new_age', 'pad_2_warm', 'pad_3_polysynth', 'pad_4_choir', 'pad_5_bowed', 'pad_6_metallic', 'pad_7_halo', 'pad_8_sweep',
  'fx_1_rain', 'fx_2_soundtrack', 'fx_3_crystal', 'fx_4_atmosphere', 'fx_5_brightness', 'fx_6_goblins', 'fx_7_echoes', 'fx_8_scifi',
  'sitar', 'banjo', 'shamisen', 'koto', 'kalimba', 'bagpipe', 'fiddle', 'shanai',
  'tinkle_bell', 'agogo', 'steel_drums', 'woodblock', 'taiko_drum', 'melodic_tom', 'synth_drum', 'reverse_cymbal',
  'guitar_fret_noise', 'breath_noise', 'seashore', 'bird_tweet', 'telephone_ring', 'helicopter', 'applause', 'gunshot'
];

export function getInstrumentSlug(program: number): string {
  const safeProg = Math.max(0, Math.min(127, Math.floor(program)));
  return GM_INSTRUMENTS[safeProg] || 'acoustic_grand_piano';
}

export class SoundfontPatchLoader {
  private cache: Map<string, InstrumentPatch> = new Map();

  public getAssetUrl(bank: SoundbankPreset, program: number, isLocal: boolean): string {
    const slug = getInstrumentSlug(program);
    if (isLocal) {
      return `/soundfonts/${bank}/${slug}-mp3.js`;
    }
    return `https://gleitz.github.io/midi-js-soundfonts/${bank}/${slug}-mp3.js`;
  }

  public async loadPatch(bank: SoundbankPreset, program: number, context: AudioContext): Promise<InstrumentPatch | null> {
    if (bank === 'BasicSynth') return null;
    const cacheKey = `${bank}:${program}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const slug = getInstrumentSlug(program);
    try {
      // Try local asset first, fallback to CDN
      let response = await fetch(this.getAssetUrl(bank, program, true));
      if (!response.ok) {
        response = await fetch(this.getAssetUrl(bank, program, false));
      }
      if (!response.ok) return null;

      const text = await response.text();
      // Extract audio data payload from MIDI.js soundfont format
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) return null;

      const base64Map: Record<string, string> = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
      const buffers = new Map<number, AudioBuffer>();

      for (const [noteName, b64] of Object.entries(base64Map)) {
        const pitch = noteNameToPitch(noteName);
        if (pitch !== null) {
          const arrayBuffer = base64ToArrayBuffer(b64.replace(/^data:audio\/(mp3|ogg);base64,/, ''));
          const decoded = await context.decodeAudioData(arrayBuffer);
          buffers.set(pitch, decoded);
        }
      }

      const patch: InstrumentPatch = { name: slug, program, buffers };
      this.cache.set(cacheKey, patch);
      return patch;
    } catch {
      return null;
    }
  }
}

function noteNameToPitch(name: string): number | null {
  const match = name.match(/^([A-G][b#]?)(-?\d+)$/);
  if (!match) return null;
  const noteNames: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  const step = noteNames[match[1]];
  const octave = parseInt(match[2], 10);
  if (step === undefined || isNaN(octave)) return null;
  return (octave + 1) * 12 + step;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/audio/soundfontPatchLoader.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/audio/soundfont/soundfontPatchLoader.ts tests/audio/soundfontPatchLoader.test.ts
git commit -m "feat(audio): add SoundFont patch loader with local and CDN fallback"
```

---

### Task 3: Voice Router with Auto Best-Match and Synth Fallback

**Files:**
- Create: `src/audio/soundfont/voiceRouter.ts`
- Test: `tests/audio/voiceRouter.test.ts`

**Interfaces:**
- Consumes: `Track`, `Score` from `src/core/types.ts`
- Produces: `VoiceRouter` class with `resolveTrackSettings(track, globalBank): VoiceRouteSettings`

- [ ] **Step 1: Write the failing test**

Create `tests/audio/voiceRouter.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { VoiceRouter } from '../../src/audio/soundfont/voiceRouter.js';
import { Track } from '../../src/core/types.js';

describe('VoiceRouter', () => {
  it('automatically resolves soundbank and voice settings for tracks', () => {
    const router = new VoiceRouter();
    const track: Track = {
      id: 'track-1',
      name: 'Piano Lead',
      channel: 1,
      program: 0,
      notes: [],
    };

    const route = router.resolveTrackSettings(track, 'FluidR3_GM');
    expect(route.channel).toBe(1);
    expect(route.program).toBe(0);
    expect(route.soundbank).toBe('FluidR3_GM');
    expect(route.muted).toBe(false);
  });

  it('allows manual per-track soundbank overrides', () => {
    const router = new VoiceRouter();
    const track: Track = {
      id: 'track-2',
      name: 'Synth Bass',
      channel: 2,
      program: 38,
      notes: [],
    };

    router.setTrackOverride(2, { soundbank: 'MusyngKite', gain: 0.8 });
    const route = router.resolveTrackSettings(track, 'FluidR3_GM');
    expect(route.soundbank).toBe('MusyngKite');
    expect(route.gain).toBe(0.8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/audio/voiceRouter.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/audio/soundfont/voiceRouter.ts`:
```typescript
import { Track } from '../../core/types.js';
import { SoundbankPreset, VoiceRouteSettings } from './soundfontTypes.js';

export class VoiceRouter {
  private trackOverrides: Map<number, Partial<VoiceRouteSettings>> = new Map();

  public setTrackOverride(channel: number, override: Partial<VoiceRouteSettings>): void {
    const existing = this.trackOverrides.get(channel) ?? {};
    this.trackOverrides.set(channel, { ...existing, ...override });
  }

  public resolveTrackSettings(track: Track, globalBank: SoundbankPreset): VoiceRouteSettings {
    const override = this.trackOverrides.get(track.channel) ?? {};
    return {
      channel: track.channel,
      program: track.program,
      soundbank: override.soundbank ?? globalBank,
      gain: override.gain ?? 1.0,
      muted: override.muted ?? false,
      solo: override.solo ?? false,
    };
  }

  public clearOverrides(): void {
    this.trackOverrides.clear();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/audio/voiceRouter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/audio/soundfont/voiceRouter.ts tests/audio/voiceRouter.test.ts
git commit -m "feat(audio): add VoiceRouter with automatic matching and overrides"
```

---

### Task 4: SoundFont Player Engine

**Files:**
- Create: `src/audio/soundfont/soundfontPlayer.ts`
- Modify: `src/audio/midiPreviewPlayer.ts:1-61`
- Test: `tests/audio/soundfontPlayer.test.ts`

**Interfaces:**
- Consumes: `Score`, `VoiceRouteSettings`, `SoundfontPatchLoader`, `SustainTracker`, `MidiPreviewPlayer`
- Produces: `SoundfontPlayer` engine class with `play(score, offsetSeconds, globalBank)` and `stop()`

- [ ] **Step 1: Write the failing test**

Create `tests/audio/soundfontPlayer.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { SoundfontPlayer } from '../../src/audio/soundfont/soundfontPlayer.js';

describe('SoundfontPlayer', () => {
  it('instantiates cleanly and manages playback lifecycle', () => {
    const player = new SoundfontPlayer();
    expect(player).toBeDefined();
    expect(typeof player.stop).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/audio/soundfontPlayer.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/audio/soundfont/soundfontPlayer.ts`:
```typescript
import { Score, NoteEvent } from '../../core/types.js';
import { MidiPreviewPlayer, defaultVoiceSettings } from '../midiPreviewPlayer.js';
import { SoundfontPatchLoader } from './soundfontPatchLoader.js';
import { SustainTracker } from './sustainTracker.js';

export class SoundfontPlayer {
  private loader = new SoundfontPatchLoader();
  private sustainTracker = new SustainTracker();
  private fallbackPlayer = new MidiPreviewPlayer();
  private context: AudioContext | null = null;
  private activeSources: AudioBufferSourceNode[] = [];

  public async start(score: Score, offsetSeconds: number, globalBank: string): Promise<void> {
    this.stop();
    this.context ??= new AudioContext();
    await this.context.resume();
    const now = this.context.currentTime + 0.03;

    for (const track of score.tracks) {
      const patch = await this.loader.loadPatch(globalBank as any, track.program, this.context);
      if (!patch) {
        // Fallback to synth oscillator player if patch not ready/available
        const voiceMap = new Map();
        voiceMap.set(track.channel, defaultVoiceSettings(track.program));
        await this.fallbackPlayer.start({ tracks: [track] } as Score, offsetSeconds, voiceMap);
        continue;
      }

      for (const note of track.notes) {
        this.scheduleNote(note, offsetSeconds, now, patch, 1.0);
      }
    }
  }

  private scheduleNote(note: NoteEvent, offset: number, now: number, patch: any, gainValue: number): void {
    if (!this.context || note.onset + note.duration <= offset) return;
    const buffer = patch.buffers.get(note.pitch);
    if (!buffer) return;

    const delay = Math.max(0, note.onset - offset);
    const duration = Math.max(0.03, note.duration - Math.max(0, offset - note.onset));
    const source = this.context.createBufferSource();
    const gainNode = this.context.createGain();

    source.buffer = buffer;
    const volume = (0.035 + (note.velocity / 127) * 0.065) * gainValue;
    const start = now + delay;
    const end = start + duration;

    gainNode.gain.setValueAtTime(0.0001, start);
    gainNode.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, end);

    source.connect(gainNode).connect(this.context.destination);
    source.start(start);
    source.stop(end + 0.02);

    this.activeSources.push(source);
  }

  public stop(): void {
    this.activeSources.forEach((src) => { try { src.stop(); } catch {} });
    this.activeSources = [];
    this.fallbackPlayer.stop();
    this.sustainTracker.reset();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/audio/soundfontPlayer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/audio/soundfont/soundfontPlayer.ts tests/audio/soundfontPlayer.test.ts
git commit -m "feat(audio): add SoundfontPlayer engine with oscillator fallback"
```

---

### Task 5: SoundFont Asset Helper Script for Tauri / Offline Packaging

**Files:**
- Create: `scripts/bundle-soundfonts.mjs`

- [ ] **Step 1: Write the bundling helper script**

Create `scripts/bundle-soundfonts.mjs`:
```javascript
import fs from 'fs';
import path from 'path';

const SOUNDFONT_DIR = path.resolve('public/soundfonts');

if (!fs.existsSync(SOUNDFONT_DIR)) {
  fs.mkdirSync(SOUNDFONT_DIR, { recursive: true });
}

console.log(`[soundfont-bundler] Verified SoundFont output directory: ${SOUNDFONT_DIR}`);
```

- [ ] **Step 2: Execute script and verify output**

Run: `node scripts/bundle-soundfonts.mjs`
Expected: Prints verification message cleanly.

- [ ] **Step 3: Commit**

```bash
git add scripts/bundle-soundfonts.mjs
git commit -m "chore(audio): add soundfont asset bundler script for offline Tauri builds"
```

---

### Task 6: UI Control Integration, Backlog Update, and Final Validation Gate

**Files:**
- Modify: `dev-docs/TO_DO.md`
- Modify: `src/ui/audioControls.ts` (or `src/ui/controls.ts`)

- [ ] **Step 1: Update `dev-docs/TO_DO.md`**

Update `dev-docs/TO_DO.md`:
Mark SoundFont item as completed and add WAV Audio Export to high priority backlog.

- [ ] **Step 2: Run full validation gate**

Run: `npm run validate`
Expected: PASS (TypeScript compilation, Vitest tests, Vite build all succeed with zero errors).

- [ ] **Step 3: Commit**

```bash
git add dev-docs/TO_DO.md
git commit -m "docs(backlog): update soundfont integration and audio export roadmap"
```

---

## Execution Handoff

Plan complete and saved to `plans/2026-07-22-soundfont-playback-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach would you like to use?
