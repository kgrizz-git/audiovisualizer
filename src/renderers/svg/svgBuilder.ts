import { RenderedGeometry } from '../../core/types.js';

export interface SvgOptions {
  includeLegend?: boolean;
  penPlotterMode?: boolean; // stroke-only, black/monochrome or raw vector paths
  backgroundColor?: string;
}

/**
 * Builds SVG string representation from RenderedGeometry.
 */
export function buildSvg(geometry: RenderedGeometry, options: SvgOptions = {}): string {
  const { width, height, voicePaths, config } = geometry;
  const bgColor = options.backgroundColor || '#000000';
  const isPlotter = options.penPlotterMode || false;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n`;

  // Background
  if (!isPlotter) {
    svg += `  <rect width="${width}" height="${height}" fill="${bgColor}" />\n`;
  }

  // Draw Voice Paths
  voicePaths.forEach((vp) => {
    svg += `  <!-- Voice: ${escapeComment(vp.voiceName)} (Channel ${vp.voice}) -->\n`;
    svg += `  <g id="voice-${vp.voice}" class="voice-group">\n`;

    // Segments (Polylines or lines)
    vp.segments.forEach((seg) => {
      const stroke = isPlotter ? '#000000' : seg.color;
      const strokeWidth = isPlotter ? 1 : seg.width;
      const opacity = isPlotter ? 1 : seg.opacity;

      svg += `    <line x1="${seg.start.x.toFixed(2)}" y1="${seg.start.y.toFixed(2)}" ` +
        `x2="${seg.end.x.toFixed(2)}" y2="${seg.end.y.toFixed(2)}" ` +
        `stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" ` +
        `${seg.dashArray && !isPlotter ? `stroke-dasharray="${seg.dashArray}" ` : ''}` +
        `stroke-opacity="${opacity}" />\n`;
    });

    // Circles
    vp.circles.forEach((c) => {
      const stroke = isPlotter ? '#000000' : c.strokeColor;
      const fill = isPlotter ? 'none' : c.fillColor;
      const strokeWidth = isPlotter ? 1 : c.strokeWidth;
      const opacity = isPlotter ? 1 : c.opacity;

      svg += `    <circle cx="${c.center.x.toFixed(2)}" cy="${c.center.y.toFixed(2)}" ` +
        `r="${c.radius.toFixed(2)}" fill="${fill}" stroke="${stroke}" ` +
        `stroke-width="${strokeWidth}" fill-opacity="${opacity}" />\n`;
    });

    svg += `  </g>\n`;
  });

  // Tonal time-lines are full-width vector bands, independent of MIDI voices.
  geometry.bands.forEach((band) => {
    const stroke = isPlotter ? '#000000' : band.color;
    const opacity = isPlotter ? 1 : band.opacity;
    const y = band.y + band.height / 2;
    svg += `  <line x1="0" y1="${y.toFixed(2)}" x2="${width}" y2="${y.toFixed(2)}" stroke="${stroke}" stroke-width="${band.height.toFixed(2)}" stroke-opacity="${opacity}" />\n`;
  });

  // Legend Group
  if (options.includeLegend && !isPlotter) {
    svg += buildLegendSvg(width, height, config.variation, config.originMode, config.pitchHueMode);
  }

  svg += `</svg>`;
  return svg;
}

function escapeComment(value: string): string {
  return value.replaceAll('--', '—').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function buildLegendSvg(w: number, h: number, variation: string, origin: string, hueMode: string): string {
  const legendW = 260;
  const legendH = 110;
  const x = w - legendW - 20;
  const y = h - legendH - 20;

  return `
  <!-- Legend Group -->
  <g id="legend-overlay" transform="translate(${x}, ${y})">
    <rect width="${legendW}" height="${legendH}" rx="8" fill="rgba(15, 23, 42, 0.85)" stroke="rgba(255, 255, 255, 0.2)" stroke-width="1" />
    <text x="15" y="24" fill="#f8fafc" font-family="sans-serif" font-size="12" font-weight="bold">AudioVisualizer Legend</text>
    <text x="15" y="46" fill="#94a3b8" font-family="sans-serif" font-size="10">Variation: ${variation.toUpperCase()}</text>
    <text x="15" y="62" fill="#94a3b8" font-family="sans-serif" font-size="10">Origin: ${origin.replace('_', ' ')}</text>
    <text x="15" y="78" fill="#94a3b8" font-family="sans-serif" font-size="10">Color Mode: ${hueMode}</text>
    <text x="15" y="96" fill="#38bdf8" font-family="sans-serif" font-size="9">Pitch → Rainbow Hue | Duration → Length</text>
  </g>
  `;
}
