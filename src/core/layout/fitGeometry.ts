import { GeometryCircle, GeometrySegment, RenderedGeometry } from '../types.js';

/** Uniformly frames mapped geometry inside a target canvas without changing its rule data. */
export function fitGeometryToCanvas(geometry: RenderedGeometry, width: number, height: number, padding = 56): RenderedGeometry {
  const segments = geometry.voicePaths.flatMap((path) => path.segments);
  const circles = geometry.voicePaths.flatMap((path) => path.circles);
  if (segments.length === 0 && circles.length === 0) return { ...geometry, width, height };
  const bounds = getBounds(segments, circles);
  const sourceWidth = Math.max(1, bounds.maxX - bounds.minX);
  const sourceHeight = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min((width - padding * 2) / sourceWidth, (height - padding * 2) / sourceHeight);
  const offsetX = (width - sourceWidth * scale) / 2 - bounds.minX * scale;
  const offsetY = (height - sourceHeight * scale) / 2 - bounds.minY * scale;
  const point = (x: number, y: number) => ({ x: x * scale + offsetX, y: y * scale + offsetY });

  return {
    ...geometry, width, height,
    voicePaths: geometry.voicePaths.map((path) => ({
      ...path,
      segments: path.segments.map((segment) => ({ ...segment, start: point(segment.start.x, segment.start.y), end: point(segment.end.x, segment.end.y), width: Math.max(0.5, segment.width * scale) })),
      circles: path.circles.map((circle) => ({ ...circle, center: point(circle.center.x, circle.center.y), radius: circle.radius * scale, strokeWidth: Math.max(0.5, circle.strokeWidth * scale) })),
    })),
  };
}

function getBounds(segments: GeometrySegment[], circles: GeometryCircle[]): { minX: number; minY: number; maxX: number; maxY: number } {
  const points = [
    ...segments.flatMap((segment) => [segment.start, segment.end]),
    ...circles.flatMap((circle) => [
      { x: circle.center.x - circle.radius, y: circle.center.y - circle.radius },
      { x: circle.center.x + circle.radius, y: circle.center.y + circle.radius },
    ]),
  ];
  return { minX: Math.min(...points.map((point) => point.x)), minY: Math.min(...points.map((point) => point.y)), maxX: Math.max(...points.map((point) => point.x)), maxY: Math.max(...points.map((point) => point.y)) };
}
