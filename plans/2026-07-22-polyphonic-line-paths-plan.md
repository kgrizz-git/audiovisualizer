# Polyphonic Line Paths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bake time-true joins and chord fans into `lines` geometry so overlapping notes branch correctly in preview and export, with `chordLayout: 'polyphony'` as the default and `'chain'` as the legacy escape hatch.

**Architecture:** Extract a deterministic polyphonic layout helper (`mapPolyphonicLineSegments`) that clusters near-simultaneous onsets, fans branches using the same interval-angle rule as the UI, and joins later notes at the centroid of still-active tip positions. `mapScoreToGeometry` chooses polyphony vs today’s sequential chain from `RuleConfig.chordLayout`. Canvas drawing stays unchanged.

**Tech Stack:** TypeScript, Vitest, existing mapper/UI (`scoreMapper`, `RuleConfig`, `index.html`, `app.ts`).

**Spec:** [`plans/2026-07-22-polyphonic-line-paths.md`](2026-07-22-polyphonic-line-paths.md)

## Global Constraints

- Keep the MIDI parser and score-to-geometry mapper deterministic and side-effect free.
- Polyphony applies to `lines` only; circles / vertical_tone / tonal_time_lines unchanged.
- Default `chordLayout` is `'polyphony'`; `'chain'` must preserve pre-change sequential geometry.
- Fan / turn angles use `(pitch − referencePitch) × (angleScale / 12) + spiralBias` when interval turns are on.
- Onset cluster window is **0.040** seconds after optional quantization.
- Update `DESIGN.md` when changing visual rules; update `ARCHITECTURE.md` for the `RuleConfig` contract; add CHANGELOG + semver note (minor).
- Run `npm run validate` before handoff.
- Do not commit unless the user explicitly asks (ignore per-task commit steps if not requested).

---

### Task 1: `chordLayout` type and default config

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/mapper/scoreMapper.ts` (`DEFAULT_CONFIG`)
- Test: `tests/mapper.polyphony.test.ts` (create; smoke assert default)

**Interfaces:**
- Produces: `export type ChordLayout = 'chain' | 'polyphony'`
- Produces: `RuleConfig.chordLayout: ChordLayout`
- Produces: `DEFAULT_CONFIG.chordLayout === 'polyphony'`

- [ ] **Step 1: Write the failing test**

Create `tests/mapper.polyphony.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../src/core/mapper/scoreMapper.js';

describe('polyphonic line paths', () => {
  it('defaults chordLayout to polyphony', () => {
    expect(DEFAULT_CONFIG.chordLayout).toBe('polyphony');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/mapper.polyphony.test.ts`
Expected: FAIL (property missing / undefined).

- [ ] **Step 3: Write minimal implementation**

In `src/core/types.ts`, add next to other rule unions:

```typescript
export type ChordLayout = 'chain' | 'polyphony';
```

Add to `RuleConfig`:

```typescript
chordLayout: ChordLayout;
```

In `DEFAULT_CONFIG` inside `src/core/mapper/scoreMapper.ts`:

```typescript
chordLayout: 'polyphony',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/mapper.polyphony.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** (only if user requested commits)

```bash
git add src/core/types.ts src/core/mapper/scoreMapper.ts tests/mapper.polyphony.test.ts
git commit -m "$(cat <<'EOF'
feat(mapper): add chordLayout config defaulting to polyphony

EOF
)"
```

---

### Task 2: Pure helpers — cluster, median, tip lerp, centroid

**Files:**
- Create: `src/core/mapper/polyphonicLines.ts`
- Modify: `tests/mapper.polyphony.test.ts`

**Interfaces:**
- Consumes: `NoteEvent`, `Point2D` from `src/core/types.ts`
- Produces:
  - `export const CHORD_ONSET_WINDOW_SECONDS = 0.04`
  - `export function clusterNotesByOnset(notes: NoteEvent[], windowSeconds?: number): NoteEvent[][]`
  - `export function medianPitch(pitches: number[]): number`
  - `export function tipPointAt(start: Point2D, end: Point2D, tipOnset: number, tipDuration: number, t: number): Point2D`
  - `export function centroid(points: Point2D[]): Point2D`

- [ ] **Step 1: Write the failing tests**

Append to `tests/mapper.polyphony.test.ts`:

```typescript
import {
  CHORD_ONSET_WINDOW_SECONDS,
  clusterNotesByOnset,
  medianPitch,
  tipPointAt,
  centroid,
} from '../src/core/mapper/polyphonicLines.js';
import { NoteEvent } from '../src/core/types.js';

function note(partial: Partial<NoteEvent> & Pick<NoteEvent, 'id' | 'pitch' | 'onset' | 'duration'>): NoteEvent {
  return {
    velocity: 100,
    voice: 0,
    pitchClass: partial.pitch % 12,
    ...partial,
  };
}

describe('polyphonic helpers', () => {
  it('clusters notes within the 40ms onset window', () => {
    expect(CHORD_ONSET_WINDOW_SECONDS).toBe(0.04);
    const clusters = clusterNotesByOnset([
      note({ id: 'a', pitch: 60, onset: 0, duration: 1 }),
      note({ id: 'b', pitch: 64, onset: 0.03, duration: 1 }),
      note({ id: 'c', pitch: 67, onset: 0.1, duration: 1 }),
    ]);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].map((n) => n.id)).toEqual(['a', 'b']);
    expect(clusters[1].map((n) => n.id)).toEqual(['c']);
  });

  it('sorts each cluster by pitch ascending', () => {
    const [cluster] = clusterNotesByOnset([
      note({ id: 'hi', pitch: 67, onset: 0, duration: 1 }),
      note({ id: 'lo', pitch: 60, onset: 0.01, duration: 1 }),
    ]);
    expect(cluster.map((n) => n.id)).toEqual(['lo', 'hi']);
  });

  it('computes median pitch for odd and even counts', () => {
    expect(medianPitch([60, 64, 67])).toBe(64);
    expect(medianPitch([60, 64])).toBe(62);
  });

  it('lerps tip position by musical time along the segment', () => {
    const point = tipPointAt({ x: 0, y: 0 }, { x: 100, y: 0 }, 0, 1, 0.25);
    expect(point.x).toBeCloseTo(25);
    expect(point.y).toBeCloseTo(0);
  });

  it('averages tip positions for centroid joins', () => {
    expect(centroid([{ x: 0, y: 0 }, { x: 10, y: 20 }])).toEqual({ x: 5, y: 10 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/mapper.polyphony.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `src/core/mapper/polyphonicLines.ts`:

```typescript
/**
 * Polyphonic line-path layout helpers and mapper.
 *
 * Inputs: quantized NoteEvent lists, RuleConfig (angleScale, spiralBias, interval turns,
 * lengthScale, minSegmentLength, gapPolicy), origin cursor/heading.
 * Outputs: GeometrySegment[] with time-true joins and chord fans for lines mode.
 * Requirements: deterministic, no I/O; cluster window 40ms; fan angles match interval UI.
 */
import { GeometrySegment, NoteEvent, Point2D, RuleConfig } from '../types.js';

export const CHORD_ONSET_WINDOW_SECONDS = 0.04;

export function clusterNotesByOnset(
  notes: NoteEvent[],
  windowSeconds: number = CHORD_ONSET_WINDOW_SECONDS,
): NoteEvent[][] {
  const sorted = [...notes].sort((a, b) => a.onset - b.onset || a.id.localeCompare(b.id));
  const clusters: NoteEvent[][] = [];
  for (const note of sorted) {
    const open = clusters[clusters.length - 1];
    if (!open || note.onset - open[0].onset > windowSeconds) {
      clusters.push([note]);
    } else {
      open.push(note);
    }
  }
  return clusters.map((cluster) => [...cluster].sort((a, b) => a.pitch - b.pitch || a.id.localeCompare(b.id)));
}

export function medianPitch(pitches: number[]): number {
  if (pitches.length === 0) return 0;
  const sorted = [...pitches].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function tipPointAt(
  start: Point2D,
  end: Point2D,
  tipOnset: number,
  tipDuration: number,
  t: number,
): Point2D {
  const duration = Math.max(tipDuration, 0.01);
  const fraction = Math.min(1, Math.max(0, (t - tipOnset) / duration));
  return {
    x: start.x + (end.x - start.x) * fraction,
    y: start.y + (end.y - start.y) * fraction,
  };
}

export function centroid(points: Point2D[]): Point2D {
  if (points.length === 0) return { x: 0, y: 0 };
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}
```

(Leave `mapPolyphonicLineSegments` for Task 3.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/mapper.polyphony.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** (only if user requested commits)

```bash
git add src/core/mapper/polyphonicLines.ts tests/mapper.polyphony.test.ts
git commit -m "$(cat <<'EOF'
feat(mapper): add polyphonic clustering and join helpers

EOF
)"
```

---

### Task 3: `mapPolyphonicLineSegments` + wire into `mapScoreToGeometry`

**Files:**
- Modify: `src/core/mapper/polyphonicLines.ts`
- Modify: `src/core/mapper/scoreMapper.ts` (lines branch)
- Modify: `tests/mapper.polyphony.test.ts`
- Modify: `tests/mapper.test.ts` (pin legacy expectations with `chordLayout: 'chain'` where geometry must match old sequential behavior)

**Interfaces:**
- Consumes: helpers from Task 2; gap helpers already in `scoreMapper` (export or duplicate minimal gap logic in polyphonic module to avoid circular imports — prefer exporting `getGapDuration` / gap segment helpers from `scoreMapper` **or** inline the same gap formulas in `polyphonicLines.ts`)
- Produces: `mapPolyphonicLineSegments(notes, config, originCursor, originHeading): GeometrySegment[]`
- `mapScoreToGeometry`: if `variation === 'lines' && chordLayout === 'polyphony'`, use polyphonic mapper; if `'chain'`, keep existing sequential loop

**Algorithm (implement exactly):**

```
activeTips = []
cursor = originCursor
baseHeading = originHeading
prevMedian = null
segments = []

for cluster of clusterNotesByOnset(notes):
  t = cluster[0].onset
  // Drop ended tips; if any dropped and activeTips becomes empty, set cursor to
  // centroid of the dropped tips' end points (so silence/gap has a known pen position).
  dropped = tips with soundingUntil <= t
  remove dropped from activeTips
  if dropped.length && activeTips.length === 0:
    cursor = centroid(dropped.map(end))

  if activeTips.length === 0:
    // optional gap from cursor using previous sounding end → t (only true silence)
    // Use lastDroppedEnd time / same getGapDuration pattern between
    // synthetic previous end and cluster onset when a gap exists.
    join = cursor
  else if activeTips.length === 1:
    tip = activeTips[0]
    join = tipPointAt(tip.start, tip.end, tip.onset, tip.duration, t)
  else:
    join = centroid(activeTips.map(tip => tipPointAt(...)))

  median = medianPitch(cluster.map(n => n.pitch))
  if prevMedian !== null && config.intervalAngleEnabled:
    baseHeading += (median - prevMedian) * (config.angleScale / 12) + config.spiralBias
  // first cluster keeps origin heading

  for note of cluster:  // already pitch-sorted
    heading = config.intervalAngleEnabled
      ? baseHeading + (note.pitch - median) * (config.angleScale / 12) + config.spiralBias
      : baseHeading
    // Note: spiralBias already applied to baseHeading between clusters; within-cluster
    // offset uses interval only — apply spiralBias once per heading formula as in spec:
    // heading = baseHeading + (pitch - median) * (angleScale/12) + spiralBias when turns on.
    // To avoid double-counting spiralBias on baseHeading updates, apply spiralBias only in
    // the heading assignment formulas (cluster-to-cluster and within-cluster), not both
    // additively twice. Concrete rule:
    //   between clusters: baseHeading += (median - prevMedian) * (angleScale/12) + spiralBias
    //   within cluster:   heading = baseHeading + (pitch - median) * (angleScale/12)
    //   (spiralBias already folded into baseHeading for this cluster)
    // When turns off: heading = baseHeading for all.

    len = max(minSegmentLength, note.duration * lengthScale)
    end = { x: join.x + cos(heading)*len, y: join.y + sin(heading)*len }
    push segment
    activeTips.push({ noteId, pitch, start: join, end, onset, duration, soundingUntil: onset+duration })

  prevMedian = median
  cursor = centroid(activeTips.map(tip => tip.end)) // pen rest position among live ends

return segments
```

**Gap handling:** Reuse the same gap semantics as chain mode, but only when `activeTips` is empty before a cluster and there is positive silence since the previous note/cluster ended. Prefer importing shared gap helpers; if that forces awkward exports, copy the small `getGapDuration` / gap segment construction currently in `scoreMapper.ts` into `polyphonicLines.ts` and keep behavior identical for `'ghost'` / `'faint_line'` / `'lift_pen'`.

- [ ] **Step 1: Write the failing behavior tests**

Append to `tests/mapper.polyphony.test.ts`:

```typescript
import { mapScoreToGeometry, DEFAULT_CONFIG } from '../src/core/mapper/scoreMapper.js';

describe('mapScoreToGeometry polyphony', () => {
  it('starts a staggered overlapping note at the time-true point on the previous segment', () => {
    const score = {
      title: 'Overlap', duration: 2, bpm: 120,
      tracks: [{ name: 'Lead', channel: 0, program: 0, instrumentName: 'Piano', notes: [
        note({ id: 'a', pitch: 60, onset: 0, duration: 1, pitchClass: 0 }),
        note({ id: 'b', pitch: 64, onset: 0.5, duration: 0.5, pitchClass: 4 }),
      ] }],
    };
    const geometry = mapScoreToGeometry(score, { ...DEFAULT_CONFIG, variation: 'lines', chordLayout: 'polyphony', intervalAngleEnabled: false }, 800, 800);
    const [first, second] = geometry.voicePaths[0].segments.filter((s) => s.role !== 'gap');
    expect(second.start.x).toBeCloseTo(first.start.x + (first.end.x - first.start.x) * 0.5);
    expect(second.start.y).toBeCloseTo(first.start.y + (first.end.y - first.start.y) * 0.5);
    expect(second.start.x).not.toBeCloseTo(first.end.x);
  });

  it('fans same-onset chord tones from one join using interval angle offsets', () => {
    const score = {
      title: 'Chord', duration: 2, bpm: 120,
      tracks: [{ name: 'Lead', channel: 0, program: 0, instrumentName: 'Piano', notes: [
        note({ id: 'c', pitch: 60, onset: 0, duration: 1, pitchClass: 0 }),
        note({ id: 'e', pitch: 64, onset: 0, duration: 1, pitchClass: 4 }),
        note({ id: 'g', pitch: 67, onset: 0, duration: 1, pitchClass: 7 }),
      ] }],
    };
    const geometry = mapScoreToGeometry(score, { ...DEFAULT_CONFIG, variation: 'lines', chordLayout: 'polyphony', angleScale: 180 }, 800, 800);
    const segs = geometry.voicePaths[0].segments.filter((s) => s.role !== 'gap');
    expect(segs).toHaveLength(3);
    expect(segs[0].start).toEqual(segs[1].start);
    expect(segs[1].start).toEqual(segs[2].start);
    // median 64: offsets -4, 0, +3 semitones → headings 0-60, 0, 0+45 with default L→R heading 0
    expect(segs[1].end.y).toBeCloseTo(segs[1].start.y); // median branch straight
    expect(segs[0].end.y).toBeLessThan(segs[0].start.y); // lower pitch turns negative
    expect(segs[2].end.y).toBeGreaterThan(segs[2].start.y);
  });

  it('joins the next note at the centroid of still-active tips after one chord tone ends', () => {
    const score = {
      title: 'Centroid', duration: 3, bpm: 120,
      tracks: [{ name: 'Lead', channel: 0, program: 0, instrumentName: 'Piano', notes: [
        note({ id: 'lo', pitch: 60, onset: 0, duration: 1.0, pitchClass: 0 }),
        note({ id: 'hi', pitch: 72, onset: 0, duration: 1.0, pitchClass: 0 }),
        note({ id: 'mid', pitch: 66, onset: 0, duration: 0.4, pitchClass: 6 }), // ends before next
        note({ id: 'next', pitch: 64, onset: 0.5, duration: 0.5, pitchClass: 4 }),
      ] }],
    };
    const geometry = mapScoreToGeometry(score, { ...DEFAULT_CONFIG, variation: 'lines', chordLayout: 'polyphony', intervalAngleEnabled: false }, 800, 800);
    const segs = geometry.voicePaths[0].segments.filter((s) => s.role !== 'gap');
    const lo = segs.find((s) => s.note.id === 'lo')!;
    const hi = segs.find((s) => s.note.id === 'hi')!;
    const next = segs.find((s) => s.note.id === 'next')!;
    const loMid = {
      x: lo.start.x + (lo.end.x - lo.start.x) * 0.5,
      y: lo.start.y + (lo.end.y - lo.start.y) * 0.5,
    };
    const hiMid = {
      x: hi.start.x + (hi.end.x - hi.start.x) * 0.5,
      y: hi.start.y + (hi.end.y - hi.start.y) * 0.5,
    };
    expect(next.start.x).toBeCloseTo((loMid.x + hiMid.x) / 2);
    expect(next.start.y).toBeCloseTo((loMid.y + hiMid.y) / 2);
  });

  it('uses parallel headings within a cluster when interval turns are off', () => {
    const score = {
      title: 'Parallel', duration: 1, bpm: 120,
      tracks: [{ name: 'Lead', channel: 0, program: 0, instrumentName: 'Piano', notes: [
        note({ id: 'a', pitch: 60, onset: 0, duration: 1, pitchClass: 0 }),
        note({ id: 'b', pitch: 67, onset: 0, duration: 1, pitchClass: 7 }),
      ] }],
    };
    const geometry = mapScoreToGeometry(score, { ...DEFAULT_CONFIG, variation: 'lines', chordLayout: 'polyphony', intervalAngleEnabled: false }, 800, 800);
    const [a, b] = geometry.voicePaths[0].segments.filter((s) => s.role !== 'gap');
    expect(a.end.y - a.start.y).toBeCloseTo(b.end.y - b.start.y);
    expect(a.end.x - a.start.x).toBeCloseTo(b.end.x - b.start.x);
  });

  it('preserves sequential chain geometry when chordLayout is chain', () => {
    const score = {
      title: 'Chain', duration: 2, bpm: 120,
      tracks: [{ name: 'Lead', channel: 0, program: 0, instrumentName: 'Piano', notes: [
        note({ id: 'a', pitch: 60, onset: 0, duration: 1, pitchClass: 0 }),
        note({ id: 'b', pitch: 64, onset: 0.5, duration: 0.5, pitchClass: 4 }),
      ] }],
    };
    const chain = mapScoreToGeometry(score, { ...DEFAULT_CONFIG, variation: 'lines', chordLayout: 'chain', intervalAngleEnabled: false }, 800, 800);
    const [first, second] = chain.voicePaths[0].segments.filter((s) => s.role !== 'gap');
    expect(second.start.x).toBeCloseTo(first.end.x);
    expect(second.start.y).toBeCloseTo(first.end.y);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/mapper.polyphony.test.ts`
Expected: FAIL on polyphony behavior assertions (helpers may already pass).

- [ ] **Step 3: Implement `mapPolyphonicLineSegments` and wire it**

1. Implement full `mapPolyphonicLineSegments` in `polyphonicLines.ts` per algorithm above (include color/width/opacity using the same formulas as `scoreMapper` — import `getNoteColor` from `scoreMapper.js` **only if** that does not create a cycle; if it does, accept color/stroke helpers as parameters or move `getNoteColor` to a tiny shared module. Preferred: pass `getColor: (note) => string` or import `getNoteColor` from `scoreMapper` if `scoreMapper` imports polyphonic only inside the lines branch after function declarations — simplest fix: keep `getNoteColor` in `scoreMapper` and pass color into segment builder from the caller, **or** duplicate the one-line HSL call by importing from a new `noteColor.ts`. YAGNI choice: export `getNoteColor` from `scoreMapper.ts` and have `polyphonicLines` import it; have `scoreMapper` import `mapPolyphonicLineSegments` — if bundler/TS cycle fails, move `getNoteColor` + `getMappedHue` to `src/core/mapper/noteColor.ts` first.

2. In `mapScoreToGeometry` lines branch:

```typescript
if (config.variation === 'lines') {
  if (config.chordLayout === 'polyphony') {
    const origin = getInitialCursor(...);
    const heading = getInitialHeading(...);
    segments.push(...mapPolyphonicLineSegments(notes, config, origin, heading));
  } else {
    // existing sequential cursor loop unchanged
  }
}
```

3. Update existing tests in `tests/mapper.test.ts` that assume sequential chaining under `DEFAULT_CONFIG` to set `chordLayout: 'chain'` **only** when the assertion requires legacy end-to-start chaining with overlaps. Non-overlapping fixtures should keep working under polyphony; if a test fails only due to default change, prefer fixing the fixture (no overlap) over forcing `chain`, unless the test explicitly documents legacy behavior.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/mapper.polyphony.test.ts tests/mapper.test.ts`
Expected: PASS.

If a test fails, stop and report the failure + proposed fix to the user before editing the test (project testing rule).

- [ ] **Step 5: Commit** (only if user requested commits)

```bash
git add src/core/mapper/polyphonicLines.ts src/core/mapper/scoreMapper.ts tests/mapper.polyphony.test.ts tests/mapper.test.ts
git commit -m "$(cat <<'EOF'
feat(mapper): lay out polyphonic line joins and chord fans

EOF
)"
```

---

### Task 4: UI control + legend

**Files:**
- Modify: `index.html` (path controls near gap policy)
- Modify: `src/ui/app.ts` (bind select → `currentConfig.chordLayout`)
- Modify: `src/core/legend/legendContent.ts`
- Test: `tests/legend.test.ts` if present; otherwise extend `tests/mapper.polyphony.test.ts` or add `tests/legendContent.test.ts`

**Interfaces:**
- Consumes: `ChordLayout` / `RuleConfig.chordLayout`
- Produces: UI select `chord-layout-select` with options `polyphony` (default selected) and `chain`

- [ ] **Step 1: Write legend expectation**

```typescript
import { getLegendContent } from '../src/core/legend/legendContent.js';
import { DEFAULT_CONFIG } from '../src/core/mapper/scoreMapper.js';

it('mentions branching joins in the line-path legend when polyphony is on', () => {
  const content = getLegendContent({ ...DEFAULT_CONFIG, variation: 'lines', chordLayout: 'polyphony' });
  expect(content.lines.some((line) => /branch|join|overlap/i.test(line))).toBe(true);
});

it('mentions sequential chaining when chordLayout is chain', () => {
  const content = getLegendContent({ ...DEFAULT_CONFIG, variation: 'lines', chordLayout: 'chain' });
  expect(content.lines.some((line) => /chain|sequential/i.test(line))).toBe(true);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/mapper.polyphony.test.ts`
Expected: FAIL on legend assertions.

- [ ] **Step 3: Implement UI + legend**

In `index.html`, after the gap-policy control:

```html
<div class="control-item">
  <label for="chord-layout-select">Chord layout</label>
  <select id="chord-layout-select">
    <option value="polyphony" selected>Polyphony (branch)</option>
    <option value="chain">Chain (legacy)</option>
  </select>
</div>
```

In `src/ui/app.ts` `bindEvents`, with other selects:

```typescript
this.select<ChordLayout>('chord-layout-select', (value) => { this.currentConfig.chordLayout = value; });
```

Import `ChordLayout` from types.

In `legendContent.ts` lines case, append a line:

```typescript
config.chordLayout === 'polyphony'
  ? 'Overlaps → branch from time-true join (centroid if many)'
  : 'Overlaps → sequential chain (legacy)',
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/mapper.polyphony.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** (only if user requested commits)

```bash
git add index.html src/ui/app.ts src/core/legend/legendContent.ts tests/mapper.polyphony.test.ts
git commit -m "$(cat <<'EOF'
feat(ui): expose chord layout control and legend copy

EOF
)"
```

---

### Task 5: Docs, changelog, validation gate

**Files:**
- Modify: `DESIGN.md`
- Modify: `ARCHITECTURE.md` (RuleConfig / playback-adjacent mapping contract)
- Modify: `CHANGELOG.md` (Unreleased — Added/Changed, SemVer **MINOR**)
- Modify: `package.json` version bump only if the project bumps on release from Unreleased; if version stays until release, document under Unreleased only (follow existing changelog pattern — currently Unreleased without bumping `package.json` yet, so **do not** bump `package.json` unless repo practice requires it; match recent export-title entries which stay under Unreleased)

- [ ] **Step 1: Update DESIGN.md**

Under variations / lines, add:

- `chordLayout` (`polyphony` default): near-simultaneous onsets (40 ms) fan from one join using the Interval turns / `angleScale` rule relative to the cluster median pitch; staggered overlaps fork from the time-true point on active tips; with multiple active tips the join is their centroid; `'chain'` restores sequential end-to-start layout.

- [ ] **Step 2: Update ARCHITECTURE.md**

Note that `RuleConfig` includes `chordLayout` and that line-path polyphony is resolved in the mapper (export-identical geometry), not in the canvas scrubber.

- [ ] **Step 3: Update CHANGELOG.md**

Under Unreleased:

```markdown
### Added
- Line-path **chord layout** control (`polyphony` | `chain`): polyphonic branching with
  time-true joins and 40 ms onset clustering; legacy sequential chain available.
  SemVer: **MINOR**.

### Changed
- Default line mapping uses polyphonic joins/fans instead of sequential chaining when
  notes overlap. Choose **Chain (legacy)** to restore the previous look. SemVer: **MINOR**.
```

- [ ] **Step 4: Run full validation**

Run: `npm run validate`
Expected: PASS (Vitest + `tsc` + Vite build).

If validation fails, report the failure and proposed fix; do not weaken tests to force green.

- [ ] **Step 5: Commit** (only if user requested commits)

```bash
git add DESIGN.md ARCHITECTURE.md CHANGELOG.md
git commit -m "$(cat <<'EOF'
docs: document polyphonic line paths and changelog entry

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| `chordLayout` type + default `polyphony` | 1 |
| 40 ms clustering, median, lerp, centroid | 2 |
| Time-true staggered join | 3 |
| Same-onset fan with `angleScale` | 3 |
| Centroid after partial chord release | 3 |
| Interval turns off → parallel | 3 |
| Legacy `chain` | 3 |
| UI select | 4 |
| Legend | 4 |
| DESIGN / ARCHITECTURE / CHANGELOG | 5 |
| `npm run validate` | 5 |
| Circles / other variations unchanged | 3 (no edits to those branches) |

## Execution Handoff

Plan complete and saved to `plans/2026-07-22-polyphonic-line-paths-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — run tasks in this session with checkpoints  

Which approach?
