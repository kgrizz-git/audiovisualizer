import { GeometryBand, GeometryCircle, GeometrySegment, RenderedGeometry, RuleConfig, ViewportTransform, DEFAULT_VIEWPORT } from '../../core/types.js';
import { getLegendContent } from '../../core/legend/legendContent.js';

export interface CanvasRenderOptions {
  time?: number;
  showLegend?: boolean;
  backgroundColor?: string;
  title?: string;
  viewport?: ViewportTransform;
  atmosphereColors?: string[];
}

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Failed to acquire 2D context from canvas element.');
    this.ctx = context;
  }

  public render(geometry: RenderedGeometry, options: CanvasRenderOptions = {}): void {
    const { width, height, voicePaths } = geometry;
    const time = options.time ?? Number.POSITIVE_INFINITY;
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== width * dpr || this.canvas.height !== height * dpr) {
      this.canvas.width = width * dpr;
      this.canvas.height = height * dpr;
    }

    this.ctx.save();
    this.ctx.scale(dpr, dpr);
    this.ctx.fillStyle = options.backgroundColor || '#000000';
    this.ctx.fillRect(0, 0, width, height);
    if (geometry.bands.length === 0) this.drawAtmosphere(width, height, options.atmosphereColors, options.backgroundColor);

    const viewport = options.viewport ?? DEFAULT_VIEWPORT;
    this.ctx.save();
    this.ctx.translate(width / 2 + viewport.panX, height / 2 + viewport.panY);
    this.ctx.scale(viewport.zoom, viewport.zoom);
    this.ctx.translate(-width / 2, -height / 2);

    geometry.bands.forEach((band) => this.drawBand(band, width, time));

    // Draw percussion rings first so pitched note lines render on top of them.
    voicePaths.forEach((voicePath) => {
      voicePath.circles.forEach((circle) => {
        if (!circle.isPercussion || circle.note.onset > time) return;
        this.drawCircle(circle, false, geometry.config);
      });
    });

    voicePaths.forEach((voicePath) => {
      voicePath.segments.forEach((segment) => this.drawSegment(segment, time, geometry.config));
      voicePath.circles.forEach((circle) => {
        if (circle.isPercussion || circle.note.onset > time) return;
        this.drawCircle(circle, true, geometry.config);
      });
    });
    this.ctx.restore();

    this.ctx.globalAlpha = 1;
    if (options.showLegend) this.drawCanvasLegend(width, height, geometry);
    if (options.title) this.drawCanvasTitle(width, options.title);
    this.ctx.restore();
  }

  public downloadPng(filename: string): void {
    this.canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  private drawCircle(circle: GeometryCircle, glow: boolean, config: RuleConfig): void {
    this.ctx.beginPath();
    this.ctx.arc(circle.center.x, circle.center.y, circle.radius, 0, Math.PI * 2);
    this.ctx.globalAlpha = circle.opacity;
    this.ctx.shadowColor = glow ? circle.fillColor : 'transparent';
    this.ctx.shadowBlur = glow ? this.glowBlur(Math.max(8, circle.radius * 0.55), circle.note.velocity, config) : 0;
    // Percussion rings use fillColor 'none' (invalid for canvas): stroke-only.
    if (circle.fillColor !== 'none') {
      this.ctx.fillStyle = circle.fillColor;
      this.ctx.fill();
    }
    this.ctx.strokeStyle = circle.strokeColor;
    this.ctx.lineWidth = circle.strokeWidth;
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;
    this.ctx.shadowColor = 'transparent';
  }

  private drawSegment(segment: GeometrySegment, time: number, config: RuleConfig): void {
    if (segment.note.onset > time) return;
    const noteEnd = segment.note.onset + Math.max(segment.note.duration, 0.01);
    const fraction = Math.min(1, Math.max(0, (time - segment.note.onset) / (noteEnd - segment.note.onset)));
    if (fraction === 0) return;
    const x = segment.start.x + (segment.end.x - segment.start.x) * fraction;
    const y = segment.start.y + (segment.end.y - segment.start.y) * fraction;
    this.ctx.beginPath();
    this.ctx.moveTo(segment.start.x, segment.start.y);
    this.ctx.lineTo(x, y);
    this.ctx.strokeStyle = segment.color;
    this.ctx.lineWidth = segment.width;
    this.ctx.lineCap = 'round';
    this.ctx.setLineDash(segment.dashArray?.split(' ').map(Number) || []);
    this.ctx.globalAlpha = segment.opacity;
    const variation = config.variation;
    const glow = variation === 'lines' || variation === 'polar_fan' || variation === 'polar_walk' || variation === 'radial_voice_paths';
    this.ctx.shadowColor = glow ? segment.color : 'transparent';
    this.ctx.shadowBlur = glow ? this.glowBlur(Math.max(7, segment.width * 3), segment.note.velocity, config) : 0;
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;
    this.ctx.shadowColor = 'transparent';
    this.ctx.setLineDash([]);
  }

  /** Shadow-blur radius: baseline glow, or velocity-scaled when velocityGlow is on,
   *  capped at 24px so dense scores keep acceptable canvas performance. */
  private glowBlur(baseBlur: number, velocity: number, config: RuleConfig): number {
    if (!config.velocityGlow) return baseBlur;
    return Math.min(24, Math.max(2, baseBlur * (velocity / 127)));
  }

  private drawBand(band: GeometryBand, width: number, time: number): void {
    if (band.onset > time) return;
    this.ctx.fillStyle = band.color;
    this.ctx.globalAlpha = band.opacity;
    this.ctx.fillRect(0, band.y, width, band.height);
  }

  private drawAtmosphere(width: number, height: number, colors: string[] = ['hsl(168, 70%, 50%)'], backgroundColor?: string): void {
    const fadeColor = this.getTransparentColor(backgroundColor || '#000000');
    // A single accent paints one subtle centered glow; multiple accents keep the
    // original multi-position layout (used only as a fallback).
    if (colors.length === 1) {
      const color = colors[0];
      const x = width * 0.5;
      const y = height * 0.4;
      const glow = this.ctx.createRadialGradient(x, y, 0, x, y, width * 0.6);
      glow.addColorStop(0, color.replace('hsl(', 'hsla(').replace('%)', '%, 0.12)'));
      glow.addColorStop(1, fadeColor);
      this.ctx.fillStyle = glow;
      this.ctx.fillRect(0, 0, width, height);
      return;
    }
    colors.slice(0, 4).forEach((color, index) => {
      const x = width * (0.22 + index * 0.23);
      const y = height * (0.2 + (index % 2) * 0.55);
      const glow = this.ctx.createRadialGradient(x, y, 0, x, y, width * 0.48);
      glow.addColorStop(0, color.replace('hsl(', 'hsla(').replace('%)', '%, 0.12)'));
      glow.addColorStop(1, fadeColor);
      this.ctx.fillStyle = glow;
      this.ctx.fillRect(0, 0, width, height);
    });
  }

  private getTransparentColor(color: string): string {
    const trimmed = color.trim().toLowerCase();
    if (trimmed.startsWith('#')) {
      if (trimmed.length === 4) return trimmed + '0'; // #000 -> #0000
      if (trimmed.length === 7) return trimmed + '00'; // #000000 -> #00000000
    } else if (trimmed.startsWith('hsl(')) {
      return trimmed.replace('hsl(', 'hsla(').replace(')', ', 0)');
    }
    return 'rgba(0, 0, 0, 0)';
  }

  private drawCanvasLegend(w: number, h: number, geometry: RenderedGeometry): void {
    const content = getLegendContent(geometry.config);
    const legendW = 350;
    const legendH = 145;
    const x = w - legendW - 24;
    const y = h - legendH - 24;
    this.ctx.fillStyle = 'rgba(9, 17, 31, 0.78)';
    this.ctx.strokeStyle = 'rgba(226, 232, 240, 0.18)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.roundRect(x, y, legendW, legendH, 12);
    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = '600 12px system-ui';
    this.ctx.fillText(`VISUAL SCORE · ${content.title}`, x + 16, y + 23);
    this.ctx.fillStyle = '#a5b4fc';
    this.ctx.font = '11px system-ui';
    content.lines.forEach((line, index) => this.ctx.fillText(line, x + 16, y + 45 + index * 16));
    content.swatches.forEach((swatch, index) => {
      const swatchX = x + 18 + index * 60;
      this.ctx.fillStyle = swatch.color;
      this.ctx.beginPath();
      this.ctx.arc(swatchX, y + legendH - 17, 5, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.fillStyle = '#cbd5e1';
      this.ctx.font = '10px system-ui';
      this.ctx.fillText(swatch.label, swatchX + 9, y + legendH - 13);
    });
  }

  private drawCanvasTitle(_width: number, title: string): void {
    // Trim and check for empty
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      return;
    }

    // Truncate at 40 characters
    const displayTitle = trimmedTitle.length > 40 ? trimmedTitle.slice(0, 37) + '…' : trimmedTitle;

    // Title pill styling
    const padding = 12;
    const fontSize = 16;
    const pillWidth = displayTitle.length * fontSize * 0.6 + padding * 2; // Approximate width
    const pillHeight = fontSize + padding;
    const x = 16;
    const y = 16;

    // Draw semi-transparent dark pill
    this.ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.roundRect(x, y, pillWidth, pillHeight, 4);
    this.ctx.fill();
    this.ctx.stroke();

    // Draw title text
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = '600 16px system-ui';
    this.ctx.fillText(displayTitle, x + padding / 2, y + fontSize + padding / 4);
  }
}
