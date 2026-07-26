import * as THREE from 'three';
import { RenderedGeometry3D } from '../../core/types.js';

export interface OnsetPulseWorldCoords {
  worldX: (x: number) => number;
  worldY: (y: number) => number;
  worldZ: (z: number) => number;
}

export class OnsetPulseController {
  private onsetPulses: Array<{ mesh: THREE.Mesh; startedAt: number }> = [];

  public spawn(
    previous: number | null,
    current: number,
    geometry: RenderedGeometry3D | null,
    contentGroup: THREE.Group,
    coords: OnsetPulseWorldCoords,
  ): void {
    if (!geometry || previous === null || current < previous) return;
    const notes = [
      ...geometry.segments.map((segment) => ({ note: segment.note, x: segment.startX, y: segment.startY, z: segment.startZ, color: segment.color })),
      ...geometry.discs.map((disc) => ({ note: disc.note, x: disc.cx, y: disc.cy, z: disc.cz, color: disc.fillColor })),
      ...geometry.boxes.map((box) => ({ note: box.note, x: box.cx, y: box.cy, z: box.cz - box.sz / 2, color: box.color })),
    ];
    for (const item of notes) {
      if (item.note.onset <= previous || item.note.onset > current) continue;
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.78, 1, 28),
        new THREE.MeshBasicMaterial({
          color: item.color,
          transparent: true,
          opacity: 0.95,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      mesh.position.set(coords.worldX(item.x), coords.worldY(item.y), coords.worldZ(item.z) + 1);
      contentGroup.add(mesh);
      this.onsetPulses.push({ mesh, startedAt: performance.now() });
    }
  }

  public update(contentGroup: THREE.Group): void {
    const now = performance.now();
    this.onsetPulses = this.onsetPulses.filter(({ mesh, startedAt }) => {
      const progress = (now - startedAt) / 520;
      if (progress >= 1) {
        contentGroup.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        return false;
      }
      const scale = 8 + progress * 42;
      mesh.scale.setScalar(scale);
      (mesh.material as THREE.MeshBasicMaterial).opacity = (1 - progress) * 0.9;
      return true;
    });
  }

  public clear(contentGroup: THREE.Group): void {
    for (const { mesh } of this.onsetPulses) {
      contentGroup.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.onsetPulses = [];
  }

  public count(): number {
    return this.onsetPulses.length;
  }
}
