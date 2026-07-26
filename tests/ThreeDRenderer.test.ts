import { describe, it, expect } from 'vitest';
import { ThreeDRenderer } from '../src/renderers/three/ThreeDRenderer.js';
import { RenderedGeometry3D } from '../src/core/types.js';
import * as THREE from 'three';

const dummyGeometry: RenderedGeometry3D = {
  kind: '3d',
  width: 800,
  height: 600,
  depth: 100,
  zScale: 100,
  segments: [],
  discs: [],
  boxes: [
    {
      cx: 100,
      cy: 200,
      cz: 50,
      sx: 10,
      sy: 20,
      sz: 30,
      color: '#ff0000',
      opacity: 0.96,
      note: { id: '1', pitch: 60, onset: 0.5, duration: 1, velocity: 15, voice: 0, pitchClass: 0 }
    }
  ],
  config: {
    variation: '3d_piano_roll',
    zScale: 100,
  } as any,
  bpm: 120
};

describe('ThreeDRenderer - buildBoxes', () => {
  it('correctly sets box material flags', () => {
    const renderer = new ThreeDRenderer();
    renderer.setGeometry(dummyGeometry);

    const children = (renderer as any).contentGroup.children;
    const boxesMesh = children.find((c: any) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;

    expect(boxesMesh).toBeDefined();
    expect(boxesMesh.geometry).toBeInstanceOf(THREE.BoxGeometry);

    const material = boxesMesh.material as THREE.MeshBasicMaterial;
    expect(material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(material.vertexColors).toBe(false);
    expect(material.depthWrite).toBe(false);
    expect(material.transparent).toBe(true);
    expect(material.side).toBe(THREE.FrontSide);
    expect(material.clippingPlanes).toEqual([(renderer as any).revealPlane]);
  });

  it('correctly sets instanceColor for hue', () => {
    const renderer = new ThreeDRenderer();
    renderer.setGeometry(dummyGeometry);

    const children = (renderer as any).contentGroup.children;
    const boxesMesh = children.find((c: any) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;

    expect(boxesMesh.instanceColor).not.toBeNull();
    const color = new THREE.Color();
    boxesMesh.getColorAt(0, color);
    expect(color.getHexString()).toBe('ff0000');
  });

  it('groups boxes into distinct opacity buckets based on velocity', () => {
    // 3 notes corresponding to different velocity bands:
    // Note 1: velocity 15 -> opacity 0.55 bucket
    // Note 2: velocity 75 -> opacity 0.85 bucket
    // Note 3: velocity 120 -> opacity 0.95 bucket
    const bucketGeometry: RenderedGeometry3D = {
      kind: '3d',
      width: 800,
      height: 600,
      depth: 100,
      zScale: 100,
      segments: [],
      discs: [],
      boxes: [
        {
          cx: 100, cy: 100, cz: 50, sx: 10, sy: 10, sz: 10,
          color: '#ff0000',
          opacity: 0.55 + (15 / 127) * 0.4, // ~0.597 -> < 0.625 -> bucket 0.55
          note: { id: '1', pitch: 60, onset: 0.5, duration: 1, velocity: 15, voice: 0, pitchClass: 0 }
        },
        {
          cx: 150, cy: 150, cz: 75, sx: 10, sy: 10, sz: 10,
          color: '#00ff00',
          opacity: 0.55 + (75 / 127) * 0.4, // ~0.786 -> 0.775 <= opacity < 0.90 -> bucket 0.85
          note: { id: '2', pitch: 64, onset: 0.75, duration: 1, velocity: 75, voice: 0, pitchClass: 4 }
        },
        {
          cx: 200, cy: 200, cz: 100, sx: 10, sy: 10, sz: 10,
          color: '#0000ff',
          opacity: 0.55 + (120 / 127) * 0.4, // ~0.928 -> >= 0.90 -> bucket 0.95
          note: { id: '3', pitch: 67, onset: 1.0, duration: 1, velocity: 120, voice: 0, pitchClass: 7 }
        }
      ],
      config: {
        variation: '3d_piano_roll',
        zScale: 100,
      } as any,
      bpm: 120
    };

    const renderer = new ThreeDRenderer();
    renderer.setGeometry(bucketGeometry);

    const children = (renderer as any).contentGroup.children;
    const meshes = children.filter((c: any) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh[];

    // Expect exactly 3 InstancedMeshes (one for each used bucket: 0.55, 0.85, 0.95)
    expect(meshes.length).toBe(3);

    // Verify buckets and properties
    const opacities = meshes.map((m) => (m.material as THREE.MeshBasicMaterial).opacity);
    expect(opacities).toContain(0.55);
    expect(opacities).toContain(0.85);
    expect(opacities).toContain(0.95);

    // Verify unique BoxGeometry instances per bucket to prevent double-disposal state issues
    const geometries = meshes.map((m) => m.geometry);
    expect(geometries[0]).not.toBe(geometries[1]);
    expect(geometries[0]).not.toBe(geometries[2]);
    expect(geometries[1]).not.toBe(geometries[2]);
  });
});
