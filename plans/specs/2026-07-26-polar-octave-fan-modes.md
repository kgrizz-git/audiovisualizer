# Design Spec: Polar Octave-Fan Modes (2D & 3D)

Date: 2026-07-26
Status: Draft — visual rules and mapping contract locked; implementation plan TBD

## Overview

A new visualization family in which **pitch controls direction and duration controls
length**, instead of the existing interval-plus-heading path used by `lines` and `circles`.

- Each note is drawn as a single straight line segment originating at the score center.
- The segment's **angle** is set by the note's pitch class: an octave spans the full 360°,
  so each semitone advances 30° and pitch classes "wrap" onto the same 12 spokes. All C's
  point in the same direction; C♯/D♭ the next 30°; etc.
- The segment's **Euclidean length** is proportional to the note's duration (scaled by the
  existing `lengthScale`).
- **Chords** (multiple simultaneous onsets in one voice) draw as multiple segments fanning
  from a shared start — one spoke per pitch class, each long enough for its own duration. No
  chord-specific clustering is applied; the polar encoding *is* the chord layout.
- **Voices** all start at the center and radiate outward; the cursor never "walks forward"
  as in the interval-path modes. Two simultaneous voices occupying the same pitch class
  overlap exactly along the same spoke — that overlap is intentional and is the visual
  signal of unison (see §4.2 for the dedup policy decision).

Comes in two variants sharing the same XY mapping:

- `polar_fan` — 2D Canvas/SVG `"polar fan"` mode (added to `Variation`).
- `3d_polar_fan` — 3D Three.js mode that lifts the same XY through depth along Z by note
  onset, exactly like `3d_lines` reuses the 2D `lines` path. `3d_piano_roll` already
  bypasses the 2D mapper; this mode does **not**.

## 1. Coordinate mapping

| Quantity | Mapping |
|---|---|
| Segment start | Center of the canvas — `(width/2, height/2)` after `fitGeometryToCanvas` padding is applied symmetrically. Per-voice staggering is **not** added: all voices share one origin. |
| Segment angle θ | `((pitchClass) × 30°) mod 360°`, where `pitchClass = midiPitch mod 12`. Measured clockwise from +X (the existing `scoreMapper` angle convention). Pitch class 0 (C) → 0°. |
| Segment length L | `note.duration × lengthScale` (seconds × the existing `RuleConfig.lengthScale`), then scaled by `fitGeometryToCanvas` so the longest note fits the canvas. Duration is post-normalization seconds — the same duration quantity used everywhere else in the mapper. |
| Segment end | `start + (L cos θ, L sin θ)` |
| Color | Existing `getNoteColor(note, config)` — pitch hue / velocity, unchanged. |
| Width | Existing per-voice `clusterWidth()`-style stroke width, unchanged. |
| 3D Z (for `3d_polar_fan`) | `note.onset × zScale` (same as `3d_lines`); Z extent is `note.duration × zScale`. |

### 1.1 Why pitch class, not absolute MIDI

Pitch-class mod 360° means every octave lands on the same 12 spokes. This produces a
"rose" or "wind rose" reading of the score: a tonal center is whichever spoke is longest,
and key relationships show up as spoke dominance rather than as a slowly rotating sweep.
Absolute-MIDI mod 360° was considered (looks like a spiral) and rejected — the spec's goal
is to make **octave equivalence** legible, which only the modular mapping achieves.

### 1.2 Why a shared origin (no per-voice staggering)

The user briefing was explicit: "voices start at the center and move out". Staggering
origins would let multiple voices be visually distinguishable, but it would also destroy
the unison-collisions that this mapping is intended to surface. Per-voice distinction is
carried by **color** (existing voice → hue family) and **stroke width** (existing per-voice
weight), not by spatial separation.

### 1.3 Why length = Euclidean length

The segment is rotated by θ *and* has a "heading" (the direction it points). Taking
Euclidean length = duration, regardless of heading, means a half note is geometrically half
the length of a whole note on the same spoke. The alternative (radial extent = duration)
would force segments to extend only outward and never diagonally inward — but with all
spokes radiating outward from center anyway, that constraint is automatic, so the two
definitions coincide. Euclidean is the simpler contract and matches duration-reading
intuition; radial-extent would only differ if we later introduced negative-length
gaps (not in this spec).

## 2. Sequencing — chords, succession, rests

### 2.1 Chords (simultaneous onsets in one voice)

Each simultaneous note in a voice emits its own segment; all share the same start (the
center). The resulting visual is a fan of segments — one per pitch class in the chord,
each long enough for its own duration. No chord-specific clustering is applied; the polar
encoding *is* the chord layout.

### 2.2 Succession (one note after another in one voice)

The line for each note still originates at the center, not at the previous note's
endpoint — this is **not** the interval-path behavior of `lines`. The pitch-direction
mapping is what carries the melody; consecutive notes show up as a sequence of distinct
spokes being "painted" outward, with earlier spokes shortening as durations shrink.

### 2.3 Rests

Rests produce no segment. Two notes that would draw on the same spoke simply draw end-to-
end in time; their geometries overlap identically (the spoke is "repainted"). The
resulting spoke length equals the longer of the two notes — the voice-route dedup policy in
§4.2 handles this.

### 2.4 Gap policy

Because segments always originate at the center, the `gapPolicy` setting is **not
consulted** for `polar_fan` or `3d_polar_fan`. There is no path "gap" to bridge when the
cursor never moves between notes. Existing per-note role coloring (`role: 'attack' | 'body'
| 'release'`) is preserved — each segment is broken into the same three sub-segments as
`lines` so release tails and onset attacks render consistently. Strokes for the role
segments all lie on the same spoke (same θ, successively shorter L for attack/body/release).

## 3. Out of scope

- **3D-only variants beyond `3d_polar_fan`.** No `3d_polar_fan_spheres`; the 2D mode has no
  `circles` analog and adding one would require a separate spec.
- **Per-voice radial offset.** Considered and rejected per §1.2.
- **Note halos (`circles`) variant.** This mapping is line-segment-shaped by construction.
  A halo version would be a separate "polar rings" spec.
- **SVG/plotter export parity specifics** beyond what 2D already guarantees — the new 2D
  variant follows the existing 2D export path automatically; 3D follows the existing 3D
  PNG/WebM path.
- **Octave-as-radius encoding.** Octave number is *not* folded into a radial band. All
  octave-N notes of the same pitch class land on the same spoke; a higher octave does not
  push the segment further out. (The spoke length is duration, not octave.) If
  octave-aware radial encoding becomes desirable, it goes in a separate spec.

## 4. Open questions (resolved at draft time)

### 4.1 Pitch direction reference (clockwise sense)

Pending visual sanity check during implementation: should pitch class 0 (C) point right
(+X, θ = 0°) or up (−Y)? The mapper already uses clockwise-from-+X, so this spec defaults
to right. Reversible in the mapper without touching the geometry contract if a "C up"
reading is more intuitive.

### 4.2 Voice-route dedup (simultaneous same-spoke coincident segments)

Two or more notes in different voices with the same onset, same pitch class, and same
duration produce exactly overlapping segments. The intervals render on top of each other
and only the topmost color shows — equivalent to the existing `lines` overlap behavior.
Plan should specify whether to:

- (a) continue rendering both (current default fallback — visually a single spoke at that
  pitch with the top-sorted color), or
- (b) dedup geometry for that spoke and emit the strongest (highest velocity) note only,
  reducing draw work on dense chorales.

**Spec default:** (a). The mapper stays pure and deterministic by keeping every note's
geometry; dedup is a renderer concern, mirroring how `lines` already overlaps coincident
intervals. If perf work later shows that dense scores regress, add a renderer-side
instancing optimization that bubbles the dominant color, *without* changing the mapper.

### 4.3 Same-pitch class, different octaves, same voice

Two notes in one voice with the same pitch class but different octaves (e.g. C4 and C5)
draw on the **same spoke** at the **same time** (if they overlap musically). Higher
      octave does not push the segment further. The spoke will then carry whichever segment is
      rendered last (painter's order), so the longer-duration note dominates visually — this is
      the desired behavior: longer duration ⇒ longer spoke ⇒ "wins" the spoke, which is the
      reader-comprehensible visual. (See open question 4.4 below for the alternative.)

### 4.4 Could octave disambiguation be optional?

Possibly: an `octaveFanRing` boolean that wraps octave number as a small radial offset so
C4 starts at radius 0, C5 starts at radius r₀, etc. Out of scope for this spec; if needed,
separate spec. The v1 reading — "every C is a C" — is the more musical default.

## 5. Domain contract additions

Will be added to `src/core/types.ts` and documented in `ARCHITECTURE.md` (`scoreMapper`
contract section) when the implementation plan lands:

- `Variation` extended with `'polar_fan' | '3d_polar_fan'`.
- `is3DVariation()` extended to include `'3d_polar_fan'`.
- `base2DVariation('3d_polar_fan')` returns `'polar_fan'` (mirrors existing 3D-from-2D
  routing in `src/core/mapper/map3d.ts:29`).
- `DEFAULT_CONFIG` and `DEFAULT_VIEWPORT_3D` already cover the shared
  `lengthScale`/`zScale` knobs; no new config field introduced by this spec.
- `gapPolicy` is documented as not consulted for these two variations (see §2.4).

## 6. Verification

- Determinism: same score+config → identical XY (and XYZ) geometry, verified by a
  Vitest unit test mirroring `tests/map3d.test.ts`.
- Spec-correctness cases the implementation plan must cover:
  - C-major triad (C4/E4/G4 simultaneous) produces three segments at 0°, 80°, 140°
    (mod 360°); clarifies that simultaneous-onset chord → fan, not a cluster.
  - A two-octave descending run (C5 → C4) in one voice paints the same spoke twice in
    succession; the spoke length decreases when the shorter note (if any) is reached.
  - Two voices both playing middle C simultaneously overlap exactly — unison visual.
  - `3d_polar_fan`: identical XY to `polar_fan`; Z extent per segment equals duration ×
    zScale (same contract as `3d_lines`).

## 7. SemVer impact

Two new user-facing variations across 2D and 3D. No breaking change to existing modes.
**MINOR**.
