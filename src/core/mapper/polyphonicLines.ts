/**
 * Polyphonic line-path layout helpers and mapper.
 *
 * Inputs: quantized NoteEvent lists, RuleConfig (angleScale, spiralBias, interval turns,
 * lengthScale, minSegmentLength, gapPolicy), origin cursor/heading.
 * Outputs: GeometrySegment[] with time-true joins and chord fans for lines mode.
 * Requirements: deterministic, no I/O; cluster window 40ms; fan angles match interval UI.
 */
import { NoteEvent, Point2D, RuleConfig, GeometrySegment } from '../types.js';

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

interface ActiveTip {
  noteId: string;
  pitch: number;
  start: Point2D;
  end: Point2D;
  onset: number;
  duration: number;
  soundingUntil: number;
}

function getNoteColorLocal(note: NoteEvent, config: RuleConfig): string {
  const sourceHue = config.pitchHueMode === 'pitch_class'
    ? (note.pitchClass / 12) * 360
    : (note.pitch * 7) % 360;
  const hue = (sourceHue + note.voice * config.hueOffsetPerVoice + 360) % 360;
  return `hsl(${Math.round(hue)}, 85%, 60%)`;
}

function advanceCursorForGapDuration(
  cursor: Point2D,
  gapDuration: number,
  heading: number,
  lengthScale: number,
): Point2D {
  if (gapDuration === 0) return cursor;
  const length = gapDuration * lengthScale;
  const radians = (heading * Math.PI) / 180;
  return { x: cursor.x + Math.cos(radians) * length, y: cursor.y + Math.sin(radians) * length };
}

function addPolyphonicGapSegment(
  segments: GeometrySegment[],
  cursor: Point2D,
  gapDuration: number,
  gapStart: number,
  heading: number,
  config: RuleConfig,
  previousNote: NoteEvent,
): Point2D {
  if (gapDuration === 0) return cursor;
  const end = advanceCursorForGapDuration(cursor, gapDuration, heading, config.lengthScale);
  if (config.gapPolicy === 'lift_pen') return end;
  const gapNote: NoteEvent = {
    ...previousNote,
    id: `${previousNote.id}-gap`,
    onset: gapStart,
    duration: gapDuration,
  };
  segments.push({
    start: { ...cursor },
    end,
    note: gapNote,
    role: 'gap',
    color: config.gapPolicy === 'ghost' ? '#94a3b8' : getNoteColorLocal(previousNote, config),
    width: Math.max(1, config.strokeWidthBase * 0.75),
    opacity: config.gapPolicy === 'ghost' ? 0.18 : 0.32,
    dashArray: config.gapPolicy === 'ghost' ? '3 8' : undefined,
  });
  return end;
}

/**
 * Maps a note list to line segments with time-true joins, chord fans, and centroid continuation.
 */
export function mapPolyphonicLineSegments(
  notes: NoteEvent[],
  config: RuleConfig,
  originCursor: Point2D,
  originHeading: number,
): GeometrySegment[] {
  const segments: GeometrySegment[] = [];
  const clusters = clusterNotesByOnset(notes);
  let activeTips: ActiveTip[] = [];
  let cursor = { ...originCursor };
  let baseHeading = originHeading;
  let prevMedian: number | null = null;
  let lastSoundingEnd: number | null = null;
  let lastNoteForGap: NoteEvent | null = null;

  for (const cluster of clusters) {
    const t = cluster[0].onset;

    const dropped = activeTips.filter((tip) => tip.soundingUntil <= t);
    if (dropped.length > 0) {
      activeTips = activeTips.filter((tip) => tip.soundingUntil > t);
      const droppedEnd = Math.max(...dropped.map((tip) => tip.soundingUntil));
      lastSoundingEnd = lastSoundingEnd === null ? droppedEnd : Math.max(lastSoundingEnd, droppedEnd);
      if (activeTips.length === 0) {
        cursor = centroid(dropped.map((tip) => tip.end));
      }
    }

    let join: Point2D;
    if (activeTips.length === 0) {
      if (lastSoundingEnd !== null && t > lastSoundingEnd && lastNoteForGap !== null) {
        const gapDuration = t - lastSoundingEnd;
        cursor = addPolyphonicGapSegment(
          segments,
          cursor,
          gapDuration,
          lastSoundingEnd,
          baseHeading,
          config,
          lastNoteForGap,
        );
      }
      join = { ...cursor };
    } else if (activeTips.length === 1) {
      const tip = activeTips[0];
      join = tipPointAt(tip.start, tip.end, tip.onset, tip.duration, t);
    } else {
      join = centroid(
        activeTips.map((tip) => tipPointAt(tip.start, tip.end, tip.onset, tip.duration, t)),
      );
    }

    const median = medianPitch(cluster.map((n) => n.pitch));
    if (prevMedian !== null && config.intervalAngleEnabled) {
      baseHeading += (median - prevMedian) * (config.angleScale / 12) + config.spiralBias;
    }

    for (const note of cluster) {
      const heading = config.intervalAngleEnabled
        ? baseHeading + (note.pitch - median) * (config.angleScale / 12)
        : baseHeading;
      const segmentLen = Math.max(config.minSegmentLength, note.duration * config.lengthScale);
      const rad = (heading * Math.PI) / 180;
      const end: Point2D = {
        x: join.x + Math.cos(rad) * segmentLen,
        y: join.y + Math.sin(rad) * segmentLen,
      };
      const strokeWidth = config.strokeWidthBase + (note.velocity / 127) * config.strokeWidthScale;
      segments.push({
        start: { ...join },
        end: { ...end },
        color: getNoteColorLocal(note, config),
        width: strokeWidth,
        opacity: 0.9,
        note,
      });
      activeTips.push({
        noteId: note.id,
        pitch: note.pitch,
        start: { ...join },
        end: { ...end },
        onset: note.onset,
        duration: note.duration,
        soundingUntil: note.onset + note.duration,
      });
      lastNoteForGap = note;
    }

    prevMedian = median;
    cursor = centroid(activeTips.map((tip) => tip.end));
  }

  return segments;
}
