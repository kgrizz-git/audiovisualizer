import { GeometrySegment, RenderedGeometry } from '../../core/types.js';

export interface CanvasRenderOptions {
  time?: number;
  showLegend?: boolean;
  backgroundColor?: string;
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
    this.ctx.fillStyle = options.backgroundColor || '#09111f';
    this.ctx.fillRect(0, 0, width, height);
    this.drawAtmosphere(width, height);

    voicePaths.forEach((voicePath) => {
      voicePath.segments.forEach((segment) => this.drawSegment(segment, time));
      voicePath.circles.forEach((circle) => {
        if (circle.note.onset > time) return;
        this.ctx.beginPath();
        this.ctx.arc(circle.center.x, circle.center.y, circle.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = circle.fillColor;
        this.ctx.globalAlpha = circle.opacity;
        this.ctx.fill();
        this.ctx.strokeStyle = circle.strokeColor;
        this.ctx.lineWidth = circle.strokeWidth;
        this.ctx.stroke();
      });
    });

    this.ctx.globalAlpha = 1;
    if (options.showLegend) this.drawCanvasLegend(width, height, geometry);
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

  private drawSegment(segment: GeometrySegment, time: number): void {
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
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }

  private drawAtmosphere(width: number, height: number): void {
    const glow = this.ctx.createRadialGradient(width * 0.68, height * 0.2, 0, width * 0.68, height * 0.2, width * 0.8);
    glow.addColorStop(0, 'rgba(45, 212, 191, 0.12)');
    glow.addColorStop(1, 'rgba(9, 17, 31, 0)');
    this.ctx.fillStyle = glow;
    this.ctx.fillRect(0, 0, width, height);
  }

  private drawCanvasLegend(_w: number, h: number, geometry: RenderedGeometry): void {
    const x = 24;
    const y = h - 106;
    this.ctx.fillStyle = 'rgba(9, 17, 31, 0.78)';
    this.ctx.strokeStyle = 'rgba(226, 232, 240, 0.18)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.roundRect(x, y, 296, 82, 12);
    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = '600 12px system-ui';
    this.ctx.fillText('VISUAL SCORE · LIVE LEGEND', x + 16, y + 23);
    this.ctx.fillStyle = '#a5b4fc';
    this.ctx.font = '11px system-ui';
    this.ctx.fillText('Pitch → hue   Duration → distance   Velocity → weight', x + 16, y + 45);
    this.ctx.fillStyle = '#94a3b8';
    this.ctx.fillText(`Mode: ${geometry.config.variation.replace('_', ' ')} · Gap: ${geometry.config.gapPolicy.replace('_', ' ')}`, x + 16, y + 65);
  }
}
