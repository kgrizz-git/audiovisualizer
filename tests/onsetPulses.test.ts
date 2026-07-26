import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { OnsetPulseController } from '../src/renderers/three/onsetPulses.js';
import { RenderedGeometry3D } from '../src/core/types.js';

describe('OnsetPulseController', () => {
  const mockCoords = {
    worldX: (x: number) => x - 400,
    worldY: (y: number) => -(y - 300),
    worldZ: (z: number) => z - 50,
  };

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
        note: { id: '1', pitch: 60, onset: 0.5, duration: 1, velocity: 15, voice: 0, pitchClass: 0 },
      },
      {
        cx: 150,
        cy: 250,
        cz: 60,
        sx: 10,
        sy: 20,
        sz: 30,
        color: '#00ff00',
        opacity: 0.96,
        note: { id: '2', pitch: 64, onset: 1.5, duration: 1, velocity: 15, voice: 0, pitchClass: 4 },
      },
    ],
    config: {
      variation: '3d_piano_roll',
      zScale: 100,
    } as any,
    bpm: 120,
  };

  it('spawns onset pulse rings for notes within playhead window', () => {
    const controller = new OnsetPulseController();
    const group = new THREE.Group();

    expect(controller.count()).toBe(0);

    // Spawn for range (0, 0.8) -> should spawn note at onset 0.5
    controller.spawn(0, 0.8, dummyGeometry, group, mockCoords);

    expect(controller.count()).toBe(1);
    expect(group.children.length).toBe(1);

    const ringMesh = group.children[0] as THREE.Mesh;
    expect(ringMesh.geometry).toBeInstanceOf(THREE.RingGeometry);
  });

  it('updates pulse scale and cleans up expired pulses', () => {
    const controller = new OnsetPulseController();
    const group = new THREE.Group();

    controller.spawn(0, 0.8, dummyGeometry, group, mockCoords);
    expect(controller.count()).toBe(1);

    // Initial update right away
    controller.update(group);
    expect(controller.count()).toBe(1);

    // Manually push startedAt back to simulate 600ms passing (> 520ms)
    const internalPulses = (controller as any).onsetPulses;
    internalPulses[0].startedAt = performance.now() - 600;

    controller.update(group);
    expect(controller.count()).toBe(0);
    expect(group.children.length).toBe(0);
  });

  it('clears all active pulses when clear is called', () => {
    const controller = new OnsetPulseController();
    const group = new THREE.Group();

    controller.spawn(0, 2.0, dummyGeometry, group, mockCoords);
    expect(controller.count()).toBe(2);

    controller.clear(group);
    expect(controller.count()).toBe(0);
    expect(group.children.length).toBe(0);
  });
});
