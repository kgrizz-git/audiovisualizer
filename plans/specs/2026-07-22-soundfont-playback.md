# Design Spec: SoundFont Playback Engine & Asset Bundling

Last reviewed: 2026-07-22
Date: 2026-07-22
Author: Antigravity
Status: approved (revised for implementation accuracy)

## 1. Goal

Provide high-quality, responsive General MIDI SoundFont playback for MIDI scores with automatic soundbank selection, manual per-track overrides, CC64 sustain pedal support, program-change handling, and seamless offline bundling for Tauri desktop releases.

## 2. Architecture & Components

```
                ┌──────────────────────────────────────────────┐
                │             UI / Controls (src/ui/app.ts)    │
                │  (Soundbank Selector, Track Voice Overrides) │
                └──────────────────────┬───────────────────────┘
                                       │
                                       ▼
 ┌──────────────────────────────────────────────────────────────────────────┐
 │                            VoiceRouter                                   │
 │ - Evaluates track metadata (program #, track name) -> Auto soundbank     │
 │ - Manages per-track manual overrides & volume/mute/solo                  │
 └──────────────┬───────────────────────────────────────────┬───────────────┘
                │                                           │
                ▼ (Patch loaded)                            ▼ (Patch loading/missing)
 ┌──────────────────────────────┐            ┌──────────────────────────────┐
 │       SoundfontPlayer        │            │      MidiPreviewPlayer       │
 │ - AudioBuffer sample playback│            │ - Basic Web Audio oscillator │
 │ - Velocity gain curves       │            │   synth (seamless fallback)  │
 │ - CC64 SustainTracker        │            └──────────────────────────────┘
 │ - TrackScore integration     │
 └──────────────┬───────────────┘
                │
                ▼
 ┌──────────────────────────────┐
 │     SoundfontPatchLoader     │
 │ 1. Tries local asset:        │
 │    public/soundfonts/<bank>/ │
 │ 2. Falls back to CDN:        │
 │    gleitz soundfonts CDN     │
 └──────────────────────────────┘
```

### Component Breakdown

1. `src/audio/soundfont/soundfontTypes.ts`
   - Interfaces: `SoundbankPreset` (`'FluidR3_GM' | 'MusyngKite' | 'FatBoy' | 'BasicSynth'`), `InstrumentPatch`, `VoiceRouteSettings`, `ActiveSustainedNote`.

2. `src/core/types.ts` & `src/core/midi/parser.ts`
   - Extends `TrackScore` with optional `sustainEvents?: { time: number; value: number }[]` extracted from `@tonejs/midi` CC64 events.

3. `src/audio/soundfont/soundfontPatchLoader.ts`
   - Class `SoundfontPatchLoader` managing async loading and caching of instrument sample banks (`AudioBuffer` maps per pitch).
   - Correctly maps MIDI program 24 to `acoustic_guitar_nylon`.
   - Checks local `/soundfonts/<bank>/<instrument>-mp3.js` first (bundled for Tauri/offline).
   - Falls back to CDN (`https://gleitz.github.io/midi-js-soundfonts/...`) if local asset is absent.

4. `src/audio/soundfont/sustainTracker.ts`
   - Deterministic state engine for CC64 (Damper/Sustain Pedal).
   - Holds active note-offs when CC64 >= 64; triggers note releases when CC64 drops <= 63.

5. `src/audio/soundfont/soundfontPlayer.ts`
   - Web Audio player driving sample playback via `AudioBufferSourceNode`.
   - Integrates velocity gain scaling, pitch adjustments, ADSR release envelopes, sustain tracking, and `VoiceRouter` mute/solo/gain settings.
   - Batches missing patches to trigger fallback `MidiPreviewPlayer` once without stopping active tracks.

6. `src/audio/soundfont/voiceRouter.ts`
   - Operates on `TrackScore` domain objects (`name`, `channel`, `program`, `instrumentName`, `notes`).
   - Inspects parsed track metadata (`program`, `name`) to perform automatic best-match soundbank assignment per track.
   - Exposes manual override settings (Soundbank choice, timbre fallback, mute, solo, gain).

7. `scripts/bundle-soundfonts.mjs` & `public/soundfonts/`
   - Node script to download and package core General MIDI instrument patches (for `FluidR3_GM`) into `public/soundfonts/` for offline/Tauri bundling, including CC BY 3.0 license attribution.

8. `src/ui/app.ts` & `index.html`
   - UI components for soundbank preset dropdown in playback controls, loading state indicators, and soundfont playback wiring.

9. `ARCHITECTURE.md` & `dev-docs/TO_DO.md`
   - Updates architecture documentation for SoundFont playback and updates backlog status.

## 3. Data Flow & Execution

1. **Score Loading:** When a MIDI file is parsed into a `Score`, `parser.ts` extracts note events and CC64 sustain pedal events. `VoiceRouter` inspects `track.program` and `track.name` to compute initial voice routing rules.
2. **Patch Fetching:** `SoundfontPatchLoader` fetches required instrument patches in the background without blocking the UI or score visualization.
3. **Playback Scheduling:** On play, `SoundfontPlayer` schedules note events and applies CC64 sustain pedal logic. If a track's soundfont patch is ready, it plays sample audio; if still fetching or unready, `MidiPreviewPlayer` plays fallback oscillator tones in a single batch pass.
4. **Sustain & Controls:** CC64 events update `SustainTracker` dynamically. User changes in the UI update `VoiceRouter` live.

## 4. Verification & Testing Strategy

- Unit Tests:
  - `tests/audio/sustainTracker.test.ts`: Test `SustainTracker` CC64 press, sustain hold, and pedal release handling.
  - `tests/audio/soundfontPatchLoader.test.ts`: Test asset URL resolution (local vs CDN fallback) and program slug mapping with mock Web Audio.
  - `tests/audio/voiceRouter.test.ts`: Test `VoiceRouter` auto-matching logic and `TrackScore` override behavior.
  - `tests/audio/soundfontPlayer.test.ts`: Test `SoundfontPlayer` instantiation and playback lifecycle.
  - `tests/core/midiParser.test.ts`: Test CC64 extraction during MIDI parsing.
- Validation Gate: `npm run validate` (TypeScript type check, Vitest unit tests, and production build).
