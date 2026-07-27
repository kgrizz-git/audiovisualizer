# Plan: General MIDI Routing Completion

Last reviewed: 2026-07-26
Date: 2026-07-24
Author: Codex (revised after parser/router audit)
Status: draft
Linked issue/PR: n/a
SemVer impact: **MINOR**
- **Fixed:** `SoundfontPlayer` keys patches by `(channel, program)` so multi-program
  channels (after `@tonejs/midi` `splitTracks`) no longer collide.
- **Added:** channel-10 percussion via a bundled FluidR3 Standard drum kit.
- No breaking changes to the visual mapper or to single-program MIDI playback.

Prereq for: **Full SF2 synth engine** (`dev-docs/TO_DO.md`). This plan defines the
routing contract (`TrackScore.isPercussion`, `patchByChannelProgram`,
`loadDrumKitPatch` / `drumkit-standard`) that the SF2 engine slots into. Other
bank-128 drum-kit variants, per-track engine/bank UI, and remaining edge cases
are first-class deliverables of the SF2 plan — see Out of scope.

## Goal

1. Fix the channel-collision bug in `SoundfontPlayer`.
2. Detect GM channel 10 (zero-indexed channel 9) and play it through a **bundled
   FluidR3 bank-128 Standard drum kit** (community midi-js-compat `*-mp3.js`,
   same format the melodic loader already parses).

Routing only, plus the single Standard kit. MIDI Type-0 channel separation is
already handled by `@tonejs/midi`'s `splitTracks`.

## Why this plan, why now

Two latent routing bugs remain after the 2026-07-25 envelope/looping PATCH:

### 1. Multi-program channels collide in the player

`@tonejs/midi`'s `Midi` constructor runs `splitTracks()` (`Midi.ts:69`,
`Midi.ts:185–227`), which splits each source track by `(program, channel)`
(`trackMap` key `` `${program} ${channel}` ``). A piano→organ change on channel 0
arrives as **two** `Track` objects, both `channel === 0`, with
`instrument.number` 0 and 19 respectively. Our parser emits two `TrackScore`s;
the visualizer / voice filter / voice rows already treat them as separate voices.

**The bug is only in `SoundfontPlayer`.** It keys patches by channel alone
(`patchByChannel` at `soundfontPlayer.ts:119`, filled from the
`` `${bank}:${program}` `` unique map at lines 100–125). Two split-tracks on
channel 0 collapse to whichever patch wins iteration order; the other's notes
cross-render through the wrong timbre.

`Track` does not keep raw events after construction, so a parser-side program-
change timeline is neither needed nor implementable. Rely on `splitTracks` and
fix the player key.

### 2. Channel-10 percussion is silently wrong

`SoundfontPatchLoader.loadPatch` always resolves a **melodic** GM slug. Gleitz
`FluidR3_GM` ships bank 0 only (no percussion in `names.json`). Channel-10 notes
with program 0 play acoustic grand piano; the oscillator fallback is also
chromatic melodic. (Gleitz `Tabla` is a single Indian instrument, not a GM kit.)

FluidR3.sf2 itself has bank 128 with eight kits; only the gleitz pre-render omits
them. Community extraction
[`henrikvilhelmberglund/midi-js-compat-soundfonts`](https://github.com/henrikvilhelmberglund/midi-js-compat-soundfonts)
ships `FluidR3_GM/drumkits/Standard-mp3.js` (~5.7 MB, MIDI keys 27–87 continuous,
same `*-mp3.js` format). Other seven kits stay deferred to the SF2 plan.

**Quirk:** the file tags itself `MIDI.Soundfont.marimba` (mis-label). Re-key the
patch to `slug: 'drumkit-standard'` so it does not collide with melodic
`loadPatch(FluidR3_GM, 13)` in the in-memory cache.

**CDN note (verified 2026-07-26):**  
`https://henrikvilhelmberglund.github.io/midi-js-compat-soundfonts/.../Standard-mp3.js`
**301-redirects** to  
`https://henrikvilhelmberglund.com/midi-js-compat-soundfonts/GM-soundfonts/FluidR3_GM/drumkits/Standard-mp3.js`.  
Use the **canonical `.com` URL** (or `raw.githubusercontent.com/.../gh-pages/...`
for the bundler) — do not hard-depend on the github.io host remaining stable.

## Out of scope

- Per-track engine / bank / drum-kit-variant UI and loader (SF2 plan).
- The other seven FluidR3 bank-128 kits (Room, Power, Electronic, TR-808, Jazz,
  Brush, Orchestra) — SF2 plan loads them from FluidR3.sf2.
- Re-assembling original Type-0 track topology (not required for these bugs).
- Notation / percussion staff rendering.
- Offline WAV export / audio transcription.
- Per-note pitch-bend / CC beyond CC64 (already handled).
- Per-split-track program-override scoping (channel-wide override UX stays as today).

## Approach

### Decision 1 — Fix player patch keying; no parser program-change timeline

Replace `patchByChannel: Map<number, InstrumentPatch>` with  
**`patchByChannelProgram: Map<`${channel}:${program}`, InstrumentPatch>`**.

**Lookup must use the resolved program**, not raw `track.program`:

```ts
const program = opts.router.resolveTrackSettings(track).program;
patchByChannelProgram.get(`${track.channel}:${program}`);
```

Load path already uses `resolveTrackSettings(track).program`. If lookup used
`track.program` while a channel override remaps to another program, the map write
and read would disagree and notes would go silent after an override. Keep
`VoiceRouter.programs` channel-keyed as today (override applies to every
split-track on that channel).

Do **not** introduce `ProgramChangeEvent`, `TrackScore.programChanges`, or
`NoteEvent.effectiveProgram`.

### Decision 2 — Channel-10 flag on `TrackScore`

Add required `isPercussion: boolean` (`track.channel === 9` after the existing
`track.channel ?? trackIdx` assignment). Router / players / UI branch on the flag,
not magic numbers. Document in JSDoc: MIDI channel 10 ≡ zero-indexed 9.

GM says channel 10 is always percussion regardless of program — flagging
channel 9 as percussion is correct even for a non-bank-128 program on that
channel.

`generateDemoScore()` and all hand-built test `TrackScore` fixtures must set
`isPercussion: false` (or `true` for channel-9 fixtures). Do **not** leave the
field optional “for backward compat” — that fights TypeScript and hides misses.

### Decision 3 — Bundled Standard drum kit for channel 10

- New `src/audio/soundfont/drumkitLoader.ts` → `loadDrumKitPatch()`:
  1. Local `/soundfonts/FluidR3_GM/percussion/Standard-mp3.js`
  2. Canonical CDN `https://henrikvilhelmberglund.com/midi-js-compat-soundfonts/GM-soundfonts/FluidR3_GM/drumkits/Standard-mp3.js`
  3. Parse with `looksLikeSoundfontScript` + `parseMidiJsSoundfontScript` + existing
     `AudioDecoder`. Cache in-memory as `FluidR3_GM:drumkit-standard`;
     `InstrumentPatch = { bank: 'FluidR3_GM', program: 0, slug: 'drumkit-standard', buffers }`
     (`program` unused for routing; slug is the identity).
  4. CacheStorage key = the CDN URL used for the fetch (new URL → no melodic
     collision, no `soundfonts-v1` version bump).
  5. No goldst loop JSON (one-shots).

- **Percussion scheduling (locked):** reuse `scheduleSample` path but with a
  percussion mode:
  - Prefer **exact** `midiNoteName(note.pitch)` buffer; if missing, skip the note
    (do not pitch-shift a neighboring drum via `nearestSampleKey` +
    `playbackRate`).
  - Always `playbackRate = 1` for drum hits.
  - Kit covers MIDI 27–87 with no gaps (verified), so GM drums 35–81 hit exact keys.

- **Oscillator carve-out (locked):** today's early return
  (`soundfontPlayer.ts:86–89`) delegates the whole score to `MidiPreviewPlayer`
  when `engine === 'oscillator'`. Change to:
  1. Melodic tracks → `MidiPreviewPlayer` (existing oscillator path).
  2. Percussion tracks → always drum-kit sample path (channel 10 has no melodic
     program to oscillate).
  Never put channel-10 into the oscillator / melodic-fallback path.

- **Melodic miss fallback must be track-scoped (gap fix):** today
  `missChannels: number[]` is wrong once two programs share a channel — if piano
  loads and organ fails on channel 0, putting `0` in `missChannels` would
  oscillator-double the piano notes. Change fallback options to accept the
  specific miss **tracks** (e.g. `{ tracks?: TrackScore[] }`), and update
  `MidiPreviewPlayer` / `selectAudibleTracks` accordingly. Percussion tracks are
  never miss-tracks; if the drum kit fails, status is `'drumkit-missing'` and
  those notes stay silent (one `console.warn` per failed load).

- Status map stays channel-keyed for UI badges. For a melodic channel:
  `'loaded'` if every audible non-percussion split-track on that channel has a
  patch; otherwise `'fallback'` when any miss-track on that channel is handed to
  the oscillator. Channel 9: `'drumkit'` or `'drumkit-missing'`.

- Extend `scripts/bundle-soundfonts.mjs` to download `Standard-mp3.js` into
  `public/soundfonts/FluidR3_GM/percussion/` (already gitignored under
  `/public/soundfonts/**`), with sha256 manifest entry. Prefer
  `raw.githubusercontent.com/.../gh-pages/.../Standard-mp3.js` as the bundler
  source URL for stable CI.

Channel-10 notes remain in the score for visuals; routing affects playback only.

### Decision 4 — UI: percussion row without melodic picker

In `buildAudioVoiceRow`, when `context.isPercussion?.(track)`:

- Read-only **"Drum kit · FluidR3 Standard"** label + `'drumkit'` /
  `'drumkit-missing'` badge.
- No melodic `<select>` / no `onProgramChange`.
- Keep mute / solo / gain (still channel-keyed — same as today).

Melodic rows unchanged. Channel-wide program override UX is unchanged (documented
limitation).

## Proposed file changes

```
src/core/types.ts                       — TrackScore.isPercussion: boolean (required)
src/core/midi/parser.ts                 — set isPercussion = (channel === 9); demo score sets false
src/audio/soundfont/voiceRouter.ts      — resolveTrackSettings returns isPercussion
src/audio/soundfont/soundfontPlayer.ts  — patchByChannelProgram; drum-kit branch;
                                          oscillator carve-out; track-scoped miss fallback
src/audio/soundfont/soundfontTypes.ts   — PatchStatus += 'drumkit' | 'drumkit-missing'
src/audio/soundfont/drumkitLoader.ts    — NEW: loadDrumKitPatch (local → CDN)
src/audio/midiPreviewPlayer.ts          — skip isPercussion; accept miss tracks (not only channels)
src/ui/voiceOptionsUI.ts                — percussion row + new badge texts
src/ui/app.ts                           — pass isPercussion into voice row context
tests/parser.test.ts                    — isPercussion true/false; fixtures updated
tests/voiceRouter.test.ts               — isPercussion from resolveTrackSettings
tests/soundfontPlayer.test.ts           — collision regression; drum route; oscillator carve-out;
                                          drumkit-missing; track-scoped miss fallback
tests/drumkitLoader.test.ts             — NEW: parse, re-key slug, cache isolation, fallback
tests/voiceOptionsUI.test.ts            — percussion row; no onProgramChange
tests/midiPreview.test.ts               — selectAudibleTracks skips percussion / track filter
scripts/bundle-soundfonts.mjs           — Standard-mp3.js → percussion/; manifest
ARCHITECTURE.md / README.md / CHANGELOG.md — contracts, matrix, Unreleased notes
```

Hand-built `TrackScore` literals across tests must add `isPercussion: false`
(mapper, sustain, SVG, etc.) — mechanical, required for typecheck.

`gmLoopSlugs.ts` untouched.

## Phases & checklist

### Phase 0: Decisions (done)

- [x] Confirm `splitTracks` keys by `(program, channel)` and
      `Track.instrument.number` is accurate per split-track (`Instrument.ts:33–39`).
- [x] Confirm gleitz FluidR3_GM has no percussion entry; Tabla is not a GM kit.
- [x] Confirm community Standard kit parses as midi-js script, slug `marimba`,
      ~5.7 MB, keys MIDI 27–87; canonical CDN is `.com` after github.io 301.

### Phase 1: Parser — `isPercussion`

- [ ] Add required `TrackScore.isPercussion` with JSDoc (channel 10 ≡ index 9).
- [ ] Set `isPercussion = (channel === 9)` in `parseMidiData` after channel
      resolution. Leave `channel ?? trackIdx` fallback as-is (hygiene later).
- [ ] Set `isPercussion: false` on both tracks in `generateDemoScore()`.
- [ ] Tests: channel-9 → true, channel-0 → false; update fixtures project-wide
      so `tsc` / Vitest pass.

### Phase 2: Routing + drum kit + track-scoped fallback

- [ ] Add `'drumkit' | 'drumkit-missing'` to `PatchStatus`.
- [ ] Implement `drumkitLoader.ts` per Decision 3 (local → canonical CDN;
      re-key slug; CacheStorage by CDN URL).
- [ ] `SoundfontPlayer.start`:
  - Oscillator carve-out (melodic → preview player; percussion → drum kit).
  - `patchByChannelProgram` keyed `` `${channel}:${resolvedProgram}` ``.
  - Load drum kit once for any audible percussion track.
  - Percussion schedule: exact key, `playbackRate = 1`, never melodic fallback.
  - Melodic misses: pass **miss tracks** into `MidiPreviewPlayer`, not bare
    channel lists that would double-schedule loaded split-tracks.
  - Drum-kit null → `'drumkit-missing'`, silent channel-10, one warn.
- [ ] `MidiPreviewPlayer` / `selectAudibleTracks`: skip `isPercussion`; support
      track-scoped filter for miss playback.
- [ ] `VoiceRouter.resolveTrackSettings` returns `isPercussion`.
- [ ] Tests covering Decision 1 collision, drum routing, oscillator carve-out,
      drumkit-missing isolation, and “piano loads / organ misses on same channel
      → only organ notes fall back to oscillator.”

### Phase 3: UI

- [ ] Percussion row: read-only drum label; badges for `'drumkit'` /
      `'drumkit-missing'`; mute/solo/gain kept.
- [ ] `app.ts` passes `isPercussion: (t) => t.isPercussion`.
- [ ] Tests: percussion row has no `onProgramChange`; melodic row unchanged.

### Phase 4: Bundler, docs, changelog, validate

- [ ] Bundler downloads Standard kit into
      `public/soundfonts/FluidR3_GM/percussion/`; sha256 in manifest; `--verify`
      accepts it. Prefer raw.githubusercontent.com as download source.
- [ ] ARCHITECTURE.md: `isPercussion`, `patchByChannelProgram`,
      `loadDrumKitPatch` / `drumkit-standard`, statuses, oscillator carve-out,
      track-scoped miss fallback, zero-indexed channel-10. Note Type-0 is already
      handled by `splitTracks`.
- [ ] README.md: channel-10 via Standard kit; other kits → SF2 plan; multi-program
      channels load distinct patches. Attribute FluidR3 (CC-BY 3.0) for the bundled
      drum kit alongside existing soundfont attribution.
- [ ] CHANGELOG.md Unreleased: **Fixed** channel-collision; **Added** channel-10
      Standard kit. SemVer MINOR.
- [ ] After merge: remove this item from `dev-docs/TO_DO.md` (SF2 item remains).

## Verification

- [ ] Parser: channel 9 `isPercussion === true`; others false; demo score typed.
- [ ] Router returns `isPercussion`.
- [ ] Collision regression: two TracksScores, channel 0, programs 0 and 19 → two
      `loadPatch` calls and correct per-track scheduling.
- [ ] Override: `setProgram(0, 40)` → both split-tracks load/lookup program 40
      via resolved program (no silent miss).
- [ ] Partial miss: program 0 loads, program 19 null on same channel → only the
      program-19 track goes to oscillator; piano notes are not doubled.
- [ ] Drum loader: parse, `drumkit-standard` slug, no melodic-marimba cache clash,
      local→CDN, SPA rejection.
- [ ] Player: channel 9 → `loadDrumKitPatch` only; `'drumkit'` status; oscillator
      engine still plays drums via kit; null kit → `'drumkit-missing'`.
- [ ] UI: drum label; no `onProgramChange` on channel 9.
- [ ] Bundler `--verify` ok.
- [ ] Manual smoke:
  - Mid-track program change audibly switches timbre.
  - Existing `public/demo-midi/house_four_on_floor_style.mid` (already has
    channel-9 drums) plays melodic samples + recognizable kit hits — not piano
    masquerading as drums.
  - Optional generated `multi_program_channel.mid` /
    `mixed_piano_drums.mid` via `scripts/generate_demo_midis.js` if useful.
  - Delete local `Standard-mp3.js` → `'drumkit-missing'` badge; restore via
    `npm run bundle:soundfonts`.
- [ ] `npm run validate` passes.

### Test data

- Prefer synthetic in-memory scores / existing demos; no copyrighted MIDI downloads.
- `house_four_on_floor_style.mid` is enough for channel-10 manual smoke.
- Unit tests stub `AudioDecoder` (no real MP3 decode), same as
  `soundfontPlayer.test.ts`.

## Known limitations (hand-off to SF2 / follow-ups)

1. Only Standard kit ships; seven variants + variant `<select>` → SF2 plan.
2. No per-track engine/bank selection.
3. Channel-wide program override still applies to all split-tracks on that channel.
4. Mix / mute / solo / voice-filter remain channel-keyed — two UI rows that share a
   channel share mix state (pre-existing `splitTracks` UX).
5. Community CDN is a second upstream; local bundle is the offline source of truth.
   SF2 plan drops the midi-js drum extraction entirely.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `splitTracks` behavior changes | low | high | Lockfile pins `@tonejs/midi@2.0.28`; collision regression test fails fast |
| Community host / redirect changes | med | med | Bundler writes local copy; use `.com` or raw.githubusercontent URL; sha256 in manifest |
| `marimba` slug cache collision | high | high | Re-key to `drumkit-standard`; assert in `drumkitLoader.test.ts` |
| Channel-keyed miss fallback doubles notes | high | high | Track-scoped miss list (Decision 3); dedicated test |
| Drum pitch-shift via `nearestSampleKey` | med | med | Exact key + `playbackRate = 1` for percussion |
| Override vs `track.program` lookup mismatch | high | high | Always key/lookup with `resolveTrackSettings().program` |
| Bundle size +5.7 MB | low | low | Within existing 20–30 MB budget; only Standard |

## Implementation notes for agents

1. Mark checklist items done only after tests confirm the behavior.
2. Preserve contract names for the SF2 plan: `isPercussion`,
   `patchByChannelProgram`, `loadDrumKitPatch`, `drumkit-standard`,
   `'drumkit'`, `'drumkit-missing'`.
3. Do not edit tests solely to force green; report real product failures.
4. Update ARCHITECTURE for the new domain field and loader boundary only — do not
   change the visual mapper contract.
5. Do not introduce parser-side program-change timelines.

## Completion checklist

When all phases and verification are done:

- [ ] Status → `complete` with completion date
- [ ] Move plan to `plans/archive/`
- [ ] CHANGELOG.md Unreleased entry present
- [ ] Remove completed item from `dev-docs/TO_DO.md`
