# SoundFont & Voice Timbre Controls Design Spec

Date: 2026-07-23  
Status: Approved

## Problem Statement
1. The sidebar "Mix / timbre" section currently hardcodes synth oscillator waveforms (`sine`, `triangle`, `sawtooth`, `square`) for every track, even when the playback engine is set to "Sample SoundFont".
2. Users cannot view or reassign SoundFont instruments per track.
3. SoundFont loading failures or missing patches silently fall back to synth oscillators without clear feedback, creating the impression that SoundFont playback is never used.
4. Downloaded CDN soundfonts are only stored in memory for the current session, requiring re-downloading on page refresh.

## Proposed Solution

### 1. Dynamic Per-Voice Instrument & Timbre Controls
In `src/ui/app.ts`, the voice control rows under Section 03 ("Mix / timbre") dynamically adapt to the active `PlaybackEngine`:

* **Sample SoundFont Mode (`engine === 'sample'`)**:
  * Dropdown presents General MIDI instrument choices (e.g. *Acoustic Grand Piano*, *Electric Bass*, *Violin*, *Flute*, *Trumpet*, etc.), defaulting to the track's program.
  * Selecting an instrument updates the track's General MIDI program number in `VoiceRouter` and triggers a patch load.
  * A badge on each row indicates patch status:
    * `✓ Loaded` (sample ready in local bundle or cache)
    * `⏳ Loading...` (fetching patch script)
    * `⚡ Synth Fallback` (patch unavailable, using oscillator fallback)
* **Oscillator Synth Mode (`engine === 'oscillator'`)**:
  * Dropdown presents synth waveforms (`sine`, `triangle`, `sawtooth`, `square`).
  * Selecting a waveform updates `VoicePlaybackSettings.timbre` for that track.

### 2. Synchronized Controls
* Changing the global **Engine** (`Sample SoundFont` ↔ `Oscillator synth`) in the playback bar immediately updates the per-track voice controls between SoundFont instrument selection and Synth waveform selection.
* Changing the **SoundBank** (`FluidR3_GM`, `MusyngKite`, `FatBoy`) triggers patch re-evaluation and updates patch loading badges.

### 3. Persistent SoundFont Cache
* Update `SoundfontPatchLoader` (`src/audio/soundfont/soundfontPatchLoader.ts`) to cache fetched soundfont scripts in the browser's Cache API (`soundfonts-v1` cache).
* Any CDN soundfont fetched during a session persists across reloads and offline use.

### 4. Transparent Playback Status
* `SoundfontPlayer` reports patch load counts and fallbacks to the UI status bar during playback:
  * e.g. *"Playing with SoundFont (2/2 patches loaded)"*
  * e.g. *"Playing (1 track using synth fallback)"*

## Verification Strategy
1. **Unit Tests**:
   * Test `VoiceRouter` program re-assignment per track.
   * Test `SoundfontPatchLoader` cache integration.
   * Test `SoundfontPlayer` load state reporting.
2. **Visual & Interactive Verification**:
   * Verify sidebar voice rows switch controls dynamically when engine toggles.
   * Verify selecting SoundFont instruments changes the program number and patch playback.
   * Run `npm run validate` to pass type checking, tests, and Vite production build.
