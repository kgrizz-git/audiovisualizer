import { ViewportController } from '../core/layout/viewportController.js';

/**
 * Maps wheel / drag / pinch DOM events on the preview canvas to ViewportController.
 * Inputs: canvas element, controller, logical preview size (e.g. 900), onUpdate callback.
 * Outputs: side-effecting controller mutations + onUpdate() after each gesture.
 */
export class ViewportGestures {
  private activePointers = new Map<number, { x: number; y: number }>();
  private initialPinchDist = 0;
  private initialPinchZoom = 1;

  constructor(
    private canvas: HTMLCanvasElement,
    private controller: ViewportController,
    private previewSize: number,
    private onUpdate: () => void
  ) {
    this.bindEvents();
  }

  /** CSS display → logical geometry space (not canvas.width / DPR buffer). */
  private getLogicalCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.previewSize / Math.max(1, rect.width);
    const scaleY = this.previewSize / Math.max(1, rect.height);
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  private cssToLogicalDelta(dxCss: number, dyCss: number): { dx: number; dy: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      dx: dxCss * (this.previewSize / Math.max(1, rect.width)),
      dy: dyCss * (this.previewSize / Math.max(1, rect.height)),
    };
  }

  private bindEvents(): void {
    this.canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const pt = this.getLogicalCoords(event.clientX, event.clientY);
      const factor = Math.exp(-event.deltaY * 0.0015);
      const currentZoom = this.controller.getViewport().zoom;
      this.controller.zoomAt(currentZoom * factor, pt.x, pt.y, this.previewSize, this.previewSize);
      this.onUpdate();
    }, { passive: false });

    let isDragging = false;
    let lastPt = { x: 0, y: 0 };

    this.canvas.addEventListener('pointerdown', (event) => {
      this.canvas.setPointerCapture(event.pointerId);
      this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.activePointers.size === 1) {
        isDragging = true;
        lastPt = { x: event.clientX, y: event.clientY };
      } else if (this.activePointers.size === 2) {
        isDragging = false;
        const pts = [...this.activePointers.values()];
        this.initialPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        this.initialPinchZoom = this.controller.getViewport().zoom;
      }
    });

    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.activePointers.has(event.pointerId)) return;
      this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (this.activePointers.size === 1 && isDragging) {
        const { dx, dy } = this.cssToLogicalDelta(event.clientX - lastPt.x, event.clientY - lastPt.y);
        lastPt = { x: event.clientX, y: event.clientY };
        this.controller.panBy(dx, dy);
        this.onUpdate();
      } else if (this.activePointers.size === 2) {
        const pts = [...this.activePointers.values()];
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        if (this.initialPinchDist > 0) {
          const ratio = dist / this.initialPinchDist;
          const centerCss = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
          const pt = this.getLogicalCoords(centerCss.x, centerCss.y);
          this.controller.zoomAt(this.initialPinchZoom * ratio, pt.x, pt.y, this.previewSize, this.previewSize);
          this.onUpdate();
        }
      }
    });

    const release = (event: PointerEvent) => {
      this.activePointers.delete(event.pointerId);
      if (this.activePointers.size < 2) this.initialPinchDist = 0;
      if (this.activePointers.size === 0) isDragging = false;
      // If one finger remains after pinch, re-arm drag from current position
      if (this.activePointers.size === 1) {
        const remaining = [...this.activePointers.values()][0];
        isDragging = true;
        lastPt = { x: remaining.x, y: remaining.y };
      }
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);
  }
}
