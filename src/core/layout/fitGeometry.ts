import { GeometryCircle, GeometrySegment, RenderedGeometry } from '../types.js';

/** Uniformly frames mapped geometry inside a target canvas without changing its rule data. */
export function fitGeometryToCanvas(geometry: RenderedGeometry, width: number, height: number, padding = 56): RenderedGeometry {
  if (geometry.config.variation === 'polar_fan' || geometry.config.variation === 'polar_walk' || geometry.config.variation === 'radial_voice_paths') {
    const segments = geometry.voicePaths.flatMap((path) => path.segments);
    const circles = geometry.voicePaths.flatMap((path) => path.circles);
    if (segments.length === 0 && circles.length === 0) return { ...geometry, width, height };

    const origin = { x: geometry.width / 2, y: geometry.height / 2 };
    // Radius must cover both segment endpoints and the outer edge of concentric
    // percussion rings, or fitting would clip the rings of radial_voice_paths.
    const maxRadius = Math.max(
      segments.reduce((max, seg) => {
        const distStart = Math.hypot(seg.start.x - origin.x, seg.start.y - origin.y);
        const distEnd = Math.hypot(seg.end.x - origin.x, seg.end.y - origin.y);
        return Math.max(max, distStart, distEnd);
      }, 0),
      circles.reduce((max, circle) => {
        return Math.max(max, Math.hypot(circle.center.x - origin.x, circle.center.y - origin.y) + circle.radius);
      }, 0),
    );

    if (maxRadius === 0) return { ...geometry, width, height };

    const sourceSize = 2 * maxRadius;
    const scale = Math.min((width - padding * 2) / sourceSize, (height - padding * 2) / sourceSize);
    const point = (x: number, y: number) => ({
      x: (x - origin.x) * scale + width / 2,
      y: (y - origin.y) * scale + height / 2,
    });

    return {
      ...geometry,
      width,
      height,
      voicePaths: geometry.voicePaths.map((path) => ({
        ...path,
        segments: path.segments.map((segment) => ({
          ...segment,
          start: point(segment.start.x, segment.start.y),
          end: point(segment.end.x, segment.end.y),
          width: Math.max(0.5, segment.width * scale),
        })),
        circles: path.circles.map((circle) => ({
          ...circle,
          center: point(circle.center.x, circle.center.y),
          radius: circle.radius * scale,
          strokeWidth: Math.max(0.5, circle.strokeWidth * scale),
        })),
      })),
    };
  }

  // Bands intentionally occupy every output row and must not receive art padding.
  if (geometry.bands.length > 0) {
    const scaleY = height / geometry.height;
    return { ...geometry, width, height, bands: geometry.bands.map((band) => ({ ...band, y: band.y * scaleY, height: band.height * scaleY })) };
  }
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
