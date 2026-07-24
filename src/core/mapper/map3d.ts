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
} from '../types.js';
import { mapScoreToGeometry } from './scoreMapper.js';
import { fitGeometryToCanvas } from '../layout/fitGeometry.js';

/** Maps a 3D variation to the 2D variation whose XY geometry it reuses. */
export function base2DVariation(variation: Variation): Variation {
  return variation === '3d_note_halos' ? 'circles' : 'lines';
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
      maxZ = Math.max(maxZ, cz);
      discs.push({
        cx: circle.center.x,
        cy: circle.center.y,
        cz,
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
    config,
    bpm: geometry.bpm,
  };
}

/**
 * Computes the effective seconds → world-unit scale so the whole score reads as a
 * well-proportioned solid: total Z depth ≈ canvas width × (config.zScale / 100),
 * independent of the piece's absolute length. Raw px/sec would make a long score an
 * unviewably deep tunnel (dwarfing the XY detail); normalizing to the canvas keeps
 * pitch/interval geometry and note halos legible for any duration.
 */
export function effectiveZScale(durationSeconds: number, targetWidth: number, config: RuleConfig): number {
  if (durationSeconds <= 0) return 0;
  const targetDepth = targetWidth * (config.zScale / 100);
  return targetDepth / durationSeconds;
}

/**
 * Maps a Score directly to 3D geometry for a `3d_lines` or `3d_note_halos` variation.
 * The 2D XY pass uses the corresponding base variation; the returned geometry preserves
 * the requested 3D variation in `config`.
 */
export function map3DGeometry(
  score: Score,
  config: RuleConfig,
  targetWidth: number = 1000,
  targetHeight: number = 1000,
): RenderedGeometry3D {
  const config2d: RuleConfig = { ...config, variation: base2DVariation(config.variation) };
  // Frame XY into the canvas box (same as the 2D preview) so radii, stroke widths, and
  // fog are calibrated to a ~canvas-sized scene before adding the Z (time) dimension.
  const geometry2d = fitGeometryToCanvas(
    mapScoreToGeometry(score, config2d, targetWidth, targetHeight),
    targetWidth,
    targetHeight,
  );
  const zScale = effectiveZScale(score.duration, targetWidth, config);
  return liftGeometryTo3D(geometry2d, zScale, config);
}
