# Design Spec: SoundFont Playback Engine & Asset Bundling

Last reviewed: 2026-07-23
Date: 2026-07-22
Author: Antigravity
Status: approved (revised 2026-07-23; pre-flight locks + weaker-model-ready plan)

## 1. Goal

Provide General MIDI **sample** playback for MIDI scores using midi-js-soundfonts, with a
bundled FluidR3 core for offline/Tauri, CDN fallback for other instruments/banks, CC64
sustain via offline duration extension, and the existing oscillator synth as a first-class
alternate **engine**. Preserve per-track mute, solo, gain, and timbre.

**Deferred (backlog, not v1):** mid-track program-change handling; automatic bank selection
from track names; full multi-bank offline packaging; live event-driven sustain API;
channel-10 drum kits; per-track engine/bank overrides; deterministic WAV export.

## 2. Architecture & Components

```
                ┌──────────────────────────────────────────────┐
                │             UI / Controls (src/ui/app.ts)    │
                │  Engine + Bank selectors, track mix/timbre   │
                └──────────────────────┬───────────────────────┘
                                       │
                                       ▼
 ┌──────────────────────────────────────────────────────────────────────────┐
 │                            VoiceRouter                                   │
 │ - global engine: sample | oscillator                                     │
 │ - global soundbank when sample; timbre when oscillator / fallback        │
 │ - per-track gain / mute / solo / timbre (ex-voicePlayback map)           │
 └──────────────┬───────────────────────────────────────────┬───────────────┘
                │ engine=sample + patch ready               │ else (miss / osc)
                ▼                                           ▼
 ┌──────────────────────────────┐            ┌──────────────────────────────┐
 │       SoundfontPlayer        │            │      MidiPreviewPlayer       │
 │ - AudioBuffer samples        │            │ - Web Audio oscillators      │
 │ - Offline CC64 (per channel) │            │ - shared AudioContext        │
 │ - Parallel patch load + gen  │            │ - channels allowlist on miss │
 └──────────────┬───────────────┘            └──────────────────────────────┘
                │
                ▼
 ┌────────────────────────────────┐
 │     SoundfontPatchLoader       │
 │ 1. /soundfonts/{bank}/…-mp3.js │
 │ 2. gleitz CDN …/{bank}/…-mp3.js│
 │ Parse JS wrapper (not JSON)    │
 └────────────────────────────────┘
```

### Component breakdown

1. **`soundfontTypes.ts`** — `SoundbankPreset` (`FluidR3_GM` | `MusyngKite` | `FatBoy`),
   `PlaybackEngine` (`sample` | `oscillator`), `InstrumentPatch`, `VoiceRouteSettings`
   (includes `timbre`). Engine/bank on settings are copies of **global** router defaults in v1.

2. **`types.ts` / `parser.ts`** — `SustainEvent` on `TrackScore`; CC64 from `@tonejs/midi`
   (`value` is 0–1 → store 0–127). Channel remains `track.channel ?? trackIdx`.

3. **`sustainWindows.ts`** — Offline `buildSustainWindows` / `getSustainedDuration`.
   Open pedals clamp to score end (never `Infinity`). Player merges sustain events per
   MIDI channel across tracks before building windows. No live `SustainTracker` in v1.

4. **`soundfontPatchLoader.ts`** — `parseMidiJsSoundfontScript` evaluates allowlisted MIDI.js
   bank scripts into a captured `MIDI` object; parallel `decodeAudioData` via injectable
   `AudioDecoder`; local then CDN URLs:
   `/soundfonts/{Bank}/{slug}-mp3.js` →
   `https://gleitz.github.io/midi-js-soundfonts/{Bank}/{slug}-mp3.js`.

5. **`soundfontPlayer.ts`** — Shared `AudioContext`; generation counter; parallel patch
   loads; schedule samples for ready patches (pitch→note name, nearest key, velocity→gain,
   play offset); one batched oscillator fallback for **miss channels only** via
   `MidiPreviewPlayer.start(..., { channels })`; `stop()` clears samples + fallback.

6. **`voiceRouter.ts`** — Global engine/bank defaults + per-channel **mix** overrides keyed by
   resolved `TrackScore.channel`. No auto bank-by-name matching; no per-track engine UI in v1.

7. **`scripts/bundle-soundfonts.mjs`** — Downloads a documented FluidR3 **core** instrument
   set (~20–25 patches), writes LICENSE attribution + optional sha256 manifest. CDN-first
   product policy; gitignore `public/soundfonts/**/*.js`. Dev downloads; CI uses `--verify`
   only (no network in `npm run validate`). Shared Tauri offline path: `public/soundfonts/`.

8. **UI** — Global engine + bank controls in the playback bar; existing per-track mix/timbre
   rows remain authoritative for VoiceRouter; pause/scrub calls `SoundfontPlayer.stop()`.

## 3. Data flow

1. Parse MIDI → notes + `sustainEvents` (per track; merged by channel at play time).
2. User picks global engine/bank; VoiceRouter holds mix state.
3. On play: parallel load needed patches; schedule samples; batch oscillator fallback for
   miss channels only (or all channels when engine is oscillator).
4. Sustain: extend scheduled note duration from per-channel pedal windows before
   `AudioBufferSourceNode` stop times.

## 4. Product policy

| Topic | v1 choice |
|---|---|
| Offline packaging | FluidR3 **core subset** only under `public/soundfonts/` |
| MusyngKite / FatBoy | Network (CDN); label in UI |
| Oscillator | Separate engine, not a fake bank name |
| Engine / bank scope | **Global** UI defaults |
| Mixed sample + osc | Channel allowlist on fallback (no double-play) |
| Auto bank match | Deferred |
| Program changes | Deferred |
| CI bundler | `--verify` only; no download in validate |

## 5. Verification

- Unit tests (flat `tests/*.test.ts`): sustain windows + clamp + edge cases; parser CC64
  fixture; JS soundfont parse fixture; loader URL/fallback with mocks; VoiceRouter global
  defaults + mix overrides; player fallback-once / miss-channel filter / mute / sustain /
  stop lifecycle.
- Gate: `npm run validate`.
- Docs: rewrite ARCHITECTURE playback section; CHANGELOG MINOR; split TO_DO; README blurb.

## 6. Implementation plan

See [plans/archive/2026-07-22-soundfont-playback-plan.md](file:///Users/kevingrizzard/MyCode/AudioVisualizer/plans/archive/2026-07-22-soundfont-playback-plan.md)
(weaker-model-ready: full test bodies, class skeletons, URL/GM-slug/HTML snippets).
