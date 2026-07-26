import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  makeGradientBackground,
  buildAtmosphere,
  buildNowPlane,
  disposeNowPlane,
} from '../src/renderers/three/sceneAtmosphere.js';
import { RenderedGeometry3D } from '../src/core/types.js';

const dummyGeometry: RenderedGeometry3D = {
  kind: '3d',
  width: 800,
  height: 600,
  depth: 100,
  zScale: 100,
  segments: [],
  discs: [],
  boxes: [],
  config: {
    variation: '3d_piano_roll',
    zScale: 100,
  } as any,
  bpm: 120,
};

describe('sceneAtmosphere', () => {
  it('makeGradientBackground creates a Texture', () => {
    const texture = makeGradientBackground();
    expect(texture).toBeInstanceOf(THREE.Texture);
  });

  it('buildAtmosphere adds grid helper and star field to group', () => {
    const group = new THREE.Group();
    buildAtmosphere(group, dummyGeometry);

    expect(group.children.length).toBe(2);

    const grid = group.children[0] as THREE.GridHelper;
    expect(grid).toBeInstanceOf(THREE.GridHelper);
    expect((grid.material as THREE.Material).transparent).toBe(true);
    expect((grid.material as THREE.Material).opacity).toBe(0.3);

    const stars = group.children[1] as THREE.Points;
    expect(stars).toBeInstanceOf(THREE.Points);
    expect(stars.geometry.getAttribute('position').count).toBe(160);
  });

  it('buildNowPlane creates nowPlane and adds to scene', () => {
    const scene = new THREE.Scene();
    const plane = buildNowPlane(scene, null, dummyGeometry);

    expect(plane).toBeInstanceOf(THREE.Mesh);
    expect(plane.visible).toBe(false);
    expect(scene.children.includes(plane)).toBe(true);
  });

  it('disposeNowPlane removes plane from scene and returns null', () => {
    const scene = new THREE.Scene();
    const plane = buildNowPlane(scene, null, dummyGeometry);
    expect(scene.children.length).toBe(1);

    const result = disposeNowPlane(scene, plane);
    expect(result).toBeNull();
    expect(scene.children.length).toBe(0);
  });

  it('buildNowPlane disposes existing plane when called with currentNowPlane', () => {
    const scene = new THREE.Scene();
    const plane1 = buildNowPlane(scene, null, dummyGeometry);
    const plane2 = buildNowPlane(scene, plane1, dummyGeometry);

    expect(plane2).not.toBe(plane1);
    expect(scene.children.length).toBe(1);
    expect(scene.children[0]).toBe(plane2);
  });
});
