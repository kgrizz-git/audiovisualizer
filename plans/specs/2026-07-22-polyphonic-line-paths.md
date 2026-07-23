# Design Spec: Polyphonic Line Paths

Last reviewed: 2026-07-22
Date: 2026-07-22
Status: implemented

## 1. Goal

Fix `lines` mode so that when a new note starts while another is still sounding, the
new segment begins at the time-true position on the active path—not at the finished
geometric end of the previous segment. Support real within-track polyphony (chords and
staggered overlaps common in single MIDI channels) by branching from shared join points.
Exported SVG/PNG geometry must match canvas scrubbing/playback.

## 2. Decisions (locked)

| Topic | Choice |
|---|---|
| Join vs export | Hybrid: time-true joins and chord fans are baked into `RenderedGeometry` |
| Chord continuation | No single spine; next join uses the **centroid** of still-active branch tips |
| Onset clustering | Near-simultaneous notes within a **40 ms** window form one fan; later overlaps fork |
| Layout control | `chordLayout: 'chain' \| 'polyphony'`; **default `'polyphony'`**; `'chain'` keeps legacy sequential cursor |
| Fan angles | Same UI interval rule as monophonic turns: `(pitch − referencePitch) × (angleScale / 12) + spiralBias` |
| Fan reference pitch | Median pitch of the cluster (stable, register-centered) |
| Interval turns off | All branches of a cluster share the current heading (parallel from the join) |

## 3. Control surface

Add to `RuleConfig`:

```typescript
chordLayout: 'chain' | 'polyphony'; // default 'polyphony'
```

- UI: select beside gap policy (path-controls group).
- Legend: when `polyphony`, note that overlapping notes branch from a join; when `chain`,
  note sequential chaining (legacy).

## 4. Geometry model (`chordLayout === 'polyphony'`)

Per track, the mapper maintains:

- **Active tips:** `{ noteId, pitch, start, end, onset, soundingUntil }[]`
- **Join point** at musical time `t` (after dropping tips with `soundingUntil ≤ t`):
  - 0 tips → current track cursor / origin
  - 1 tip → time-true point on that tip’s segment:  
    `lerp(start, end, clamp01((t − tip.onset) / tip.duration))`
  - 2+ tips → **centroid** of each tip’s time-true point at `t` (same lerp per tip)

### 4.1 Onset clusters

Use notes **after** optional onset quantization (same as today’s mapper). Sort by
`(onset, id)`. Greedily group into clusters: a note joins the open cluster if
`onset − clusterFirstOnset ≤ 0.040` seconds; otherwise start a new cluster. Within a
cluster, sort by pitch ascending for stable fan order.

### 4.2 Emitting a cluster

1. Drop tips with `soundingUntil ≤ clusterOnset` from the active set.
2. Compute join point from remaining tips (centroid / lerp rules above).
3. For each note in the cluster (pitch order):
   - Heading = `baseHeading + (pitch − medianPitch) * (angleScale / 12) + spiralBias`  
     when interval turns are enabled; else `baseHeading`.
   - `baseHeading` follows §4.4 (median-to-median interval turns between clusters).
   - Segment length = `max(minSegmentLength, duration × lengthScale)`.
   - Push segment `{ start: join, end: join + heading * length, note, … }`.
   - Register tip until `onset + duration`.
4. Gap policy between clusters: only when there is a true silence after all tips have
   ended and before the next onset—reuse existing `gapPolicy` / lift-pen / ghost rules
   from the join cursor along `baseHeading`. Do not insert gap segments while any tip is
   still active.

### 4.3 Staggered overlap (singleton “cluster”)

A note outside another’s 40 ms window but starting while tips remain active is a
one-note cluster: one branch from the time-true join/centroid at that onset.

### 4.4 Running heading

- After each cluster, set `baseHeading` from the interval between the previous cluster’s
  median pitch and this cluster’s median pitch (same `angleScale` / spiral rule), so the
  overall path still reads as melodic motion between chord events.
- First cluster uses the origin-mode initial heading.

### 4.5 Legacy `chain`

Preserve today’s behavior: one cursor, each note starts at the previous segment’s end
(after optional gap advance). No branching, no time-true mid-segment joins.

## 5. Playback and export

- Canvas progressive draw remains per-segment: fraction from `note.onset` to
  `note.onset + duration`.
- Because segment starts are already at time-true joins, a new note no longer appears at
  the finished tip of a still-growing previous segment.
- SVG/PNG consume the same `RenderedGeometry` (no playback-only warp).

## 6. Scope

**In scope**

- `lines` variation only
- `chordLayout` config + UI + legend
- Mapper algorithm, types, tests, DESIGN/ARCHITECTURE/CHANGELOG updates

**Out of scope**

- Circles, vertical_tone, tonal_time_lines polyphony
- Pedal/sustain wash, audio voice routing
- Splitting one MIDI track into separate logical voices for filtering

## 7. Verification

Vitest cases:

1. Overlapping staggered notes: second segment start equals lerp on first segment at
   second onset (not first segment end).
2. Same-onset (or ≤40 ms) triad: three segments share one start; headings differ by
   pitch × (`angleScale` / 12).
3. After one chord tone ends, next join uses centroid of remaining tips only.
4. `chordLayout: 'chain'` matches pre-change sequential geometry for a fixture.
5. Interval turns off → parallel headings within a cluster.

Validation gate: `npm run validate`.

## 8. Documentation impact

- `DESIGN.md` — document `chordLayout`, time-true joins, centroid continuation, 40 ms
  cluster window, fan = interval angle.
- `ARCHITECTURE.md` — `RuleConfig` contract if listed.
- Legend strings for line paths.
- `CHANGELOG.md` — minor feature (default behavior change for `lines`; note `chain` escape hatch).
- Semver: **minor** (`0.x` → feature + default behavior change with opt-out).
