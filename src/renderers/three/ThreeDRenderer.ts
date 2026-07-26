import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  CAMERA_PRESETS_3D,
  DEFAULT_VIEWPORT_3D,
  RenderedGeometry3D,
  ViewportTransform3D,
} from '../../core/types.js';
import { I3DRenderer } from './I3DRenderer.js';
import {
  GeometryBuildContext,
  buildLines,
  buildDiscs,
  buildSpheres,
  buildBoxes,
} from './geometryBuilders.js';

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
  private controls: OrbitControls | null = null;

  private contentGroup = new THREE.Group();
  private nowPlane: THREE.Mesh | null = null;
  /** Shared world-space clip plane used by reveal mode; normal faces toward past time. */
  private revealPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e7);
  private lineMaterials: LineMaterial[] = [];
  private revealMaterials: THREE.Material[] = [];
  private onsetPulses: Array<{ mesh: THREE.Mesh; startedAt: number }> = [];
  private previousPlayhead: number | null = null;
  private turntableRotation = 0;
  private currentBgColor: string | null = null;
  private currentAtmosphereColors: string[] | null = null;

  private viewport: ViewportTransform3D = { ...DEFAULT_VIEWPORT_3D };
  private geometry: RenderedGeometry3D | null = null;
  private width = 900;
  private height = 900;

  // World-space bounds of the current content, for camera framing and plane sizing.
  private center = new THREE.Vector3();
  private radius = 1;
  private zScale = 100;
  private onViewportChange: ((viewport: ViewportTransform3D) => void) | undefined;

  public mount(canvas: HTMLCanvasElement, width: number, height: number, onViewportChange?: (viewport: ViewportTransform3D) => void): void {
    this.width = width;
    this.height = height;
    this.onViewportChange = onViewportChange;
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
    this.renderer.localClippingEnabled = true;

    this.scene.background = makeGradientBackground();
    this.scene.fog = new THREE.FogExp2(0x05060a, 0.00035);
    this.scene.add(this.contentGroup);

    const renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 1.4, 0.6, 0.16);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderPass);
    this.composer.addPass(this.bloomPass);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener('start', () => {
      // A deliberate orbit/pan is an explicit framing choice, so it takes precedence
      // over the preset and playback tracking until the user re-enables either mode.
      this.viewport = { ...this.viewport, preset: '3d_free', autoFollow: false, chaseCamera: false };
    });
    this.controls.addEventListener('change', () => this.renderOnce());
    this.controls.addEventListener('end', () => this.recordOrbitViewport());
    this.applyBloom();
  }

  private applyTurntableRotation(): void {
    const pivot = new THREE.Vector3(this.center.x, this.center.y, 0);
    this.contentGroup.position.set(0, 0, 0);
    this.contentGroup.rotation.set(0, 0, 0);
    if (this.viewport.autoRotate) {
      this.contentGroup.position.sub(pivot);
      this.contentGroup.position.applyAxisAngle(new THREE.Vector3(0, 0, 1), this.turntableRotation);
      this.contentGroup.position.add(pivot);
      this.contentGroup.rotation.z = this.turntableRotation;
    }
  }

  public setGeometry(geometry: RenderedGeometry3D): void {
    this.geometry = geometry;
    this.zScale = geometry.zScale;
    this.rebuildContent();
    this.computeBounds();
    if (!this.viewport.autoRotate) {
      this.turntableRotation = 0;
    }
    this.applyTurntableRotation();
    this.frameCamera();
    this.renderOnce();
  }

  public setViewport(viewport: ViewportTransform3D): void {
    this.viewport = viewport;
    this.applyBloom();
    if (this.controls) this.controls.autoRotate = false;
    if (!viewport.autoRotate) {
      this.turntableRotation = 0;
    }
    this.applyTurntableRotation();
    this.frameCamera();
    // A cue-mode switch must take effect immediately even when playback is
    // stopped; otherwise the glowing now-plane lingers until the next playhead
    // step. Re-derive visibility and clip state from the last known playhead.
    this.applyPlaybackCue();
    this.renderOnce();
  }

  public setBackground(backgroundColor: string, atmosphereColors?: string[]): void {
    const colorsChanged = !this.currentAtmosphereColors || !atmosphereColors ||
      this.currentAtmosphereColors.length !== atmosphereColors.length ||
      this.currentAtmosphereColors.some((c, idx) => c !== atmosphereColors![idx]);

    if (this.currentBgColor === backgroundColor && !colorsChanged) {
      return;
    }
    this.currentBgColor = backgroundColor;
    this.currentAtmosphereColors = atmosphereColors ? [...atmosphereColors] : null;

    if (this.scene.background instanceof THREE.Texture) {
      this.scene.background.dispose();
    }

    // Top color: a single subtle merged accent hue (25% sat / 8% light, per the
    // plan) derived circularly from the provided atmosphere colors, so all
    // visible tracks combine into ONE atmospheric tint rather than multiple
    // competing gradient stops. Falls back to the backgroundColor itself.
    let topColor = backgroundColor;
    const hues = (atmosphereColors ?? [])
      .map((c) => c.match(/hsl\((\d+)/))
      .map((m) => (m ? parseInt(m[1], 10) : NaN))
      .filter((h) => !Number.isNaN(h));
    if (hues.length > 0) {
      const sum = hues.reduce(
        (acc, h) => {
          const r = (h * Math.PI) / 180;
          return { x: acc.x + Math.cos(r), y: acc.y + Math.sin(r) };
        },
        { x: 0, y: 0 },
      );
      const avgHue = (Math.atan2(sum.y, sum.x) * 180) / Math.PI;
      const hue = (avgHue + 360) % 360;
      topColor = `hsl(${Math.round(hue)}, 25%, 8%)`;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, topColor);

    // Bottom color: darken the backgroundColor; for pure black, use near-black.
    let bottomColor = 'hsl(0, 0%, 1%)';
    if (backgroundColor !== '#000000' && backgroundColor.startsWith('hsl(')) {
      const match = backgroundColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
      if (match) {
        const h = match[1];
        const s = match[2];
        const l = parseInt(match[3], 10);
        bottomColor = `hsl(${h}, ${s}%, ${Math.max(1, Math.round(l / 4))}%)`;
      }
    } else if (backgroundColor === '#000000' && hues.length > 0) {
      // Keep the subtle accent hue flowing into the bottom as well when the user
      // chose the pure-black background mode.
      const match = topColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
      if (match) bottomColor = `hsl(${match[1]}, ${match[2]}%, 2%)`;
    }

    gradient.addColorStop(1, bottomColor);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2, 256);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = texture;

    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.set(backgroundColor);
    }
    this.renderOnce();
  }

  public stepPlayhead(t: number | null): void {
    if (!this.nowPlane) return;
    if (t === null) {
      this.previousPlayhead = null;
    } else {
      this.nowPlane.position.z = this.worldZ(t * this.zScale);
      this.spawnOnsetPulses(this.previousPlayhead, t);
      this.previousPlayhead = t;
      if (this.viewport.autoFollow || this.viewport.chaseCamera) this.followPlayhead(t);
    }
    this.applyPlaybackCue();
    this.updateOnsetPulses();
    if (this.viewport.autoRotate) {
      this.turntableRotation += 0.005;
    } else {
      this.turntableRotation = 0;
    }
    this.applyTurntableRotation();
    if (this.controls) this.controls.update();
    this.renderOnce();
  }

  /**
   * Synchronizes now-plane visibility and the reveal clip plane with the
   * current `playbackCue` and the last playhead. Without a playhead the
   * now-plane is hidden and reveal is fully opened (nothing clipped); with a
   * playhead the now-plane shows only in `now_plane` mode and the clip plane
   * engages only in `reveal` mode. Centralizing this avoids the now-plane
   * lingering visible after a mode switch while paused.
   */
  private applyPlaybackCue(): void {
    if (!this.nowPlane) return;
    const cue = this.viewport.playbackCue;
    if (this.previousPlayhead === null) {
      this.nowPlane.visible = false;
      this.revealPlane.constant = 1e7;
      return;
    }
    this.nowPlane.visible = cue === 'now_plane';
    this.revealPlane.constant = cue === 'reveal' ? this.nowPlane.position.z : 1e7;
  }

  public capturePNG(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const canvas = this.renderer?.domElement;
      if (!canvas) return reject(new Error('3D renderer not mounted'));
      this.renderOnce();
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG capture failed'))), 'image/png');
    });
  }

  public captureWebM(durationSeconds: number): Promise<Blob> {
    const canvas = this.renderer?.domElement;
    if (!canvas || typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
      return Promise.reject(new Error('WebM capture is not supported in this browser'));
    }
    const stream = canvas.captureStream(30);
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : undefined });
    return new Promise((resolve, reject) => {
      recorder.addEventListener('dataavailable', (event) => { if (event.data.size) chunks.push(event.data); });
      recorder.addEventListener('error', () => reject(new Error('WebM recording failed')));
      recorder.addEventListener('stop', () => resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' })));
      recorder.start();
      const started = performance.now();
      const frame = () => {
        if (this.viewport.autoRotate) {
          this.turntableRotation += 0.005;
        } else {
          this.turntableRotation = 0;
        }
        this.applyTurntableRotation();
        if (this.controls) this.controls.update();
        this.renderOnce();
        if (performance.now() - started >= durationSeconds * 1000) recorder.stop();
        else requestAnimationFrame(frame);
      };
      frame();
    });
  }

  public dispose(): void {
    this.clearContent();
    this.clearOnsetPulses();
    this.disposeNowPlane();
    if (this.scene.background instanceof THREE.Texture) this.scene.background.dispose();
    this.bloomPass?.dispose();
    this.composer?.dispose();
    this.controls?.dispose();
    this.controls = null;
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
    this.revealMaterials = [];
    this.contentGroup.traverse((obj) => {
      const mesh = obj as THREE.Mesh & { geometry?: THREE.BufferGeometry; material?: THREE.Material };
      mesh.geometry?.dispose?.();
      if (mesh.material && mesh.material !== this.nowPlane?.material) {
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((mat) => mat.dispose());
      }
    });
    this.contentGroup.clear();
  }

  private createBuildContext(): GeometryBuildContext {
    return {
      worldX: (x: number) => this.worldX(x),
      worldY: (y: number) => this.worldY(y),
      worldZ: (z: number) => this.worldZ(z),
      contentGroup: this.contentGroup,
      revealPlane: this.revealPlane,
      lineMaterials: this.lineMaterials,
      revealMaterials: this.revealMaterials,
      width: this.width,
      height: this.height,
    };
  }

  private rebuildContent(): void {
    if (!this.geometry) return;
    this.clearContent();
    this.clearOnsetPulses();

    const ctx = this.createBuildContext();
    if (this.geometry.segments.length > 0) buildLines(ctx, this.geometry);
    if (this.geometry.discs.length > 0) {
      if (this.geometry.config.variation === '3d_note_spheres') buildSpheres(ctx, this.geometry);
      else buildDiscs(ctx, this.geometry);
    }
    if (this.geometry.boxes.length > 0) buildBoxes(ctx, this.geometry);
    this.buildAtmosphere(this.geometry);
    this.buildNowPlane(this.geometry);
  }

  /** A fixed grounding grid and seeded star field give orbiting views depth without randomness. */
  private buildAtmosphere(geometry: RenderedGeometry3D): void {
    const grid = new THREE.GridHelper(Math.max(geometry.width, geometry.depth) * 1.15, 18, 0x263d65, 0x132138);
    grid.rotation.x = Math.PI / 2;
    grid.position.y = -geometry.height / 2 - 28;
    grid.position.z = 0;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.3;
    this.contentGroup.add(grid);

    const positions: number[] = [];
    let seed = 0x9e3779b9;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };
    const span = Math.max(geometry.width, geometry.height, geometry.depth) * 1.25;
    for (let i = 0; i < 160; i++) positions.push((random() - 0.5) * span, (random() - 0.5) * span, (random() - 0.5) * span);
    const stars = new THREE.BufferGeometry();
    stars.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.contentGroup.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0x7892c9, size: 1.5, transparent: true, opacity: 0.32, depthWrite: false })));
  }

  /**
   * Removes the now-plane mesh from the scene and frees its GPU resources.
   * Callers that rebuild content must use this before adding a replacement —
   * otherwise disposed meshes stay in the scene graph as stuck glowing planes
   * that no longer follow the playhead or cue mode.
   */
  private disposeNowPlane(): void {
    if (!this.nowPlane) return;
    this.scene.remove(this.nowPlane);
    this.nowPlane.geometry.dispose();
    (this.nowPlane.material as THREE.Material).dispose();
    this.nowPlane = null;
  }

  private buildNowPlane(geometry: RenderedGeometry3D): void {
    // Drop any previous now-plane from the scene before adding a new one. A
    // full render() (e.g. switching Playback Cue) rebuilds geometry; without
    // this removal the old mesh was orphaned and kept rendering in place.
    this.disposeNowPlane();

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

  private spawnOnsetPulses(previous: number | null, current: number): void {
    if (!this.geometry || previous === null || current < previous) return;
    const notes = [
      ...this.geometry.segments.map((segment) => ({ note: segment.note, x: segment.startX, y: segment.startY, z: segment.startZ, color: segment.color })),
      ...this.geometry.discs.map((disc) => ({ note: disc.note, x: disc.cx, y: disc.cy, z: disc.cz, color: disc.fillColor })),
      ...this.geometry.boxes.map((box) => ({ note: box.note, x: box.cx, y: box.cy, z: box.cz - box.sz / 2, color: box.color })),
    ];
    for (const item of notes) {
      if (item.note.onset <= previous || item.note.onset > current) continue;
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.78, 1, 28),
        new THREE.MeshBasicMaterial({ color: item.color, transparent: true, opacity: 0.95, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      mesh.position.set(this.worldX(item.x), this.worldY(item.y), this.worldZ(item.z) + 1);
      this.contentGroup.add(mesh);
      this.onsetPulses.push({ mesh, startedAt: performance.now() });
    }
  }

  private updateOnsetPulses(): void {
    const now = performance.now();
    this.onsetPulses = this.onsetPulses.filter(({ mesh, startedAt }) => {
      const progress = (now - startedAt) / 520;
      if (progress >= 1) {
        this.contentGroup.remove(mesh);
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

  private clearOnsetPulses(): void {
    for (const { mesh } of this.onsetPulses) {
      this.contentGroup.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.onsetPulses = [];
  }

  private frameCamera(): void {
    const preset = CAMERA_PRESETS_3D[this.viewport.preset];
    const { azimuth, elevation } = preset ?? { azimuth: this.viewport.azimuth, elevation: this.viewport.elevation };
    const az = (azimuth * Math.PI) / 180;
    const el = (elevation * Math.PI) / 180;
    const dir = new THREE.Vector3(
      Math.cos(el) * Math.sin(az),
      Math.sin(el),
      Math.cos(el) * Math.cos(az),
    );
    const distance = this.radius * 3 + 100;
    const target = this.center.clone().add(new THREE.Vector3(this.viewport.panX, this.viewport.panY, 0));
    this.camera.position.copy(target).addScaledVector(dir, distance);
    // For the time-up preset, world Z (time) is the screen vertical: up = world Z,
    // and the camera looks along world -Y (dir = (0, -1, 0)) so the X/Y calligraphy
    // faces the viewer while time advances upward in the image.
    if (this.viewport.preset === '3d_time_up') {
      this.camera.up.set(0, 0, 1);
      this.camera.position.copy(target).add(new THREE.Vector3(0, -distance, 0));
      this.camera.lookAt(target);
    } else {
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(target);
    }

    const aspect = this.width / this.height;
    const half = this.radius * 1.25 / Math.max(0.25, this.viewport.zoom);
    this.camera.left = -half * aspect;
    this.camera.right = half * aspect;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.near = 0.1;
    this.camera.far = distance + this.radius * 4;
    this.camera.updateProjectionMatrix();
    if (this.controls) {
      this.controls.target.copy(target);
      this.controls.update();
    }
  }

  private followPlayhead(t: number): void {
    if (!this.geometry) return;
    const active = [
      ...this.geometry.segments.filter((segment) => segment.note.onset <= t + 2 && segment.note.onset + segment.note.duration >= t - 2).map((segment) => new THREE.Vector3(this.worldX((segment.startX + segment.endX) / 2), this.worldY((segment.startY + segment.endY) / 2), this.worldZ((segment.startZ + segment.endZ) / 2))),
      ...this.geometry.discs.filter((disc) => disc.note.onset <= t + 2 && disc.note.onset + disc.note.duration >= t - 2).map((disc) => new THREE.Vector3(this.worldX(disc.cx), this.worldY(disc.cy), this.worldZ(disc.cz))),
      ...this.geometry.boxes.filter((box) => box.note.onset <= t + 2 && box.note.onset + box.note.duration >= t - 2).map((box) => new THREE.Vector3(this.worldX(box.cx), this.worldY(box.cy), this.worldZ(box.cz))),
    ];
    const target = active.length ? active.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / active.length) : this.center.clone();
    if (this.viewport.chaseCamera) target.z = this.worldZ(t * this.zScale) + this.radius * 0.12;
    if (this.controls) {
      this.controls.target.lerp(target, 0.12);
      const offset = this.camera.position.clone().sub(this.controls.target).normalize().multiplyScalar(this.radius * 3 + 100);
      this.camera.position.lerp(this.controls.target.clone().add(offset), 0.12);
      this.camera.lookAt(this.controls.target);
    }
  }

  /** Keep manual orbit framing serializable for a future session/manifest. */
  private recordOrbitViewport(): void {
    if (!this.controls) return;
    const offset = this.camera.position.clone().sub(this.controls.target);
    const distance = Math.max(offset.length(), 0.001);
    this.viewport = {
      ...this.viewport,
      preset: '3d_free',
      azimuth: Math.atan2(offset.x, offset.z) * 180 / Math.PI,
      elevation: Math.asin(offset.y / distance) * 180 / Math.PI,
      zoom: this.radius * 1.25 / Math.max(this.camera.top, 0.001),
      panX: this.controls.target.x - this.center.x,
      panY: this.controls.target.y - this.center.y,
    };
    this.onViewportChange?.({ ...this.viewport });
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
      for (const box3d of this.geometry.boxes) {
        const center = p.set(this.worldX(box3d.cx), this.worldY(box3d.cy), this.worldZ(box3d.cz));
        box.expandByPoint(center.clone().add(new THREE.Vector3(box3d.sx / 2, box3d.sy / 2, box3d.sz / 2)));
        box.expandByPoint(center.clone().sub(new THREE.Vector3(box3d.sx / 2, box3d.sy / 2, box3d.sz / 2)));
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
