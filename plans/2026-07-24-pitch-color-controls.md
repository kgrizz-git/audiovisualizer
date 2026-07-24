# Plan: Pitch and Voice Color Controls

Last reviewed: 2026-07-24
Date: 2026-07-24
Author: Codex
Status: draft
Linked issue/PR: n/a

## Goal

Make pitch/voice color encoding easier to read and art-direct by adding a per-voice color
mode, a usable pitch-color legend, and color-aware transposition. The same configuration
must render identically in Canvas, SVG, PNG, CLI manifests, and 3D modes where applicable.

## Out of scope

- Accessibility pattern overlays beyond the current legend treatment.
- MIDI playback pitch shifting; this plan changes visual mapping only unless explicitly
  expanded later.

## Approach

Extend `RuleConfig` with explicit color-source and transpose fields. Normalize transposed
notes inside the pure mapper before hue/color decisions, keeping original MIDI events intact.
Centralize legend swatches so Canvas and SVG describe the active color source consistently.

## Proposed file changes

```
src/core/types.ts, src/core/mapper/*         — color-source/transpose mapping contract
src/core/legend/*, src/renderers/*           — shared active-palette legend and backgrounds
src/ui/app.ts, index.html                    — color mode and transpose controls
src/cli/*                                    — reproducible flags and manifest serialization
tests/*                                      — color, transpose, legend, and SVG determinism
DESIGN.md, ARCHITECTURE.md, CHANGELOG.md     — rule semantics and user behavior
```

## Phases & checklist

### Phase 1: Color sources and legend

- [ ] Add pitch, register, and per-voice color sources with stable voice palette rules.
- [ ] Add a compact active-palette legend for Canvas and SVG.
- [ ] Use each track's mapped average color for black-background accents/highlights.

### Phase 2: Visual transposition

- [ ] Add bounded semitone transpose control and deterministic color-aware remapping.
- [ ] Preserve original note data while recording transpose in config/manifests.
- [ ] Add CLI parity for the new configuration.

## Verification

- [ ] Same score/config yields byte-stable SVG and identical mapper results.
- [ ] Legends accurately explain all color sources and transposition.
- [ ] `npm run validate` passes.
