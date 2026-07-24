import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import {
  CAMERA_PRESETS_3D,
  DEFAULT_VIEWPORT_3D,
  RenderedGeometry3D,
  ViewportTransform3D,
} from '../../core/types.js';
import { I3DRenderer } from './I3DRenderer.js';

/**
 * Three.js renderer for the 3D calligraphic score modes. The X/Y coordinates arrive in
 * canvas pixel space (0..width, 0..height, y-down); they are recentered and Y-flipped into
 * world space, with Z = musical time. Bloom, exponential fog, a graded background, and a
 * sweeping now-plane provide the glowing, atmospheric look. Rendering is on-demand: every
 * public mutator ends by re-rendering a single frame.
 */
export class ThreeDRenderer implements I3DRenderer {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10000);
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;

  private contentGroup = new THREE.Group();
  private nowPlane: THREE.Mesh | null = null;
  private lineMaterials: LineMaterial[] = [];

  private viewport: ViewportTransform3D = { ...DEFAULT_VIEWPORT_3D };
  private geometry: RenderedGeometry3D | null = null;
  private width = 900;
  private height = 900;

  // World-space bounds of the current content, for camera framing and plane sizing.
  private center = new THREE.Vector3();
  private radius = 1;
  private zScale = 200;

  public mount(canvas: HTMLCanvasElement, width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true, // required for PNG capture
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.background = makeGradientBackground();
    this.scene.fog = new THREE.FogExp2(0x05060a, 0.00035);
    this.scene.add(this.contentGroup);

    const renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.9, 0.6, 0.2);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderPass);
    this.composer.addPass(this.bloomPass);
    this.applyBloom();
  }

  public setGeometry(geometry: RenderedGeometry3D): void {
    this.geometry = geometry;
    this.zScale = geometry.zScale;
    this.rebuildContent();
    this.computeBounds();
    this.frameCamera();
    this.renderOnce();
  }

  public setViewport(viewport: ViewportTransform3D): void {
    this.viewport = viewport;
    this.applyBloom();
    this.frameCamera();
    this.renderOnce();
  }

  public stepPlayhead(t: number | null): void {
    if (!this.nowPlane) return;
    if (t === null) {
      this.nowPlane.visible = false;
    } else {
      this.nowPlane.visible = true;
      this.nowPlane.position.z = this.worldZ(t * this.zScale);
    }
    this.renderOnce();
  }

  public capturePNG(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const canvas = this.renderer?.domElement;
      if (!canvas) return reject(new Error('3D renderer not mounted'));
      this.renderOnce();
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG capture failed'))), 'image/png');
    });
  }

  public dispose(): void {
    this.clearContent();
    this.nowPlane?.geometry.dispose();
    (this.nowPlane?.material as THREE.Material | undefined)?.dispose();
    this.nowPlane = null;
    if (this.scene.background instanceof THREE.Texture) this.scene.background.dispose();
    this.bloomPass?.dispose();
    this.composer?.dispose();
    this.renderer?.dispose();
    this.renderer = null;
    this.composer = null;
  }

  // --- internals -----------------------------------------------------------

  /** Canvas-pixel coordinates → centered, Y-up world coordinates. */
  private worldX(x: number): number { return x - this.width / 2; }
  private worldY(y: number): number { return -(y - this.height / 2); }
  private worldZ(z: number): number { return z - (this.geometry?.depth ?? 0) / 2; }

  private clearContent(): void {
    this.lineMaterials.forEach((m) => m.dispose());
    this.lineMaterials = [];
    this.contentGroup.traverse((obj) => {
      const mesh = obj as THREE.Mesh & { geometry?: THREE.BufferGeometry; material?: THREE.Material };
      mesh.geometry?.dispose?.();
      if (mesh.material && mesh.material !== this.nowPlane?.material) {
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((mat) => mat.dispose());
      }
    });
    this.contentGroup.clear();
  }

  private rebuildContent(): void {
    if (!this.geometry) return;
    this.clearContent();

    if (this.geometry.segments.length > 0) this.buildLines(this.geometry);
    if (this.geometry.discs.length > 0) this.buildDiscs(this.geometry);
    this.buildNowPlane(this.geometry);
  }

  private buildLines(geometry: RenderedGeometry3D): void {
    const positions: number[] = [];
    const colors: number[] = [];
    let widthSum = 0;
    const color = new THREE.Color();

    for (const seg of geometry.segments) {
      positions.push(
        this.worldX(seg.startX), this.worldY(seg.startY), this.worldZ(seg.startZ),
        this.worldX(seg.endX), this.worldY(seg.endY), this.worldZ(seg.endZ),
      );
      color.set(seg.color).convertSRGBToLinear();
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      widthSum += seg.width;
    }

    const lineGeometry = new LineSegmentsGeometry();
    lineGeometry.setPositions(positions);
    lineGeometry.setColors(colors);

    const avgWidth = widthSum / Math.max(1, geometry.segments.length);
    const material = new LineMaterial({
      vertexColors: true,
      linewidth: Math.max(2, avgWidth) * 1.5,
      worldUnits: false,
      transparent: true,
      opacity: 0.95,
    });
    material.resolution.set(this.width, this.height);
    this.lineMaterials.push(material);

    this.contentGroup.add(new LineSegments2(lineGeometry, material));
  }

  private buildDiscs(geometry: RenderedGeometry3D): void {
    const count = geometry.discs.length;
    const fillGeometry = new THREE.CircleGeometry(1, 32);
    const fillMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const fills = new THREE.InstancedMesh(fillGeometry, fillMaterial, count);

    const ringGeometry = new THREE.RingGeometry(0.92, 1, 40);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const rings = new THREE.InstancedMesh(ringGeometry, ringMaterial, count);

    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    geometry.discs.forEach((disc, i) => {
      matrix.makeScale(disc.radius, disc.radius, 1);
      matrix.setPosition(this.worldX(disc.cx), this.worldY(disc.cy), this.worldZ(disc.cz));
      fills.setMatrixAt(i, matrix);
      rings.setMatrixAt(i, matrix);
      color.set(disc.fillColor).convertSRGBToLinear();
      fills.setColorAt(i, color);
    });
    fills.instanceMatrix.needsUpdate = true;
    rings.instanceMatrix.needsUpdate = true;
    if (fills.instanceColor) fills.instanceColor.needsUpdate = true;

    this.contentGroup.add(fills, rings);
  }

  private buildNowPlane(geometry: RenderedGeometry3D): void {
    this.nowPlane?.geometry.dispose();
    (this.nowPlane?.material as THREE.Material | undefined)?.dispose();

    const planeSize = Math.max(geometry.width, geometry.height) * 1.4;
    const planeGeometry = new THREE.PlaneGeometry(planeSize, planeSize);
    const planeMaterial = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.10,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.nowPlane = new THREE.Mesh(planeGeometry, planeMaterial);
    this.nowPlane.visible = false;
    this.scene.add(this.nowPlane);
  }

  private frameCamera(): void {
    const { azimuth, elevation } = CAMERA_PRESETS_3D[this.viewport.preset] ?? CAMERA_PRESETS_3D['3d_isometric'];
    const az = (azimuth * Math.PI) / 180;
    const el = (elevation * Math.PI) / 180;
    const dir = new THREE.Vector3(
      Math.cos(el) * Math.sin(az),
      Math.sin(el),
      Math.cos(el) * Math.cos(az),
    );
    const distance = this.radius * 3 + 100;
    this.camera.position.copy(this.center).addScaledVector(dir, distance);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.center);

    const aspect = this.width / this.height;
    const half = this.radius * 1.25;
    this.camera.left = -half * aspect;
    this.camera.right = half * aspect;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.near = 0.1;
    this.camera.far = distance + this.radius * 4;
    this.camera.updateProjectionMatrix();
  }

  private applyBloom(): void {
    if (!this.bloomPass) return;
    this.bloomPass.strength = this.viewport.bloom;
    this.bloomPass.enabled = this.viewport.bloom > 0;
  }

  private renderOnce(): void {
    if (!this.renderer || !this.composer) return;
    if (this.bloomPass?.enabled) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /** Recomputes world-space bounding sphere of the current content for camera framing. */
  private computeBounds(): void {
    const box = new THREE.Box3();
    box.makeEmpty();
    const p = new THREE.Vector3();
    if (this.geometry) {
      for (const seg of this.geometry.segments) {
        box.expandByPoint(p.set(this.worldX(seg.startX), this.worldY(seg.startY), this.worldZ(seg.startZ)));
        box.expandByPoint(p.set(this.worldX(seg.endX), this.worldY(seg.endY), this.worldZ(seg.endZ)));
      }
      for (const disc of this.geometry.discs) {
        box.expandByPoint(p.set(this.worldX(disc.cx), this.worldY(disc.cy), this.worldZ(disc.cz)));
      }
    }
    if (box.isEmpty()) {
      this.center.set(0, 0, 0);
      this.radius = Math.max(this.width, this.height) / 2;
      return;
    }
    box.getCenter(this.center);
    this.radius = Math.max(box.getSize(p).length() / 2, 1);
  }
}

function makeGradientBackground(): THREE.Texture {
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
