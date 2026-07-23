# Design Spec: SoundFont Playback Engine & Asset Bundling

Last reviewed: 2026-07-22
Date: 2026-07-22
Author: Antigravity
Status: approved

## 1. Goal

Provide high-quality, responsive General MIDI SoundFont playback for MIDI scores with automatic soundbank selection, manual per-track overrides, CC64 sustain pedal support, program-change handling, and seamless offline bundling for Tauri desktop releases.

## 2. Architecture & Components

```
                ┌──────────────────────────────────────────────┐
                │             UI / Controls                    │
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
 │ - Program Change handling    │
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
   - Interfaces: `SoundbankConfig`, `InstrumentPatch`, `SoundfontPreset`, `VoiceRouteSettings`, `SustainState`.

2. `src/audio/soundfont/soundfontPatchLoader.ts`
   - Class `SoundfontPatchLoader` managing async loading and caching of instrument sample banks (`AudioBuffer` maps per pitch).
   - Checks local `/soundfonts/<bank>/<instrument>-mp3.js` first (bundled for Tauri/offline).
   - Falls back to CDN (`https://gleitz.github.io/midi-js-soundfonts/...`) if local asset is absent.

3. `src/audio/soundfont/sustainTracker.ts`
   - Deterministic state engine for CC64 (Damper/Sustain Pedal).
   - Holds active note-offs when CC64 >= 64; triggers note releases when CC64 drops <= 63.

4. `src/audio/soundfont/soundfontPlayer.ts`
   - Web Audio player driving sample playback via `AudioBufferSourceNode`.
   - Integrates velocity gain scaling, pitch adjustments, ADSR release envelopes, sustain tracking, and mid-track Program Change handling.

5. `src/audio/soundfont/voiceRouter.ts`
   - Inspects parsed track metadata (`program`, `track.name`) to perform automatic best-match soundbank assignment per track.
   - Exposes manual override settings (Soundbank choice, timbre fallback, mute, solo, gain).
   - Seamlessly delegates playback to `MidiPreviewPlayer` (oscillator synth) if a soundfont patch is downloading or unavailable.

6. `scripts/bundle-soundfonts.mjs` & `public/soundfonts/`
   - Node script to download/package freely available open-source soundbanks (FluidR3_GM, MusyngKite, TimGM6mb) into `public/soundfonts/` for offline/Tauri bundling.

7. `src/ui/audioControls.ts`
   - UI components for soundbank preset dropdown, loading indicators, and per-voice instrument routing.

8. `dev-docs/TO_DO.md`
   - Updates soundfont task status and adds a tracked backlog item for **Deterministic WAV Audio Export**.

## 3. Data Flow & Execution

1. **Score Loading:** When a MIDI file is parsed into a `Score`, `VoiceRouter` inspects `track.program` and `track.name` to compute initial voice routing rules (Option C automatic best-match).
2. **Patch Fetching:** `SoundfontPatchLoader` fetches required instrument patches in the background without blocking the UI or score visualization.
3. **Playback Scheduling:** On play, `SoundfontPlayer` schedules note events. If a track's soundfont patch is ready, it plays sample audio; if still fetching, `MidiPreviewPlayer` plays oscillator tones.
4. **Sustain & Controls:** CC64 events update `SustainTracker` dynamically. User changes in the UI update `VoiceRouter` live.

## 4. Verification & Testing Strategy

- Unit Tests (`tests/audio/soundfont.test.ts`):
  - Test `VoiceRouter` auto-matching logic and fallback behavior.
  - Test `SustainTracker` CC64 press, sustain hold, and pedal release handling.
  - Test `SoundfontPatchLoader` asset URL resolution (local vs CDN fallback).
- Validation Gate: `npm run validate` (TypeScript type check, Vitest unit tests, and production build).
