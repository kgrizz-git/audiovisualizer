/**
 * Polyphonic line-path layout helpers and mapper.
 *
 * Inputs: quantized NoteEvent lists, RuleConfig (angleScale, spiralBias, interval turns,
 * lengthScale, minSegmentLength, gapPolicy), origin cursor/heading.
 * Outputs: GeometrySegment[] with time-true joins and chord fans for lines mode.
 * Requirements: deterministic, no I/O; cluster window 40ms; fan angles match interval UI.
 */
import { NoteEvent, Point2D } from '../types.js';

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
