import { RenderedGeometry3D, ViewportTransform3D } from '../../core/types.js';

/**
 * Renderer contract for the Three.js 3D visualization family. Isolating the WebGL
 * renderer behind this interface keeps the 2D Canvas/SVG pipeline free of any Three.js
 * dependency and lets `app.ts` drive the 3D view without importing Three.js eagerly.
 */
export interface I3DRenderer {
  /** Attaches the renderer to a canvas and sizes it to width × height CSS pixels. */
  mount(canvas: HTMLCanvasElement, width: number, height: number): void;
  /** Replaces the rendered geometry and re-frames the camera. */
  setGeometry(geometry: RenderedGeometry3D): void;
  /** Applies camera preset and bloom settings. */
  setViewport(viewport: ViewportTransform3D): void;
  /**
   * Positions the sweeping "now-plane" at playback time `t` (seconds). Pass `null` to
   * hide the plane (static / full-score view when not playing).
   */
  stepPlayhead(t: number | null): void;
  /** Renders a PNG snapshot of the current frame at the mounted resolution. */
  capturePNG(): Promise<Blob>;
  /** Releases all GPU resources (geometries, materials, render targets, context). */
  dispose(): void;
}
