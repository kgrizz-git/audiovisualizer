import { RenderedGeometry } from '../../core/types.js';

export interface CanvasRenderOptions {
  progress?: number; // 0.0 to 1.0 (for scrubbed or animated playback)
  showLegend?: boolean;
  backgroundColor?: string;
}

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to acquire 2D context from canvas element.');
    }
    this.ctx = context;
  }

  public render(geometry: RenderedGeometry, options: CanvasRenderOptions = {}): void {
    const { width, height, voicePaths } = geometry;
    const progress = options.progress !== undefined ? options.progress : 1.0;
    const bgColor = options.backgroundColor || '#0f172a';

    // Handle high DPI crisp rendering
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== width * dpr || this.canvas.height !== height * dpr) {
      this.canvas.width = width * dpr;
      this.canvas.height = height * dpr;
    }

    this.ctx.save();
    this.ctx.scale(dpr, dpr);

    // Clear background
    this.ctx.fillStyle = bgColor;
    this.ctx.fillRect(0, 0, width, height);

    // Draw paths
    voicePaths.forEach((vp) => {
      // Draw Segments
      const totalSegs = vp.segments.length;
      const visibleSegs = Math.floor(totalSegs * progress);

      for (let i = 0; i < visibleSegs; i++) {
        const seg = vp.segments[i];
        this.ctx.beginPath();
        this.ctx.moveTo(seg.start.x, seg.start.y);
        this.ctx.lineTo(seg.end.x, seg.end.y);
        this.ctx.strokeStyle = seg.color;
        this.ctx.lineWidth = seg.width;
        this.ctx.lineCap = 'round';
        this.ctx.globalAlpha = seg.opacity;
        this.ctx.stroke();
      }

      // Draw Circles
      const totalCircles = vp.circles.length;
      const visibleCircles = Math.floor(totalCircles * progress);

      for (let i = 0; i < visibleCircles; i++) {
        const c = vp.circles[i];
        this.ctx.beginPath();
        this.ctx.arc(c.center.x, c.center.y, c.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = c.fillColor;
        this.ctx.globalAlpha = c.opacity;
        this.ctx.fill();
        this.ctx.strokeStyle = c.strokeColor;
        this.ctx.lineWidth = c.strokeWidth;
        this.ctx.stroke();
      }
    });

    this.ctx.globalAlpha = 1.0;

    // Draw Legend on Canvas if requested
    if (options.showLegend) {
      this.drawCanvasLegend(width, height, geometry.config.variation, geometry.config.originMode);
    }

    this.ctx.restore();
  }

  private drawCanvasLegend(w: number, h: number, variation: string, origin: string): void {
    const legendW = 240;
    const legendH = 95;
    const x = w - legendW - 20;
    const y = h - legendH - 20;

    this.ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.roundRect(x, y, legendW, legendH, 8);
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = 'bold 12px sans-serif';
    this.ctx.fillText('AudioVisualizer Legend', x + 15, y + 24);

    this.ctx.fillStyle = '#94a3b8';
    this.ctx.font = '10px sans-serif';
    this.ctx.fillText(`Variation: ${variation.toUpperCase()}`, x + 15, y + 44);
    this.ctx.fillText(`Origin: ${origin.replace('_', ' ')}`, x + 15, y + 60);

    this.ctx.fillStyle = '#38bdf8';
    this.ctx.font = '9px sans-serif';
    this.ctx.fillText('Pitch → Rainbow Hue | Duration → Length', x + 15, y + 78);
  }
}
