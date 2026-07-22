# Plan: Playback Voices and Canvas Composition

Last reviewed: 2026-07-21
Date: 2026-07-21
Author: Codex
Status: complete
Linked issue/PR: n/a

## Goal

Make the MIDI audition useful for composition by exposing per-voice instrument, volume,
mute, and solo controls, while ensuring every generated score is framed intentionally
inside the export and preview canvas.

## Out of scope

- Downloadable soundfonts, exact General MIDI sample playback, and audio-file export.
- Freeform canvas editing or persistent saved presets.

## Approach

Keep playback local with Web Audio, using clearly named synth timbres assigned per
voice. Capture parser program metadata for future soundfont mapping. Add a pure,
uniform geometry-fit stage after mapping so preview and exports share deterministic,
safe canvas bounds.

## Phases & checklist

### Phase 1: Voice-aware playback

- [x] Preserve MIDI program metadata where available.
- [x] Add assignable timbre, gain, mute, and solo state per voice.
- [x] Schedule only audible voices in the local preview synth.

### Phase 2: Composition fitting

- [x] Add a pure bounds and uniform-fit module with padding.
- [x] Apply fitting consistently to preview, SVG, and PNG exports.
- [x] Add bounds-focused unit tests.

### Phase 3: Verification and handoff

- [x] Update the design contract and live backlog.
- [x] Run the full validation gate.

## Verification

- [x] Muted voices do not schedule audio; solo restricts playback to soloed voices.
- [x] All fitted segments and circles stay within configured canvas padding.
- [x] `npm run validate` passes.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Browser audio differs by platform | medium | medium | Keep the preview synth local and label its scope clearly. |
| Fit transform obscures mapping scale | low | medium | Use one uniform transform and preserve source geometry/config. |
