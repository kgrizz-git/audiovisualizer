/**
 * 3D score mapper.
 *
 * The X/Y calligraphy of the 3D modes is identical to the existing 2D `lines` and
 * `circles` modes: this file runs the 2D mapper for the corresponding base variation and
 * then lifts each primitive into 3D by attaching a Z coordinate derived purely from
 * musical time (note onset/offset × config.zScale). Reusing the 2D mapper keeps the
 * interval/cluster/heading math in one place and guarantees the front-facing view of a
 * 3D score matches its 2D counterpart.
 *
 * Pure and deterministic: no I/O, no randomness. Same score + config → identical output.
 */
import {
  Score,
  RuleConfig,
  Variation,
  RenderedGeometry,
  RenderedGeometry3D,
  GeometrySegment3D,
  GeometryDisc3D,
  GeometryBox3D,
} from '../types.js';
import { mapScoreToGeometry, getNoteColor, getVisualPitch } from './scoreMapper.js';
import { fitGeometryToCanvas } from '../layout/fitGeometry.js';

/** Maps a 3D variation to the 2D variation whose XY geometry it reuses.
 *  `3d_note_halos` and `3d_note_spheres` both reuse the `circles` halo path; the
 *  renderer chooses spheres vs cylinders/flat discs from the active variation. */
export function base2DVariation(variation: Variation): Variation {
  if (variation === '3d_note_halos' || variation === '3d_note_spheres') return 'circles';
  if (variation === '3d_polar_fan') return 'polar_fan';
  if (variation === '3d_polar_walk') return 'polar_walk';
  return 'lines';
}

/**
 * Lifts an already-mapped 2D geometry into 3D using an explicit seconds → world-unit
 * scale. Segments (lines) and circles (halos) are both carried across; the renderer
 * chooses which to draw from the active variation. Z for a segment spans
 * [onset, onset + duration] × zScale; a disc sits at onset × zScale.
 */
export function liftGeometryTo3D(
  geometry: RenderedGeometry,
  zScale: number,
  config: RuleConfig = geometry.config,
): RenderedGeometry3D {
  const segments: GeometrySegment3D[] = [];
  const discs: GeometryDisc3D[] = [];
  let maxZ = 0;

  for (const path of geometry.voicePaths) {
    for (const segment of path.segments) {
      const startZ = segment.note.onset * zScale;
      const endZ = (segment.note.onset + segment.note.duration) * zScale;
      maxZ = Math.max(maxZ, startZ, endZ);
      segments.push({
        startX: segment.start.x,
        startY: segment.start.y,
        startZ,
        endX: segment.end.x,
        endY: segment.end.y,
        endZ,
        color: segment.color,
        width: segment.width,
        opacity: segment.opacity,
        note: segment.note,
        role: segment.role,
        dashArray: segment.dashArray,
      });
    }
    for (const circle of path.circles) {
      const cz = circle.note.onset * zScale;
      const czExtent = (circle.note.duration * zScale) / 2;
      maxZ = Math.max(maxZ, cz, cz + czExtent);
      discs.push({
        cx: circle.center.x,
        cy: circle.center.y,
        cz,
        czExtent,
        radius: circle.radius,
        fillColor: circle.fillColor,
        strokeColor: circle.strokeColor,
        strokeWidth: circle.strokeWidth,
        opacity: circle.opacity,
        note: circle.note,
      });
    }
  }

  return {
    kind: '3d',
    width: geometry.width,
    height: geometry.height,
    depth: maxZ,
    zScale,
    segments,
    discs,
    boxes: [],
    config,
    bpm: geometry.bpm,
  };
}

/**
 * Computes the effective seconds → world-unit scale so the whole score reads as a
 * well-proportioned solid: total Z depth ≈ normalizationSpan × (config.zScale / 100),
 * independent of the piece's absolute length. Raw px/sec would make a long score an
 * unviewably deep tunnel (dwarfing the XY detail); normalizing keeps pitch/interval
 * geometry and note halos legible for any duration. For path modes the span should be
 * the fitted XY extent of the mapped geometry so that at the default `zScale = 100`
 * the Z depth matches the on-screen X/Y extent; for piano roll the raw target width is
 * used as the normalization span.
 */
export function effectiveZScale(durationSeconds: number, normalizationSpan: number, config: RuleConfig): number {
  if (durationSeconds <= 0) return 0;
  const span = Math.max(1, normalizationSpan);
  const targetDepth = span * (config.zScale / 100);
  return targetDepth / durationSeconds;
}

/**
 * Maps a Score directly to 3D geometry for a `3d_piano_roll` variation: axis-aligned
 * boxes where X = pitch (spread across the score's actual pitch range), Y = voice lane,
 * and Z spans the note's onset→offset in normalized time. Distinct from the path modes —
 * it does not reuse the 2D mapper.
 */
export function mapPianoRoll3D(
  score: Score,
  config: RuleConfig,
  targetWidth: number,
  targetHeight: number,
): RenderedGeometry3D {
  const pad = 56;
  const zScale = effectiveZScale(score.duration, targetWidth - pad * 2, config);
  const tracks = score.tracks.filter(
    (track) => track.notes.length > 0 && (config.voiceFilter === null || config.voiceFilter.includes(track.channel)),
  );
  const allNotes = tracks.flatMap((track) => track.notes);

  // Pitch range across the visible score (fall back to a sensible span for a single pitch).
  let minPitch = Infinity;
  let maxPitch = -Infinity;
  for (const note of allNotes) {
    const pitch = getVisualPitch(note, config);
    if (pitch < minPitch) minPitch = pitch;
    if (pitch > maxPitch) maxPitch = pitch;
  }
  if (!Number.isFinite(minPitch)) { minPitch = 60; maxPitch = 72; }
  const pitchSpan = Math.max(1, maxPitch - minPitch);
  const usableW = targetWidth - pad * 2;
  const usableH = targetHeight - pad * 2;
  const laneCount = Math.max(1, tracks.length);
  const laneHeight = usableH / laneCount;
  const boxW = Math.max(6, (usableW / (pitchSpan + 1)) * 0.9);

  const boxes: GeometryBox3D[] = [];
  let maxZ = 0;
  tracks.forEach((track, laneIndex) => {
    const laneCenterY = pad + laneHeight * (laneIndex + 0.5);
    for (const note of track.notes) {
      const cx = pad + ((getVisualPitch(note, config) - minPitch) / pitchSpan) * usableW;
      const zStart = note.onset * zScale;
      const zEnd = (note.onset + note.duration) * zScale;
      maxZ = Math.max(maxZ, zEnd);
      boxes.push({
        cx,
        cy: laneCenterY,
        cz: (zStart + zEnd) / 2,
        sx: boxW,
        sy: laneHeight * 0.7,
        sz: Math.max(2, zEnd - zStart),
        color: getNoteColor(note, config),
        opacity: 0.55 + (note.velocity / 127) * 0.4,
        note,
      });
    }
  });

  return {
    kind: '3d',
    width: targetWidth,
    height: targetHeight,
    depth: maxZ,
    zScale,
    segments: [],
    discs: [],
    boxes,
    config,
    bpm: score.bpm,
  };
}

/**
 * Maps a Score directly to 3D geometry. For `3d_lines` / `3d_note_halos` the 2D XY pass
 * uses the corresponding base variation and is lifted along Z; `3d_piano_roll` builds a
 * pitch × voice × time box grid. The returned geometry preserves the requested variation.
 */
export function map3DGeometry(
  score: Score,
  config: RuleConfig,
  targetWidth: number = 1000,
  targetHeight: number = 1000,
): RenderedGeometry3D {
  if (config.variation === '3d_piano_roll') {
    return mapPianoRoll3D(score, config, targetWidth, targetHeight);
  }
  const config2d: RuleConfig = { ...config, variation: base2DVariation(config.variation) };
  // Frame XY into the canvas box (same as the 2D preview) so radii, stroke widths, and
  // fog are calibrated to a ~canvas-sized scene before adding the Z (time) dimension.
  const geometry2d = fitGeometryToCanvas(
    mapScoreToGeometry(score, config2d, targetWidth, targetHeight),
    targetWidth,
    targetHeight,
  );
  // Normalize Z to the geometry's actual fitted X/Y extent so that at the default
  // `zScale = 100` the score's depth matches its on-screen width/height — the calligraphic
  // solid reads as a cube rather than a tunnel or a flat ribbon.
  const fittedSpan = computeFittedSpan(geometry2d);
  const zScale = effectiveZScale(score.duration, fittedSpan, config);
  return liftGeometryTo3D(geometry2d, zScale, config);
}

/**
 * Largest fitted X/Y span of the mapped geometry (after `fitGeometryToCanvas`). Used as
 * the Z-normalization target so depth matches the visible footprint regardless of canvas
 * aspect or padding. Falls back to the canvas width bands use.
 */
export function computeFittedSpan(geometry: RenderedGeometry): number {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const path of geometry.voicePaths) {
    for (const segment of path.segments) {
      minX = Math.min(minX, segment.start.x, segment.end.x);
      minY = Math.min(minY, segment.start.y, segment.end.y);
      maxX = Math.max(maxX, segment.start.x, segment.end.x);
      maxY = Math.max(maxY, segment.start.y, segment.end.y);
    }
    for (const circle of path.circles) {
      minX = Math.min(minX, circle.center.x - circle.radius);
      minY = Math.min(minY, circle.center.y - circle.radius);
      maxX = Math.max(maxX, circle.center.x + circle.radius);
      maxY = Math.max(maxY, circle.center.y + circle.radius);
    }
  }
  if (!Number.isFinite(minX)) return geometry.width;
  return Math.max(maxX - minX, maxY - minY);
}
