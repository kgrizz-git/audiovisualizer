# Plan: General MIDI Routing Completion

Last reviewed: 2026-07-24
Date: 2026-07-24
Author: Codex
Status: draft
Linked issue/PR: n/a

## Goal

Complete practical General MIDI playback routing: honor program changes within a track,
provide correct channel-10 percussion behavior, and make engine/bank selection configurable
per track with sensible metadata-driven defaults.

## Out of scope

- Rendering a notation/percussion staff.
- Offline WAV export and audio transcription.

## Approach

Expand normalized track events to include program changes, then let `VoiceRouter` resolve
engine, bank, and patch at scheduling time. Keep defaults backward compatible and treat
channel 10 as percussion regardless of melodic program metadata.

## Proposed file changes

```
src/core/midi/*, src/core/types.ts           — normalized program-change events
src/audio/soundfont/*                        — channel-10 and time-aware patch routing
src/ui/app.ts                                — per-track engine/bank controls and status
tests/*                                      — parser, router, and scheduling coverage
ARCHITECTURE.md, README.md, CHANGELOG.md     — playback contract and support matrix
```

## Phases & checklist

### Phase 1: Normalization and routing

- [ ] Parse and normalize mid-track MIDI program changes.
- [ ] Resolve scheduled notes against the program active at their onset.
- [ ] Add channel-10 percussion patch routing with safe synth fallback.

### Phase 2: Per-track controls

- [ ] Add per-track engine and bank overrides without changing global defaults.
- [ ] Derive opt-in bank suggestions from track names/instrument metadata.
- [ ] Surface per-track patch loading/fallback status.

## Verification

- [ ] Program-change, percussion, and fallback tests cover deterministic routing.
- [ ] Manual playback smoke covers mixed melodic/percussion scores.
- [ ] `npm run validate` passes.
