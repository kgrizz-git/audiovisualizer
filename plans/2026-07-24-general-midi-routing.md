# Plan: General MIDI Routing Completion

Last reviewed: 2026-07-26
Date: 2026-07-24
Author: Codex
Status: draft (revised 2026-07-26 after parser/router audit)
Linked issue/PR: n/a
SemVer impact: **MINOR** (new mid-track program-change routing + channel-10
percussion via a bundled FluidR3 Standard drum kit; no breaking changes to visual
mapper or existing MIDI playback)
Prereq for: **Full SF2 synth engine plan** (`dev-docs/TO_DO.md`). This plan defines the
routing contract (`NoteEvent.effectiveProgram`, `TrackScore.isPercussion`, per-note
patch resolution, drum-kit loader shape) that the SF2 engine plan then slots a
real synth into. Multiple drum-kit variants (Room/Power/Electronic/TR-808/Jazz/
Brush/Orchestra), per-track engine/bank UI, and MIDI Type-0 split are *first-class
deliverables of the SF2 engine plan*, not this plan — see "Out of scope" below.

## Goal

Complete practical, deterministic General MIDI *routing*: honor mid-track program
changes inside a MIDI track, detect channel-10 percussion correctly per MIDI spec,
and play channel-10 notes through a **bundled FluidR3 bank-128 Standard drum kit**
loaded from a community midi-js-compat soundfont (same `*-mp3.js` format the
existing melodic loader already parses).

This is a routing-only plan plus the single Standard drum kit. It does **not**
deliver the other seven bank-128 drum-kit variants, per-track engine/bank
selection, or MIDI Type-0 split — those are explicitly deferred to the SF2 engine
plan (see "Out of scope").

## Why this plan, why now

The 2026-07-25 envelope/looping PATCH shipped against the *current* midi-js engine
without touching routing. Two latent routing bugs remain and are bigger than bullets:

1. **Mid-track program changes are silently dropped.** `@tonejs/midi` exposes only
   the **first** programChange in a track as `track.instrument.number`
   (`node_modules/@tonejs/midi/src/Instrument.ts:33-39`); any subsequent program
   change on the same channel is never surfaced. The current `SoundfontPlayer`
   loads one patch per `(bank, program)` pair at startup from
   `resolveTrackSettings(track).program` (`src/audio/soundfont/soundfontPlayer.ts:103-115`)
   and plays every note on that track through that single patch regardless of any
   later program change. Result: a MIDI that switches from piano to organ at bar 16
   plays the whole track as piano.

2. **Channel-10 percussion is silently wrong.** `SoundfontPatchLoader.loadPatch`
   always calls `getInstrumentSlug(program)`
   (`src/audio/soundfont/soundfontPatchLoader.ts:56-58`) — a **melodic** GM slug.
   The gleitz midi-js-soundfonts bundle we consume ships only bank 0 (melodic)
   from FluidR3_GM: `FluidR3_GM/names.json` lists 128 melodic slugs, no
   `percussion` entry. The source `FluidR3_GM.sf2` itself **does** contain bank 128
   with multiple drum kits (Standard/Room/Power/Electronic/TR-808/Jazz/Brush/
   Orchestra), but the gleitz pre-render extraction did not include them — making
   this a gap in the *midi-js bundle*, not in FluidR3 itself. Today a note on
   channel 10 with `program 0` plays the **acoustic grand piano** sample; the
   oscillator fallback (`MidiPreviewPlayer.schedule` at
   `src/audio/midiPreviewPlayer.ts:95-106`) is also pitched sine/triangle/etc. keyed
   off note pitch — chromatic melodic notes, not drum hits. (The `Tabla` bank in
   the gleitz repo is a single 4 MB Indian percussion instrument, not a GM drum
   kit, so it's not usable as a channel-10 fallback.)

A community midi-js-compat extraction fixes this cheaply:
`henrikvilhelmberglund/midi-js-compat-soundfonts` ships
`FluidR3_GM/drumkits/Standard-mp3.js` — ~5.7 MB, note keys spanning MIDI 34–84
(the GM drum range 35–81), in the **exact same** `*-mp3.js` data-URI script format
our `parseMidiJsSoundfontScript`
(`src/audio/soundfont/soundfontPatchLoader.ts:32-39`) already consumes. So the
Standard drum kit can be loaded with the existing loader/parsers and the existing
`AudioDecoder`: no synthesized perc fallback, no format rewrite, no throwaway
pipeline the SF2 engine would replace. The other seven bank-128 variants stay
deferred to the SF2 engine plan (where they come "free" from a single FluidR3.sf2
via SpessaSynth / FluidSynth WASM).

Note one quirk the loader must handle: the Standard kit file is internally tagged
with the slug `marimba` (a mis-label in the FluidR3 source extraction), not
`drumkit-standard`. The melodic `loadPatch(FluidR3_GM, 13)` also produces a
marimba-named patch. So we key the drum-kit patch under a stable internal id
(`drumkit-standard`) in `InstrumentPatch.slug` to avoid colliding with the melodic
marimba patch in the patch cache.

## Out of scope

- **Per-track engine/bank selection UI and loader.** The current draft's "Phase 2"
  bullet scopes this, but the actual work is much larger than one bullet — it
  changes the unique-patch map in `SoundfontPlayer` to be per-track, grows bundle
  size, requires per-bank prefetch affordance, and needs a new bank `<select>` row
  in `voiceOptionsUI`. Promoted to its own follow-up plan; do **not** sneak it in
  here. (Channel-10 drum-kit *variant* selection is part of this same follow-up.)
- **The other seven FluidR3 bank-128 drum-kit variants** (Room / Power /
  Electronic / TR-808 / Jazz / Brush / Orchestra). The Standard kit ships here; the
  remaining seven ship with the SF2 engine plan because FluidR3.sf2 carries them
  all natively and SpessaSynth / FluidSynth WASM exposes them as one-file assets
  rather than seven separate midi-js-compat extractions. A per-track "drum-kit
  variant" `<select>` ships with the SF2 engine plan (analogous to the per-track
  bank control bullet above).
- **MIDI Type-0 split-by-channel.** `@tonejs/midi` keeps `track.channel` as a single
  value per MIDI track (set to the channel of the **last** noteOn in that track,
  `node_modules/@tonejs/midi/src/Track.ts:79-94`). A Type-0 MIDI file carries all 16
  channels in one MIDI track, so its parsed `TrackScore` collapses to one channel.
  Splitting it correctly is a parser rewrite and is deferred. This plan documents
  the limitation and plays the file as-is (the per-note routing still works for notes
  that carry their channel in the raw events we walk — see Phase 1).
- Rendering a notation/percussion staff.
- Offline WAV export and audio transcription.
- Per-note pitch-bend / CC beyond CC64 (already handled).

## Approach

Five locked decisions drive the implementation:

### Decision 1 — Extract program changes by walking raw MIDI events

The normalized `Track.instrument.number` is unusable for mid-track routing. We walk
the **raw event array** that `@tonejs/midi` carries internally
(`midi.tracks[i]` of raw events; verified to be present on each parsed `Track`)
once per parse and build a per-track program-change timeline
`(absoluteTimeSeconds, programNumber)[]`. The timeline is exposed on `TrackScore`
as a new optional field `programChanges?: ProgramChangeEvent[]`, sorted by time.
`ProgramChangeEvent` lives in `src/core/types.ts`. The parser stays side-effect
free and deterministic — no `Midi` constructor reuse, no extra pass.

Fallback when no program-change events exist: the timeline is empty and
`effectiveProgram === track.program` for every note (today's behavior).

### Decision 2 — Pre-bake per-note `effectiveProgram` onto `NoteEvent` (not in the scheduler)

The scheduler and `VoiceRouter` today are keyed by **channel**
(`voiceRouter.ts:9,27-33`; `voicePlayback` Map in `app.ts:57,261`; the `voiceFilter`
in `scoreMapper.ts:78,105,158`). A channel can carry multiple mid-track program
changes, so per-channel scheduling state is the wrong shape for routing. We avoid
touching the channel-keyed surface by writing the resolved program onto each note
at *parse* time:

- New optional field on `NoteEvent.effectiveProgram?: number` (`src/core/types.ts`),
  set by `parseMidiData` for every note using the per-track program-change timeline.
  Absent when the source has no program changes (callers fall back to
  `track.program`).
- `VoiceRouter.resolveTrackSettings(track, voiceIndex)` and the players read
  `note.effectiveProgram ?? track.program` instead of `track.program` directly when
  loading a patch for a note.
- `SoundfontPlayer` must load **more than one patch per channel** when a track has
  mid-track program changes. It still keys `patchByChannel` by channel for
  status/mute purposes, but adds a `patchByChannelProgram: Map<`${channel}:${program}`, InstrumentPatch>`
  so a note's effective patch is `patchByChannelProgram.get(`${channel}:${effectiveProgram}`)`.

This keeps the mapper, `voiceFilter`, `voicePlayback`, sustain windows, and the
geometry layer completely unchanged — `track.channel` and `note.voice` keep their
current meaning.

### Decision 3 — Channel-10 detection: use zero-indexed channel 9, flagged on `TrackScore`

Convention: "MIDI channel 10" is channel 9 in `@tonejs/midi`'s zero-indexed
representation (`Instrument.ts:78`: `return track.channel === 9`). The parser adds
an `isPercussion: boolean` flag on `TrackScore` (`track.channel === 9`), and the
router and players branch on `track.isPercussion` rather than re-checking magic
numbers. This fixes the prior draft's prose-vs-code mismatch ("channel 10" prose,
`channel === 9` code).

The flag is determined per `TrackScore`, not per note — consistent with the
Type-0 deferral above. A multi-channel Type-0 track whose last note is on channel
10 is therefore mis-flagged as percussion; documented as a known limitation of
this plan and fixed only when Type-0 split lands.

### Decision 4 — Bundle the FluidR3 bank-128 Standard drum kit for channel 10

Channel-10 percussion plays through a **bundled drum kit**, not a synth and not
silence. Concretely:

- A new `loadDrumKitPatch()` (in `src/audio/soundfont/drumkitLoader.ts`) fetches
  `FluidR3_GM/drumkits/Standard-mp3.js` from one of two sources — first the local
  bundled copy at `/soundfonts/FluidR3_GM/percussion/Standard-mp3.js`, then the
  community CDN at `https://henrikvilhelmberglund.github.io/midi-js-compat-soundfonts/GM-soundfonts/FluidR3_GM/drumkits/Standard-mp3.js`
  — and parses it with the existing `parseMidiJsSoundfontScript` helper and
  `dataUriToArrayBuffer` decoder. No new audio format, no second scheduler, no
  synthesized recipes.
- The returned `InstrumentPatch` is keyed under `slug: 'drumkit-standard'` (the
  file's internal `MIDI.Soundfont.marimba` tag is misleading — see "Why this plan,
  why now" §2 — and must not collide with the melodic `loadPatch(FluidR3_GM, 13)`
  marimba patch in the patch cache).
- **Cache-key isolation (confirmed): no migration needed.** Two cache layers are
  in play, both key-safe against existing users:
  - The in-memory `SoundfontPatchLoader.cache: Map<string, InstrumentPatch|null>`
    is per-session, cleared each page load (`SoundfontPatchLoader` is fresh per
    `SoundfontPlayer` instance). Re-keying `marimba` → `drumkit-standard` only
    affects this Map's keys, and since the Map starts empty each session, no
    "old key" ever exists to migrate.
  - The HTTP `CacheStorage` bucket (`SOUNDFONT_CACHE_NAME`) keys entries by
    fetch URL (see `soundfontPatchLoader.ts:93` `cacheKey = cdnSoundfontUrl(…)`).
    The drum-kit loader uses a brand-new URL
    (`https://henrikvilhelmberglund.github.io/…/Standard-mp3.js` or
    `/soundfonts/FluidR3_GM/percussion/Standard-mp3.js`) that has zero overlap
    with any existing gleitz melodic entry. No `caches.delete` / version bump
    is required.
- `SoundfontPlayer.start` branches on `track.isPercussion`:
  - It collects percussion tracks in a separate bucket from melodic tracks and
    runs the drum-kit patch load in parallel with the melodic patch loads.
  - Percussion notes are scheduled through the same `scheduleSample` path
    (`src/audio/soundfont/soundfontPlayer.ts:187-229`) — the sample buffers are
    GM drum pitches (35-81) already encoded as `A#1`/`C2`/… keys, and
    `nearestSampleKey(note.pitch, keys)` picks the closest available key the way
    it does for melodic patches. No per-note `effectiveProgram` lookup is needed
    on channel 10 (the Standard kit is one patch).
  - Carve-out for the **oscillator engine**: today `SoundfontPlayer.start` early-
    returns at `src/audio/soundfont/soundfontPlayer.ts:86-89` delegating the whole
    score to `MidiPreviewPlayer` when `defaults.engine === 'oscillator'`. We split
    that branch: percussion tracks always go through the bundled drum-kit sample
    path; only melodic tracks delegate to the oscillator fallback. (Channel 10
    has no melodic program to oscillate.)
- `MidiPreviewPlayer.start` and `selectAudibleTracks` **skip percussion tracks**
  (`src/audio/midiPreviewPlayer.ts:selectAudibleTracks` and the `start` call sites
  at `app.ts:261` and `soundfontPlayer.ts:158-159`) since channel-10 audio comes
  from the drum-kit sample path.
- A new `PatchStatus` value `'drumkit'` (added to the `PatchStatus` union in
  `soundfontTypes.ts`) is surfaced via `SoundfontPlayer.getStatusMap()` for
  channel-10 so the UI can render the distinct badge (Decision 5).
- `scripts/bundle-soundfonts.mjs` is extended to download `Standard-mp3.js` into
  `public/soundfonts/FluidR3_GM/percussion/Standard-mp3.js` (gitignored alongside
  the existing melodic `.js` blobs, ~5.7 MB added to the offline bundle budget
  alongside the existing 20–30 MB of core melodic patches), and to record it in
  the bundle manifest. The goldst `*-loop.json` loop-metadata path is **not**
  needed for percussion (drum samples are one-shots by design).

Channel-10 notes are **not** removed from the score — they keep rendering in the
visual domain exactly as today; the routing affects playback only.

This is real drum audio with no throwaway work: the Standard kit continues to work
unchanged after the SF2 engine swaps in (it's just one of eight bank-128 kits the
SF2 engine will then load natively). The SF2 engine plan expands the
`drumkit-standard` path to a multi-variant `<select>` — see "Known limitations
carried forward."

### Decision 5 — UI: percussion row shows drum-kit status, no melodic picker

Today `buildAudioVoiceRow` (`src/ui/voiceOptionsUI.ts:78-94`) renders a 128-option
melodic GM `<select>` and calls `onProgramChange(track.channel, program)` every
row — including channel-10, which makes no sense given the picker has no drum-kit
options and channel 10 always plays the bundled Standard kit. Phase 3 revises the
row for percussion tracks:

- Render a read-only **"Drum kit · FluidR3 Standard"** label and the `'drumkit'`
  badge instead of the melodic picker. No `onProgramChange` call on channel-10
  rows (drum-kit *variant* selection is a separate follow-up — see Out of scope).
- Keep mute/solo/gain controls unchanged (they're keyed by channel, which is fine).
- Retain the melodic picker and patch badge for non-percussion rows exactly as
  today. The picker's `onProgramChange(channel, program)` call becomes a
  per-channel **user override** stored in `VoiceRouter.programs` (existing
  shape — Decision 2's per-note `effectiveProgram` is set at parse time and
  does *not* reflect user overrides). Override precedence (locked):
  1. **Source-level program changes** in `TrackScore.programChanges` win
     before the override timeline starts — i.e., a user override cannot
     rewrite what the MIDI file specified at the note's onset.
  2. A user override applies **only to notes whose `effectiveProgram` is
     absent** (no source programChanges) **OR to notes whose onset is after
     the last source program-change event** in the timeline — i.e., the
     override acts as a static program for the trailing section of a track.
  - This precedence is implementation-internal; the row UI stays exactly as
    it is today (melodic picker + badge) and does *not* show a
    "this is a trailing-section override" indicator in this plan. A small
    future improvement (e.g., graying out the melodic picker before the last
    program change) is out of scope; tracked as a minor UX follow-up but not
    required for correctness.

## Proposed file changes

```
src/core/types.ts                          — ProgramChangeEvent type; NoteEvent.effectiveProgram?; TrackScore.isPercussion
src/core/midi/parser.ts                    — raw-event program-change timeline; per-note effectiveProgram; isPercussion
src/audio/soundfont/voiceRouter.ts         — reads effectiveProgram via resolveTrackSettings; exposes track.isPercussion
src/audio/soundfont/soundfontPlayer.ts     — patchByChannelProgram map; routes channel-10 through bundled drum-kit patch; oscillator-engine carve-out; 'drumkit' status
src/audio/soundfont/soundfontTypes.ts      — PatchStatus += 'drumkit' | 'drumkit-missing'
src/audio/soundfont/drumkitLoader.ts       — NEW: fetch + parse Standard-mp3.js (local then community CDN) into an InstrumentPatch keyed 'drumkit-standard'
src/audio/midiPreviewPlayer.ts             — skips percussion tracks (channel-10 audio is the drum-kit sample path)
src/ui/voiceOptionsUI.ts                   — percussion row variant (read-only "Drum kit · FluidR3 Standard" label + 'drumkit' badge, no melodic picker)
src/ui/app.ts                              — wire percussion row context; keep voicePlayback/voiceFilter unchanged
tests/parser.programChange.test.ts         — NEW program-change timeline + effectiveProgram pre-bake
tests/voiceRouter.test.ts                  — per-note effectiveProgram; isPercussion branch
tests/soundfontPlayer.test.ts              — patchByChannelProgram; channel-10 routes to drum-kit patch and never calls melodic loadPatch; oscillator-engine carve-out holds
tests/drumkitLoader.test.ts                — NEW: parse community .js; slug 'marimba' mapped to 'drumkit-standard' patch; local→CDN fallback; cache key collision with melodic marimba avoided
tests/voiceOptionsUI.test.ts               — percussion row renders drum label; no onProgramChange on channel 10
scripts/bundle-soundfonts.mjs              — downloads Standard-mp3.js to public/soundfonts/FluidR3_GM/percussion/; manifest entry; gitignored
ARCHITECTURE.md                            — rule #2 update: TrackScore.programChanges + NoteEvent.effectiveProgram + channel-10 contract + drum-kit loader
README.md                                  — playback support matrix: channel-10 via FluidR3 Standard kit; other 7 variants deferred to SF2 engine; Type-0 limitation noted
CHANGELOG.md                               — Unreleased: Added (mid-track program changes, channel-10 FluidR3 Standard drum kit)
```

`gmLoopSlugs.ts` is intentionally **untouched**: drum samples are one-shots and
do not need goldst loop metadata.

## Phases & checklist

### Phase 0: Decisions and audit (do before any code)

- [x] Confirm `@tonejs/midi` exposes only the first program change at
      `Track.instrument.number` (done; see "Why this plan, why now").
- [x] Confirm gleitz `FluidR3_GM` names.json contains the 128 melodic slugs only,
      no `percussion` entry (done; fetched 2026-07-26). The `Tabla` bank is a
      single 4 MB Indian percussion instrument mapped C4-E6, not a GM drum kit, so
      it is not usable as a channel-10 fallback. **Note: the source FluidR3_GM.sf2
      does carry bank 128 with 8 drum kits; only the gleitz pre-rendered
      extraction omits them.** See Decision 4 for the community extraction we
      bundle instead.
- [x] Confirm the community midi-js-compat extraction of the FluidR3 bank-128
      Standard drum kit is consumable by the existing loader (done; fetched the
      header 2026-07-26 — `MIDI.Soundfont.marimba = {"A#1": "data:audio/mp3;…}`
      spanning ~MIDI 34-84, ~5.7 MB, same `*-mp3.js` format
      `parseMidiJsSoundfontScript` already accepts; the `marimba` internal slug
      is a mis-label and must be re-keyed to `drumkit-standard` — see Decision 4).
- [x] Confirm `@tonejs/midi` raw event array is accessible per-parsed-track for the
      program-change walk (done — `Track` carries the raw event list internally;
      implementation will read it via the documented `Midi.tracks[i]` surface and
      stop if the API surface is unavailable in this version).

> Decision locks above are the only Phase-0 must-do's before Phase 1 starts. The
> remaining ARCHITECTURE.md documentation work is filed under Phase 4 below.

### Phase 1: Parser — program-change timeline and per-note pre-bake

- [ ] Add `ProgramChangeEvent` (`{ time: number; program: number }`) and
      `NoteEvent.effectiveProgram?: number` and `TrackScore.isPercussion: boolean`
      to `src/core/types.ts`. Backward-compatible additions only.
- [ ] In `parseMidiData`, walk the raw event array of each track once and build
      `programChanges: ProgramChangeEvent[][]` per track, sorted by time.
- [ ] For each note, set `effectiveProgram` to the program active at the note's
      onset according to the timeline (falls back to `track.program` when the
      timeline has no entries earlier than the note onset).
- [ ] Set `TrackScore.isPercussion = (track.channel === 9)` (after the
      `track.channel ?? trackIdx` fallback). Document the zero-indexed convention
      in a JSDoc comment on the field.
- [ ] Tests: `tests/parser.programChange.test.ts` — (a) zero program changes →
      `effectiveProgram` absent and equals `track.program` everywhere; (b) one
      program change at t=2.0s on a track whose notes span 0–10s splits the notes
      correctly; (c) multiple program changes; (d) channel-9 track sets
      `isPercussion === true`; (e) demo score unchanged.

### Phase 2: Routing — per-note patch resolution + bundled drum-kit playback

- [ ] Add `'drumkit'` and `'drumkit-missing'` to the `PatchStatus` union in
      `soundfontTypes.ts`.
- [ ] New `src/audio/soundfont/drumkitLoader.ts`:
  - `loadDrumKitPatch()` fetches `Standard-mp3.js` from local
    `/soundfonts/FluidR3_GM/percussion/Standard-mp3.js`, then the community CDN
    `https://henrikvilhelmberglund.github.io/midi-js-compat-soundfonts/GM-soundfonts/FluidR3_GM/drumkits/Standard-mp3.js`;
    uses `looksLikeSoundfontScript` to reject SPA index.html, parses with
    `parseMidiJsSoundfontScript`, decodes buffers via the same `AudioDecoder`
    `SoundfontPatchLoader` already uses. Caches under key
    `FluidR3_GM:drumkit-standard` (NOT `FluidR3_GM:marimba`, even though the file
    internally uses `MIDI.Soundfont.marimba` — see "Why this plan, why now" §2);
    the resulting `InstrumentPatch.slug` is `'drumkit-standard'`.
  - No goldst `*-loop.json` lookups for the drum kit (one-shots).
  - Reuse the existing CacheStorage bucket (`SOUNDFONT_CACHE_NAME`) keyed by the
    community CDN URL.
- [ ] In `SoundfontPlayer.start`:
  - Split the early oscillator-delegate (`src/audio/soundfont/soundfontPlayer.ts:86-89`)
    so percussion tracks always go through the drum-kit sample path; only
    melodic tracks delegate to oscillator fallback when `engine === 'oscillator'`.
    The carve-out is required because Drum samples must load regardless of the
    melodic engine choice.
  - Build `patchByChannelProgram: Map<string, InstrumentPatch>` for **non-percussion**
    tracks keyed `${channel}:${effectiveProgram}`; load patches per distinct
    `(channel, effectiveProgram)` pair.
  - In parallel, load the single drum-kit patch via `loadDrumKitPatch()` for any
    percussion track present; keys into a `drumPatchByChannel: Map<number, InstrumentPatch>`
    so multiple channel-10 tracks share one drum-kit load.
  - Schedule percussion notes through the existing `scheduleSample`
    (`soundfontPlayer.ts:187-229`); `nearestSampleKey(note.pitch, keys)` picks the
    closest GM drum note (35–81) among the kit's `A#1..C6` keys. No per-note
    `effectiveProgram` lookup for percussion — there is one Standard kit.
  - For non-percussion tracks, look up per-note patch as
    `patchByChannelProgram.get(`${track.channel}:${note.effectiveProgram ?? track.program}`)`.
  - Fallback for missing patches on a non-percussion channel unchanged
    (`'fallback'` status → `MidiPreviewPlayer` pitched path). Channel 10
    **never** falls through to `MidiPreviewPlayer` — pitch oscillators on drum
    notes would re-introduce the bug.
  - **Failure mode (locked):** if `loadDrumKitPatch` returns `null`, channel-10
    status becomes a new `PatchStatus` value `'drumkit-missing'` (distinct from
    `'fallback'`, since `'fallback'` on channel-10 would imply oscillator
    playback that we explicitly do *not* do). Channel-10 notes are simply not
    scheduled — the player continues with other tracks uninterrupted. The
    in-memory `SoundfontPatchLoader.cache` Map already nullable-caches the
    `null` result (see `soundfontPatchLoader.ts:62-64`); the session's
    CacheStorage entry, if any, is left untouched — the next `start()` call
    retries from the local bundled file, which is the usual fix path. A
    `console.warn('drumkit load failed; channel-10 silent')` is emitted once
    per failed load (not per note). The UI renders the badge text "Drum kit
    failed to load — channel silent" with the same row layout as a successful
    drum row (Decision 5). No retry loop, no toast/banner — the badge is the
    entire notification surface.
- [ ] In `MidiPreviewPlayer.start` and `selectAudibleTracks`, skip tracks with
      `isPercussion === true` — channel-10 audio always comes from the
      `SoundfontPlayer` drum-kit path, never the oscillator fallback.
- [ ] `VoiceRouter.resolveTrackSettings`: return `isPercussion` alongside `program`
      so the players can branch without re-reading `track.channel`.
- [ ] Tests: `soundfontPlayer.test.ts` adds (a) a channel-9 track routes through
      `loadDrumKitPatch` and never `loadPatch`; (b) the `'drumkit'` status is
      surfaced for channel 9; (c) an oscillator-engine score still plays
      percussion through the drum-kit sample path (carve-out works) and melodic
      tracks via oscillator; (d) a non-percussion track with two program changes
      loads two distinct melodic patches and dispatches the right notes to each.
      `drumkitLoader.test.ts` adds: parse community .js; the `marimba` slug is
      re-keyed to `drumkit-standard`; cache key does not collide with melodic
      `loadPatch(FluidR3_GM, 13)` marimba; local→CDN fallback; SPA rejection
      via `looksLikeSoundfontScript`.

### Phase 3: UI — percussion row variant

- [ ] In `voiceOptionsUI.buildAudioVoiceRow`, branch on
  `context.isPercussion?.(track)` (new optional context getter): render a
  read-only **"Drum kit · FluidR3 Standard"** row (no melodic `<select>`)
  for percussion tracks; keep mute/solo/gain so the user can still mix the
  drum track in the mix (consistent UX across row types).
- [ ] `applyBadge` learns the new `'drumkit'` status (text:
  "✓ Drum kit (FluidR3 Standard)") and `'drumkit-missing'` status (text:
  "Drum kit failed to load — channel silent"). Both render in the
  read-only percussion row; only the badge text differs.
- [ ] `app.ts` passes `isPercussion: (track) => track.isPercussion` into the voice
  row context; no change to `voicePlayback`, `voiceFilter`, or mixer state.
- [ ] Tests: `voiceOptionsUI.test.ts` adds a row for a channel-9 track asserting
   the "Drum kit · FluidR3 Standard" label is present and no `onProgramChange`
   call is made; a melodic row still triggers `onProgramChange` and renders the
   GM picker.

### Phase 4: Bundler, docs, changelog, validate

- [ ] Extend `scripts/bundle-soundfonts.mjs` to download
  `Standard-mp3.js` from the henrikvilhelmberglund community CDN into
  `public/soundfonts/FluidR3_GM/percussion/Standard-mp3.js` (gitignored next to
  the existing melodic `.js` blobs — `/public/soundfonts/**` is already in
  `.gitignore`); add a manifest entry with the sha256 check; `--verify` mode
  accepts the new file. No new `*-loop.json` fetch.
- [ ] ARCHITECTURE.md: add `ProgramChangeEvent` to the domain contract list;
  describe `NoteEvent.effectiveProgram`, `TrackScore.isPercussion`, the
  `loadDrumKitPatch` boundary, and the `drumkit-standard` patch id; add the
  zero-indexed-channel-10 convention; note the Type-0 limitation as known and
  deferred.
- [ ] README.md: update the playback support matrix — channel-10 plays via the
  bundled FluidR3 Standard drum kit; the other seven bank-128 variants are
  deferred to the SF2 engine plan; the Type-0 limitation is noted.
- [ ] CHANGELOG.md Unreleased **Added**: mid-track program-change routing;
  channel-10 FluidR3 Standard drum kit (real samples, not synth). SemVer
  **MINOR**.
- [ ] ARCHITECTURE.md (moved from Phase 0): document the Type-0 / multi-channel
  limitation as a known limitation of *this* plan, with a forward link to the
  Type-0 split follow-up; lock the zero-indexed-channel convention ("MIDI
  channel 10 == zero-indexed 9") alongside the channel-10 detection rule.
- [ ] Remove the completed item from `dev-docs/TO_DO.md` once merged; the SF2
  engine item remains, with its prereq (this plan) now done — ready to start the
  SF2 engine plan immediately after.

## Verification

- [ ] Parser tests: program-change timeline; per-note `effectiveProgram`; channel-9
      `isPercussion`; demo score unchanged.
- [ ] Router tests: per-note program overrides; `isPercussion` branch.
- [ ] Drum-kit loader tests: community `.js` parses via the existing helper;
      `marimba` internal slug re-keyed to `drumkit-standard`; cache key does not
      collide with the melodic `loadPatch(FluidR3_GM, 13)` marimba patch; local →
      community CDN fallback; SPA `index.html` rejected by
      `looksLikeSoundfontScript`.
- [ ] Player tests: a channel-9 track routes through `loadDrumKitPatch` and never
      `loadPatch`; the `'drumkit'` status is surfaced via `getStatusMap()`; under
      the **oscillator** engine, channel-10 still plays the bundled drum-kit
      samples (carve-out holds) and melodic tracks still use oscillators; a
      non-percussion track with two program changes loads two distinct melodic
      patches and routes the right notes to each; **if `loadDrumKitPatch`
      resolves to null, channel-10 surfaces `'drumkit-missing'`, schedules no
      sources, and non-percussion tracks play normally** (failure mode
      isolated).
- [ ] UI tests: channel-9 row renders "Drum kit · FluidR3 Standard" and issues no
      `onProgramChange`; melodic rows unchanged.
- [ ] Bundler: `--verify` accepts the new `Standard-mp3.js` next to melodic core
      patches.
- [ ] Manual playback smoke: (a) a melodic MIDI with a mid-track program change
      (e.g., piano → organ) audibly switches timbres at the program-change
      boundary; (b) a mixed melodic/percussion MIDI plays the melodic channels
      through FluidR3 melodic samples and the drum channel through the bundled
      Standard kit — recognizable kick/snare/hat at the GM drum pitches
      (35–81), no pitched piano masquerading as drums; (c) reloading never causes
      channel-10 notes to leak into melodic `loadPatch` calls; (d) manual load
      with `Standard-mp3.js` deleted from `public/` reproduces the
      `'drumkit-missing'` failure-mode badge (re-download via
      `npm run bundle:soundfonts` restores it).
- [ ] `npm run validate` passes.

### Test data sources

- **Parser tests (ProgramChangeEvent / effectiveProgram):** generate small
  synthetic MIDI fixtures with `scripts/generate_demo_midis.js` (already used
  for `public/demo-midi/`); it can inject a CC-style programChange on a chosen
  channel at a chosen bar. Two fixtures shipped into `public/demo-midi/`:
  `program_change_demo.mid` (one channel, piano → organ at t=2.0s) and
  `channel_10_demo.mid` (drum-only, channel 9). Both must be redistributable
  and license-clean (generated locally, no sampled audio).
- **Mix tests (mixed melodic/percussion):** a small hand-authored
  `mixed_piano_drums.mid` (4 bars, piano on channel 1, standard kit on channel
  10) for the manual playback smoke above.
- **No externally-downloaded MIDI is used** in tests (existing fixture policy
  per `AGENTS.md` rule #4: agent must not upload user MIDI files; generated
  fixtures stay local).
- **Drum-kit `.js` for `drumkitLoader.test.ts`** is decoded in a `jsdom`-off
  Vittest environment using a stubbed `AudioDecoder` returning fake
  `AudioBuffer`s, parallel to `tests/soundfontPlayer.test.ts`'s approach (no
  real MP3 decoding in unit tests — confirms script parsing + cache-key logic
  without exercising the AudioContext).

### Documentation update section references

- `ARCHITECTURE.md` "Domain contracts" / rule #2 list: add `ProgramChangeEvent`
  and the new optional fields on `NoteEvent` / `TrackScore`. (Phase 4 bullet.)
- `ARCHITECTURE.md` "Playback and source boundaries": document
  `loadDrumKitPatch`, the `drumkit-standard` slug, the `'drumkit'` /
  `'drumkit-missing'` statuses, and the oscillator-engine carve-out. (Phase 4.)
- `ARCHITECTURE.md` known-limitation callout near the playback boundary: add
  the Type-0 multi-channel-track limitation with a forward link to the
  deferred Type-0 split plan; lock the zero-indexed-channel-10 wording here
  ("MIDI channel 10 == zero-indexed 9"). (Phase 4.)
- `README.md` "Playback" / "Supported MIDI features" table (whichever exists in
  the current revision): add a "Channel-10 drums" row with "Bundled FluidR3
  Standard kit" and a footnote pointing to the SF2 engine plan for
  variant selection.
- No new diagrams are needed for this plan; the route path is internal.

### Performance considerations

- Per-note patch resolution is an `O(1)` `Map.get` per note per scheduling
  pass (the patch is already loaded and cached before scheduling starts),
  so there is no per-frame cost difference vs. the current channel-keyed
  lookup. The new `effectiveProgram` field is a plain number on `NoteEvent`;
  no extra allocation in the render/mapper path (it is read only at
  scheduling time in `SoundfontPlayer.start`).
- Memory impact: one extra `InstrumentPatch` for the Standard kit (~80
  decoded `AudioBuffer`s, ≲5.7 MB of decoded PCM depending on sample rate;
  the melodic patches already in the cache). The melodic per-program patches
  cost the same as today when no program changes occur; with mid-track
  program changes, the loader now holds up to N patches per channel instead
  of 1 — bounded by the actual program-change count, which is small for
  virtually all real-world MIDI (single-digit programs per channel).
- Drum-kit load time: one extra ~5.7 MB download/cache read on first play,
  in parallel with melodic patch loads; not on the critical path of melodic
  playback start. No performance testing is required for this plan — the
  existing `LookaheadScheduler` work budget already governs scheduling
  throughput, and the existing patch-cache test (`SoundfontLibrary` verify
  mode) guards against unbounded bundle growth.

## Known limitations carried forward (hand-off to the SF2 engine plan)

These are explicitly **not** fixed here and are listed so the SF2 engine plan can
pick them up as first-class deliverables:

1. **Only the Standard drum kit ships.** The other seven FluidR3 bank-128
   variants (Room / Power / Electronic / TR-808 / Jazz / Brush / Orchestra) are
   deferred. The SF2 engine plan loads all eight natively from FluidR3.sf2 via
   SpessaSynth / FluidSynth WASM and exposes a per-track drum-kit `<select>` (which
   is analogous to the deferred per-track bank control — see below).
2. **No per-track engine/bank selection.** `SoundfontPlayer` still loads the
   global default soundbank for every melodic track and the Standard kit for every
   percussion track. Per-track bank / engine / drum-kit-variant selection is its
   own follow-up plan; the SF2 engine plan should sequence it after the SF2 swap
   so a multi-bank UI is designed once against the new engine rather than twice.
3. **MIDI Type-0 split-by-channel.** A single MIDI track carrying multiple
   channels is not split; routing still works per-note because the raw-event walk
   sees channel-per-note data, but the `TrackScore.isPercussion` flag is only
   correct for Type-1 files. Type-0 split is its own parser milestone.
4. **Community-CDN dependency for the drum-kit file.** The Standard kit uses
   `henrikvilhelmberglund.github.io` rather than gleitz as its CDN source — a
   second upstream. The Phase-4 bundler step downloads the file into local
   `public/soundfonts/FluidR3_GM/percussion/` for offline use; the CDN is only a
   fallback for non-bundled dev/test runs. The SF2 engine plan drops this
   dependency entirely by loading the drum kits directly from FluidR3.sf2.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `@tonejs/midi` raw-event surface changes across versions | low | high | Pin version; add a parser test that fails fast if the walk surface is missing |
| Community CDN goes away or rebuilds the file | med | med | Phase-4 bundler writes the kit into `public/` so the offline build is self-sufficient; CDN is only a dev fallback; record sha256 in manifest |
| `marimba` internal slug collides with melodic marimba patch in the cache | high | high | `loadDrumKitPatch` re-keys the patch to `drumkit-standard` and the in-memory cache key `FluidR3_GM:drumkit-standard`; the HTTP CacheStorage bucket uses a brand-new URL with no overlap with gleitz melodic entries (no version bump needed); Phase 2 + `drumkitLoader.test.ts` assert the collision is avoided |
| Mis-flagging Type-0 tracks as percussion | med | med | Phase 0 documents; only Type-0 with last-note on channel 9 affected; plan ships with a known limitation note |
| Per-note patch load explodes bundle/cache pressure for highly-fragmented MIDI | low | med | `patchByChannelProgram` cache reuses existing patch cache by `(bank:slug)`; drum-kit is loaded once for all channel-10 tracks |
| UI regression on melodic rows | low | med | Phase 3 tests assert melodic rows still call `onProgramChange` and render GM picker |
| Bundled kit size (~5.7 MB) grows the offline bundle | low | low | Already within the 20–30 MB budget `scripts/bundle-soundfonts.mjs` documents; only Standard — the other 7 variants stay on FluidR3.sf2 in the SF2 engine plan |

## Implementation notes for agents

1. Do not mark checklist items done until tests confirm the behavior.
2. Update ARCHITECTURE.md as part of Phase 4 *for the new domain contracts*
   (`ProgramChangeEvent`, `NoteEvent.effectiveProgram`, `TrackScore.isPercussion`)
   and the drum-kit loader boundary (`loadDrumKitPatch`, `drumkit-standard`
   patch id). Do not change the visual mapper contract in this plan.
3. Do not edit tests solely to force green; if a test fails for a real product
   reason, stop and report.
4. The SF2 engine plan is the immediate follow-on — preserve the routing contract
   names (`programChanges`, `effectiveProgram`, `isPercussion`,
   `patchByChannelProgram`, `loadDrumKitPatch`, `drumkit-standard`,
   `'drumkit'`) verbatim into that plan; they are the integration boundary. The
   SF2 engine plan **expands** the drum-kit path to multiple bank-128 variants
   loaded natively from FluidR3.sf2; the `'drumkit'` status is preserved as the
   umbrella status for whichever variant is loaded.