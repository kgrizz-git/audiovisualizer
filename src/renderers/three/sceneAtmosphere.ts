import * as THREE from 'three';
import { RenderedGeometry3D } from '../../core/types.js';

/**
 * Creates a default linear gradient background texture for the 3D scene.
 */
export function makeGradientBackground(): THREE.Texture {
  if (typeof document === 'undefined') {
    return new THREE.Texture();
  }
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#0a0b14');
  gradient.addColorStop(1, '#020204');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * A fixed grounding grid and seeded star field give orbiting views depth without randomness.
 */
export function buildAtmosphere(contentGroup: THREE.Group, geometry: RenderedGeometry3D): void {
  const grid = new THREE.GridHelper(Math.max(geometry.width, geometry.depth) * 1.15, 18, 0x263d65, 0x132138);
  grid.rotation.x = Math.PI / 2;
  grid.position.y = -geometry.height / 2 - 28;
  grid.position.z = 0;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.3;
  contentGroup.add(grid);

  const positions: number[] = [];
  let seed = 0x9e3779b9;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const span = Math.max(geometry.width, geometry.height, geometry.depth) * 1.25;
  for (let i = 0; i < 160; i++) {
    positions.push((random() - 0.5) * span, (random() - 0.5) * span, (random() - 0.5) * span);
  }
  const stars = new THREE.BufferGeometry();
  stars.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  contentGroup.add(
    new THREE.Points(
      stars,
      new THREE.PointsMaterial({
        color: 0x7892c9,
        size: 1.5,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    ),
  );
}

/**
 * Removes the now-plane mesh from the scene and frees its GPU resources.
 * Callers that rebuild content must use this before adding a replacement —
 * otherwise disposed meshes stay in the scene graph as stuck glowing planes
 * that no longer follow the playhead or cue mode.
 */
export function disposeNowPlane(scene: THREE.Scene, nowPlane: THREE.Mesh | null): null {
  if (!nowPlane) return null;
  scene.remove(nowPlane);
  nowPlane.geometry.dispose();
  (nowPlane.material as THREE.Material).dispose();
  return null;
}

/**
 * Builds the translucent now-plane mesh indicating current playback time,
 * disposing any existing now-plane first.
 */
export function buildNowPlane(
  scene: THREE.Scene,
  currentNowPlane: THREE.Mesh | null,
  geometry: RenderedGeometry3D,
): THREE.Mesh {
  disposeNowPlane(scene, currentNowPlane);

  const planeSize = Math.max(geometry.width, geometry.height) * 1.4;
  const planeGeometry = new THREE.PlaneGeometry(planeSize, planeSize);
  const planeMaterial = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.1,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const nowPlane = new THREE.Mesh(planeGeometry, planeMaterial);
  nowPlane.visible = false;
  scene.add(nowPlane);
  return nowPlane;
}
