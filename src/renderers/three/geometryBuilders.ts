import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { RenderedGeometry3D } from '../../core/types.js';

/** Fraction of a note's Z extent that renders at full opacity; the remainder fades as a release tail. */
const RELEASE_BODY_FRACTION = 0.7;

export interface GeometryBuildContext {
  worldX: (x: number) => number;
  worldY: (y: number) => number;
  worldZ: (z: number) => number;
  contentGroup: THREE.Group;
  revealPlane: THREE.Plane;
  lineMaterials: LineMaterial[];
  revealMaterials: THREE.Material[];
  width: number;
  height: number;
}

function opacityGroups<T extends { opacity: number }>(items: readonly T[]): T[][] {
  const groups = new Map<string, T[]>();
  items.forEach((item) => {
    const key = item.opacity.toFixed(4);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  });
  return [...groups.values()];
}

export function buildLines(ctx: GeometryBuildContext, geometry: RenderedGeometry3D): void {
  opacityGroups(geometry.segments).forEach((segments) => {
    const layer = { ...geometry, segments };
    buildLineLayer(ctx, layer, segments[0].opacity);
    buildLineSlabs(ctx, layer, segments[0].opacity);
  });
}

function buildLineLayer(ctx: GeometryBuildContext, geometry: RenderedGeometry3D, opacity: number): void {
  const positions: number[] = [];
  const colors: number[] = [];
  let widthSum = 0;
  const color = new THREE.Color();

  for (const seg of geometry.segments) {
    positions.push(
      ctx.worldX(seg.startX), ctx.worldY(seg.startY), ctx.worldZ(seg.startZ),
      ctx.worldX(seg.endX), ctx.worldY(seg.endY), ctx.worldZ(seg.endZ),
    );
    color.set(seg.color);
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
    opacity,
  });
  material.clippingPlanes = [ctx.revealPlane];
  material.resolution.set(ctx.width, ctx.height);
  ctx.lineMaterials.push(material);

  ctx.contentGroup.add(new LineSegments2(lineGeometry, material));
}

/**
 * Axis-aligned Z-extruded instanced slabs (one per note segment) so the calligraphic
 * ribbons read as solid, time-thick strokes from the side and the Time-up view. Each
 * slab spans the note's onset→offset on Z (thickness proportional to note duration); a
 * dimmer tail slab over the release fraction gives long notes a gradual fade-out.
 */
export function buildLineSlabs(ctx: GeometryBuildContext, geometry: RenderedGeometry3D, opacity: number): void {
  if (geometry.segments.length === 0) return;
  buildSlabSet(ctx, geometry, /* tail */ false, opacity);
  buildSlabSet(ctx, geometry, /* tail */ true, opacity);
}

export function buildSlabSet(ctx: GeometryBuildContext, geometry: RenderedGeometry3D, tail: boolean, opacity: number): void {
  const segs = geometry.segments.filter((seg) => seg.role !== 'gap');
  if (segs.length === 0) return;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: opacity * (tail ? 0.4 : 0.82),
    vertexColors: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  material.clippingPlanes = [ctx.revealPlane];
  const slabs = new THREE.InstancedMesh(box, material, segs.length);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  segs.forEach((seg, i) => {
    const startZ = ctx.worldZ(seg.startZ);
    const endZ = ctx.worldZ(seg.endZ);
    const full = Math.max(2, endZ - startZ);
    const bodyFrac = RELEASE_BODY_FRACTION;
    const z0 = tail ? startZ + full * bodyFrac : startZ;
    const z1 = tail ? endZ : startZ + full * bodyFrac;
    const thickness = Math.max(1.5, seg.width * 0.85);
    const cx = (ctx.worldX(seg.startX) + ctx.worldX(seg.endX)) / 2;
    const cy = (ctx.worldY(seg.startY) + ctx.worldY(seg.endY)) / 2;
    const cz = (z0 + z1) / 2;
    const sz = Math.max(1, z1 - z0);
    matrix.makeScale(thickness, thickness, sz);
    matrix.setPosition(cx, cy, cz);
    slabs.setMatrixAt(i, matrix);
    color.set(seg.color);
    slabs.setColorAt(i, color);
  });
  slabs.instanceMatrix.needsUpdate = true;
  if (slabs.instanceColor) slabs.instanceColor.needsUpdate = true;
  ctx.contentGroup.add(slabs);
  ctx.revealMaterials.push(material);
}

export function buildDiscs(ctx: GeometryBuildContext, geometry: RenderedGeometry3D): void {
  opacityGroups(geometry.discs).forEach((discs) => buildDiscLayer(ctx, { ...geometry, discs }, discs[0].opacity));
}

function buildDiscLayer(ctx: GeometryBuildContext, geometry: RenderedGeometry3D, opacity: number): void {
  const count = geometry.discs.length;

  // Glowing front-facing cap that retains the halo look from the front.
  const capGeometry = new THREE.CircleGeometry(1, 32);
  const capMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  capMaterial.clippingPlanes = [ctx.revealPlane];
  const caps = new THREE.InstancedMesh(capGeometry, capMaterial, count);

  // Z-aligned cylinder: from the front it reads as the disc; from the side it reads
  // as a fat ring whose height equals the note's duration × zScale. Cylinder axis runs
  // along Z, so the geometry is rotated −90° about X.
  const bodyRadius = 1;
  const bodyGeometry = new THREE.CylinderGeometry(bodyRadius, bodyRadius, 1, 28, 1, true);
  bodyGeometry.rotateX(Math.PI / 2);
  const bodyMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  bodyMaterial.clippingPlanes = [ctx.revealPlane];
  const bodies = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, count);

  // Dimmer tail slab for the release fade of long notes.
  const tailGeometry = new THREE.CylinderGeometry(bodyRadius, bodyRadius, 1, 28, 1, true);
  tailGeometry.rotateX(Math.PI / 2);
  const tailMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: opacity * 0.38,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  tailMaterial.clippingPlanes = [ctx.revealPlane];
  const tails = new THREE.InstancedMesh(tailGeometry, tailMaterial, count);

  const ringGeometry = new THREE.RingGeometry(0.92, 1, 40);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: opacity * 0.75,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  ringMaterial.clippingPlanes = [ctx.revealPlane];
  const rings = new THREE.InstancedMesh(ringGeometry, ringMaterial, count);

  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  geometry.discs.forEach((disc, i) => {
    const cz = ctx.worldZ(disc.cz);
    const extent = Math.max(1, disc.czExtent);
    const full = 2 * extent;
    const bodyFrac = RELEASE_BODY_FRACTION;
    const bodyHeight = Math.max(1, full * bodyFrac);
    const tailHeight = Math.max(1, full * (1 - bodyFrac));

    matrix.makeScale(disc.radius, disc.radius, 1);
    matrix.setPosition(ctx.worldX(disc.cx), ctx.worldY(disc.cy), cz);
    caps.setMatrixAt(i, matrix);
    rings.setMatrixAt(i, matrix);

    const bodyCenterZ = cz - extent + bodyHeight / 2;
    matrix.makeScale(disc.radius, disc.radius, bodyHeight);
    matrix.setPosition(ctx.worldX(disc.cx), ctx.worldY(disc.cy), bodyCenterZ);
    bodies.setMatrixAt(i, matrix);

    const tailCenterZ = cz - extent + bodyHeight + tailHeight / 2;
    matrix.makeScale(disc.radius, disc.radius, tailHeight * 1.15);
    matrix.setPosition(ctx.worldX(disc.cx), ctx.worldY(disc.cy), tailCenterZ);
    tails.setMatrixAt(i, matrix);

    color.set(disc.fillColor);
    caps.setColorAt(i, color);
    bodies.setColorAt(i, color);
    tails.setColorAt(i, color);
  });
  caps.instanceMatrix.needsUpdate = true;
  bodies.instanceMatrix.needsUpdate = true;
  tails.instanceMatrix.needsUpdate = true;
  rings.instanceMatrix.needsUpdate = true;
  if (caps.instanceColor) caps.instanceColor.needsUpdate = true;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  if (tails.instanceColor) tails.instanceColor.needsUpdate = true;

  ctx.contentGroup.add(caps, bodies, tails, rings);
  ctx.revealMaterials.push(capMaterial, bodyMaterial, tailMaterial, ringMaterial);
}

/**
 * `3d_note_spheres`: instanced spheres, one per note, reusing the note-halo XY path from
 * the 2D `circles` mapper and the same disc geometry (`GeometryDisc3D`). Sphere radius is
 * proportional to the note's duration (radius = the note's half-Z-extent, so a sphere's
 * diameter spans the note's onset→offset on the time axis), with a small floor so short
 * notes remain visible. A dimmer, slightly larger halo sphere gives each note a soft glow.
 */
export function buildSpheres(ctx: GeometryBuildContext, geometry: RenderedGeometry3D): void {
  opacityGroups(geometry.discs).forEach((discs) => buildSphereLayer(ctx, { ...geometry, discs }, discs[0].opacity));
}

function buildSphereLayer(ctx: GeometryBuildContext, geometry: RenderedGeometry3D, opacity: number): void {
  const count = geometry.discs.length;
  const sphereGeometry = new THREE.SphereGeometry(1, 24, 18);
  const coreMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity,
    depthWrite: false,
  });
  coreMaterial.clippingPlanes = [ctx.revealPlane];
  const cores = new THREE.InstancedMesh(sphereGeometry, coreMaterial, count);

  const haloMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: opacity * 0.24,
    side: THREE.BackSide,
    depthWrite: false,
  });
  haloMaterial.clippingPlanes = [ctx.revealPlane];
  const halos = new THREE.InstancedMesh(sphereGeometry, haloMaterial, count);

  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  geometry.discs.forEach((disc, i) => {
    const extent = Math.max(disc.czExtent, 2); // floor keeps short notes visible
    const cx = ctx.worldX(disc.cx);
    const cy = ctx.worldY(disc.cy);
    const cz = ctx.worldZ(disc.cz);
    matrix.makeScale(extent, extent, extent);
    matrix.setPosition(cx, cy, cz);
    cores.setMatrixAt(i, matrix);
    // Soft outer halo: ~1.4× the core radius for a faint bloom-like shell.
    const haloR = extent * 1.4;
    matrix.makeScale(haloR, haloR, haloR);
    matrix.setPosition(cx, cy, cz);
    halos.setMatrixAt(i, matrix);
    color.set(disc.fillColor);
    cores.setColorAt(i, color);
    halos.setColorAt(i, color);
  });
  cores.instanceMatrix.needsUpdate = true;
  halos.instanceMatrix.needsUpdate = true;
  if (cores.instanceColor) cores.instanceColor.needsUpdate = true;
  if (halos.instanceColor) halos.instanceColor.needsUpdate = true;

  ctx.contentGroup.add(halos, cores);
  ctx.revealMaterials.push(coreMaterial, haloMaterial);
}

export function bucketOpacity(opacity: number): number {
  if (opacity < 0.625) return 0.55;
  if (opacity < 0.775) return 0.70;
  if (opacity < 0.90) return 0.85;
  return 0.95;
}

export function buildBoxes(ctx: GeometryBuildContext, geometry: RenderedGeometry3D): void {
  const bucketMap = new Map<number, typeof geometry.boxes>();
  geometry.boxes.forEach((box) => {
    const opacity = bucketOpacity(box.opacity);
    if (!bucketMap.has(opacity)) {
      bucketMap.set(opacity, []);
    }
    bucketMap.get(opacity)!.push(box);
  });

  bucketMap.forEach((bucketBoxes, opacity) => {
    const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity,
      vertexColors: false,
      depthWrite: false,
    });
    material.clippingPlanes = [ctx.revealPlane];
    const boxes = new THREE.InstancedMesh(boxGeometry, material, bucketBoxes.length);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    bucketBoxes.forEach((box, index) => {
      matrix.makeScale(box.sx, box.sy, box.sz);
      matrix.setPosition(ctx.worldX(box.cx), ctx.worldY(box.cy), ctx.worldZ(box.cz));
      boxes.setMatrixAt(index, matrix);
      color.set(box.color);
      boxes.setColorAt(index, color);
    });
    boxes.instanceMatrix.needsUpdate = true;
    if (boxes.instanceColor) boxes.instanceColor.needsUpdate = true;
    ctx.contentGroup.add(boxes);
    ctx.revealMaterials.push(material);
  });
}
