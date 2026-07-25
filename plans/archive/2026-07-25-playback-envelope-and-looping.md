# Plan: Playback Envelope, Sustain Pedal Parity, and Sample Looping

Last reviewed: 2026-07-25
Date: 2026-07-25
Author: Cursor Grok
Status: complete (2026-07-25)
Linked issue/PR: n/a
SemVer impact: **PATCH** (correctness of existing MIDI / SoundFont audition; no new UI)
Completed: 2026-07-25 — committed as `7f94404`; manual smoke accepted by user.

## Goal

Make MIDI preview sound hold and release like a real instrument: a proper ADSR
amplitude envelope on both engines, CC64 sustain that works for SoundFont *and*
oscillator/fallback paths, playhead/stop that does not cut pedal tails, and
sample looping so sustained GM instruments (strings, pads, organs, winds) keep
sounding for the full MIDI/pedal duration instead of going silent when the
one-shot buffer ends.

## Background (bugs confirmed 2026-07-25)

Both `MidiPreviewPlayer` and `SoundfontPlayer` use the same broken gain curve:

```ts
setValueAtTime(0.0001, start);
exponentialRampToValueAtTime(volume, start + ~0.02); // attack
exponentialRampToValueAtTime(0.0001, end);           // fade over entire note
```

There is no decay → sustain hold → release-after-note-off. Long notes and
pedal-held notes fade out during the hold. Related gaps:

| Issue | Where |
|---|---|
| CC64 ignored on oscillator / fallback | `MidiPreviewPlayer` never calls `getSustainedDuration` |
| Pedal tail cut at score end | `score.duration` = last note-off only; `app.ts` `pause()` stops audio |
| No sample looping | midi-js buffers are one-shots; organs/strings die mid-hold |

Existing unit tests (sustain windows, player fallback, scheduler) pass; they do
not cover envelope shape, oscillator sustain, or looping.

## Locked product decisions (2026-07-25)

| Decision | Choice |
|---|---|
| Loop when metadata exists | **Default on** (no UI toggle in this change) |
| Offline availability | **Bundle** FluidR3 core / demo loop JSON via `bundle:soundfonts` under `public/soundfonts/…` |
| Engine for this fix | Stay on **midi-js + goldst loop metadata** (see alternatives below) |

## Out of scope

- User-facing ADSR sliders or per-track envelope UI (hard-coded defaults only).
- Replacing the playback engine with SF2/SF3 / SpessaSynth / FluidSynth WASM
  (tracked as a future milestone below — not this PATCH).
- Adopting `smplr` as the playback engine (reuse its loop-data idea / goldst URLs).
- Channel-10 drums, mid-track program changes (see [`2026-07-24-general-midi-routing.md`](2026-07-24-general-midi-routing.md)).
- Offline WAV export.
- Perfect click-free loops on every FluidR3 patch (goldst/smplr mark loop data
  experimental; soft-fail and document residual clicks).

## Alternative approaches (why not switch engines in this plan)

midi-js soundbanks are **pre-rendered MP3 note samples** with no SF2 generators,
modulators, or `smpl` loop points. Looping is bolted on. Approaches that carry
loops *natively*:

| Approach | How looping works | Pros | Cons for AudioVisualizer now |
|---|---|---|---|
| **A. midi-js + goldst `*-loop.json`** (this plan) | External SF2-extracted `[start,end]` frames → Web Audio `loopStart`/`loopEnd` | Keeps current loader, CacheStorage, VoiceRouter, CDN banks, ~per-instrument downloads | Slug mismatches; experimental click risk; second artifact to bundle |
| **B. Parse `.sf2` / `.sf3` in-app** (`soundfont2` / `soundfont3` + own scheduler, or smplr `Soundfont2Sampler`) | Loop points live on each sample header (`startLoop`/`endLoop`) | One asset; correct loops; velocity zones possible | FluidR3 GM ≈ **148 MB** uncompressed SF2; rewrite loader/player; Musyng/FatBoy become huge; API still “limited” in smplr |
| **C. Full SF2 synth engine** ([SpessaSynth](https://github.com/spessasus/SpessaSynth) / `spessasynth_lib`, or FluidSynth WASM) | Real SoundFont synth (generators, modulators, native loops, CC, drums) | Most “correct” GM audition; pedal/program changes “for free” | Large dependency + worklet; replaces `SoundfontPlayer` / VoiceRouter path; bank UX and offline bundling change; overkill for PATCH |
| **D. Blind whole-buffer `source.loop`** | Loop entire MP3 | Trivial | Re-triggers attack; bad clicks; wrong for piano |

**Recommendation:** Ship **A** now (envelope + sustain + bundled goldst loops,
default on). Next engine milestone: go straight to **C** (full SF2 synth)—skip
**B** as an architecture. Tracked in `dev-docs/TO_DO.md` (“Full SF2 synth engine”).
Do not block this PATCH on an engine swap.

## Approach

### 1. Shared ADSR helper (both engines)

Extract `applyNoteEnvelope(gainParam, { start, end, peak, ... })` used by
oscillator and sample paths.

| Stage | Default | Behavior |
|---|---|---|
| Attack | `0.008` s | Ramp `ε → peak` |
| Decay | `0.04` s | Ramp `peak → peak * sustainLevel` |
| Sustain | level `1.0` | Hold until note-off (`end`) |
| Release | `0.08` s | Ramp to `ε` *after* `end`; `source.stop(end + release + ε)` |

Clamp so `attack + decay` never exceeds `playDuration` (very short notes still
sound). Use `exponentialRampToValueAtTime` with a floor of `0.0001` (never 0).

**SoundFont vs synth:** same envelope timings. Samples already contain transient
and natural decay; sustain level `1.0` + short release avoids the current
double-fade while still giving a clean note-off. Do not invent a second “piano
decay” curve on top of the sample.

### 2. CC64 parity on the oscillator path

`MidiPreviewPlayer.start` must build per-channel sustain windows (same helpers
as `SoundfontPlayer`) and schedule with `getSustainedDuration`. Fallback
channels then honor the pedal.

### 3. Playback end includes audio sustain tail

- Parser / score helper: `audioEndTime(score)` = max of note ends, pedal-up
  times, and open-pedal clamp — **or** extend `Score.duration` only for
  *playback* via a derived value so visual geometry stays note-based.
- **Locked decision:** keep visual `Score.duration` as last note-off (mapper /
  scrubber geometry unchanged). Add `playbackEndTime(score)` used by
  `SoundfontPlayer` / `MidiPreviewPlayer` open-pedal clamp *and* by `app.ts`
  tick/`pause` so audio is allowed to finish release + pedal before stop.
- `buildSustainWindows(..., playbackEndTime)` replaces `score.duration` as the
  open-pedal clamp so an open pedal is not truncated to the last note-off.

### 4. Sample looping — yes, include it

midi-js scripts have **no** embedded loop points. Real SF2 loop regions for the
same banks are published separately by
[goldst/midi-js-soundfonts](https://github.com/goldst/midi-js-soundfonts)
(`feature/loop`) and served at:

`https://goldst.dev/midi-js-soundfonts/{Bank}/{slug}-loop.json`

Format (per note name): `[loopStartFrame, loopEndFrame]` at **44100 Hz**
(convert to seconds with `frame / 44100`, matching [smplr](https://github.com/danigb/smplr)).
Note names may use flats (`Db4`); our buffers use sharps (`C#4`) — look up by
MIDI number, not string equality.

**When to loop (default on)**

- If loop metadata exists for the chosen sample key → **always** set
  `AudioBufferSourceNode.loop = true`, `loopStart`, `loopEnd` (no user toggle).
- If metadata is missing → leave one-shot. No blind whole-buffer loop.
- Soft-fail fetch (404 / network / unmapped slug): patch still plays; status
  stays `loaded`.

**Slug mismatch risk:** goldst FluidR3 loop filenames sometimes differ from
gleitz GM slugs (`drawbarorgan` vs `drawbar_organ`,
`bright_yamaha_grand` vs `bright_acoustic_piano`). Ship a small
`gmLoopSlug(program | gleitzSlug) → goldstSlug | null` map for known
mismatches; unmapped / 404 → no loop.

**Load order / caching**

1. Prefer local `public/soundfonts/{bank}/{slug}-loop.json` (bundled).
2. Else CacheStorage (`soundfonts-v1`), then goldst CDN.
3. Soft-fail → play without loop.

**Required bundle:** extend `bundle:soundfonts` to download loop JSON for every
FluidR3 instrument it already bundles (core + demo set), writing
`public/soundfonts/FluidR3_GM/{goldstSlug}-loop.json` (gitignore same as `.js`).
CDN remains fallback for non-bundled / Musyng / FatBoy.

## Proposed file changes

```
src/audio/noteEnvelope.ts                    — NEW shared ADSR apply + defaults
src/audio/midiPreviewPlayer.ts               — use envelope; CC64 sustain windows
src/audio/soundfont/soundfontPlayer.ts       — envelope; enable loop on sources
src/audio/soundfont/soundfontPatchLoader.ts  — optional fetch/parse of *-loop.json
src/audio/soundfont/soundfontTypes.ts        — InstrumentPatch.loops?: Record<midi, [start,end]>
src/audio/soundfont/gmLoopSlugs.ts           — NEW gleitz→goldst loop slug map
src/audio/soundfont/sustainWindows.ts        — playbackEndTime helper (or sibling)
src/core/midi/parser.ts                      — optional: no visual duration change
src/ui/app.ts                                — tick/pause against playbackEndTime
tests/noteEnvelope.test.ts                   — NEW envelope schedule assertions (mock AudioParam)
tests/midiPreview.test.ts                   — CC64 extends oscillator duration
tests/soundfontPlayer.test.ts               — loop flags set when metadata present
tests/soundfontLoopLoader.test.ts           — NEW parse/map/soft-fail
ARCHITECTURE.md, CHANGELOG.md                — playback contract + Unreleased Fixed
scripts/bundle-soundfonts.mjs                — download *-loop.json with FluidR3 core/demo set
```

## Phases & checklist

### Phase 1: Shared ADSR + oscillator sustain parity

- [x] Add `src/audio/noteEnvelope.ts` with documented defaults and
      `applyNoteEnvelope(param, opts)`.
- [x] Wire envelope into `MidiPreviewPlayer.schedule` and
      `SoundfontPlayer.scheduleSample` (replace the 2-ramp curve).
- [x] Teach `MidiPreviewPlayer` to use `buildSustainWindows` /
      `getSustainedDuration` / `sustainEventsForChannel` (same as sample path).
- [x] Unit tests: envelope control-point times; oscillator path extends duration
      under CC64.

### Phase 2: Playback end / pedal tail

- [x] Add `playbackEndTime(score)` (max of note ends, sustain event times, and
      sustained note ends).
- [x] Use it for open-pedal clamp in players and for `app.ts` playhead completion
      (do not change visual mapper duration).
- [x] Tests: open pedal past last note-off; closed pedal-up after last note.

### Phase 3: Sample loop metadata + playback (default on)

- [x] Fetch/parse goldst `*-loop.json` in the patch loader: local bundled file →
      CacheStorage → CDN; soft-fail.
- [x] Attach loop points to `InstrumentPatch` keyed by MIDI number.
- [x] In `scheduleSample`, when points exist: **always** enable
      `loop` / `loopStart` / `loopEnd`; still `stop()` at `end + release`.
- [x] `gmLoopSlugs` map for known gleitz≠goldst names; tests for map + missing
      file soft-fail + player sets loop flags by default.
- [x] Manual smoke: held organ/cello/pad vs short piano note (piano may lack
      loop file — one-shot OK). Accepted by user 2026-07-25.

### Phase 4: Bundle loops + docs + validate

- [x] Extend `scripts/bundle-soundfonts.mjs` to download matching
      `*-loop.json` for every FluidR3 instrument it already fetches; document
      in script README / ARCHITECTURE; keep gitignore on assets.
- [x] Update `ARCHITECTURE.md` playback section (ADSR defaults, CC64 on both
      engines, loop metadata + bundle policy, default-on looping).
- [x] `CHANGELOG.md` Unreleased **Fixed** entries; SemVer **PATCH**.
- [x] `npm run validate` green (`bundle:soundfonts:verify` still offline-safe).

## Verification

- [x] Unit: envelope points (attack → decay → hold → release after `end`).
- [x] Unit: CC64 extends duration in both players.
- [x] Unit: `playbackEndTime` > visual duration when pedal trails.
- [x] Unit: loop JSON parse; sharp/flat key → same MIDI; 404 → null loops.
- [x] Unit: `scheduleSample` sets `loop` when metadata present (default on);
      leaves false when absent.
- [x] Bundler: verify mode accepts presence of loop JSON beside core `.js`.
- [x] Manual: Bach / pedal-heavy MIDI — pedal rings, no mid-hold fade-to-silence
      on long notes. Accepted by user 2026-07-25.
- [x] Manual: organ or cello held note remains audible past buffer length.
      Accepted by user 2026-07-25.
- [x] `npm run validate` passes.

## Open questions

- [x] **Bundle loop JSON?** Locked: **yes**, with FluidR3 core/demo set.
- [x] **Looping default?** Locked: **on** when metadata exists; no UI toggle.
- [x] Approve this plan before implementation? Approved 2026-07-25.
- [x] **Follow-up (not this plan):** Prefer a full SF2 synth (Spessa / FluidSynth WASM), not parse-only SF2 — tracked in `dev-docs/TO_DO.md`.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Loop clicks / zipper noise | med | med | Only loop with goldst points; short release; document |
| goldst slug ≠ gleitz slug | high | med | Explicit map + soft-fail |
| goldst CDN / branch availability | low | low | **Bundled** core loops; CDN only for extras |
| Envelope too “synthy” on piano | med | low | sustainLevel 1.0 + short release; no long artificial decay |
| Visual scrubber vs audio tail mismatch | low | low | Use `playbackEndTime` for playhead completion |
| Future SF2 engine still needed | med | — | Document as follow-up; don’t expand this PATCH |

## Implementation notes for agents

1. Do not mark checklist items done until tests confirm the behavior.
2. Temporary backups of edited `src/audio/**` files go under gitignored
   `.context/backups/` (or `tmp/`) per project refactor rule; delete after
   verify.
3. Do not edit tests solely to force green; if a test fails for a real product
   reason, stop and report.
4. Codeguard: no hardcoded credentials; loop CDN URLs are public asset paths only.
