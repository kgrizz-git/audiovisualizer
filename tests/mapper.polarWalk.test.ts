import { describe, it, expect } from 'vitest';
import { mapScoreToGeometry, DEFAULT_CONFIG } from '../src/core/mapper/scoreMapper.js';
import { fitGeometryToCanvas } from '../src/core/layout/fitGeometry.js';
import { getLegendContent } from '../src/core/legend/legendContent.js';
import { parseCli } from '../src/cli/renderMidi.js';
import { NoteEvent, Score, Variation } from '../src/core/types.js';

describe('Polar Walk Mapping', () => {
  const makeScore = (notes: NoteEvent[]): Score => ({
    title: 'Test Score',
    duration: Math.max(...notes.map((n) => n.onset + n.duration), 0),
    bpm: 120,
    tracks: [{ name: 'Track 1', channel: 0, program: 0, instrumentName: 'Piano', isPercussion: false, notes }],
  });

  const note = (partial: Partial<NoteEvent> & Pick<NoteEvent, 'id' | 'pitch' | 'onset' | 'duration'>): NoteEvent => ({
    velocity: 100,
    voice: 0,
    pitchClass: partial.pitch % 12,
    ...partial,
  });

  it('starts at center and walks in absolute direction based on pitch class', () => {
    const score = makeScore([
      note({ id: 'c4', pitch: 60, onset: 0, duration: 1 }), // pitch class 0 => 0 degrees (right)
    ]);
    const config = {
      ...DEFAULT_CONFIG,
      variation: 'polar_walk' as Variation,
      lengthScale: 10,
    };
    const geometry = mapScoreToGeometry(score, config, 800, 800);

    const segments = geometry.voicePaths[0].segments;
    expect(segments).toHaveLength(1);

    const first = segments[0];
    expect(first.start.x).toBeCloseTo(400);
    expect(first.start.y).toBeCloseTo(400);
    expect(first.end.x).toBeCloseTo(410); // 400 + 10 * cos(0)
    expect(first.end.y).toBeCloseTo(400); // 400 + 10 * sin(0)
  });

  it('connects subsequent notes sequentially in chain layout', () => {
    const score = makeScore([
      note({ id: 'c4', pitch: 60, onset: 0, duration: 1 }),  // pitch class 0 => 0 deg, len 10
      note({ id: 'e4', pitch: 64, onset: 1, duration: 2 }),  // pitch class 4 => 120 deg, len 20
    ]);
    const config = {
      ...DEFAULT_CONFIG,
      variation: 'polar_walk' as Variation,
      chordLayout: 'chain' as const,
      lengthScale: 10,
    };
    const geometry = mapScoreToGeometry(score, config, 800, 800);
    const segments = geometry.voicePaths[0].segments;
    expect(segments).toHaveLength(2);

    const [s1, s2] = segments;
    // Segment 1 ends at (410, 400)
    expect(s1.end.x).toBeCloseTo(410);
    expect(s1.end.y).toBeCloseTo(400);

    // Segment 2 starts at (410, 400)
    expect(s2.start.x).toBeCloseTo(410);
    expect(s2.start.y).toBeCloseTo(400);

    // E4 is pitchClass 4 => 120 deg, len 20.
    // cos(120) = -0.5, sin(120) = 0.866
    const radE = (120 * Math.PI) / 180;
    expect(s2.end.x).toBeCloseTo(410 + 20 * Math.cos(radE));
    expect(s2.end.y).toBeCloseTo(400 + 20 * Math.sin(radE));
  });

  it('advances across rest gaps in the direction of the last note', () => {
    const score = makeScore([
      note({ id: 'c4', pitch: 60, onset: 0, duration: 1 }),  // pitch class 0 => 0 deg, len 10
      // 0.5s rest gap
      note({ id: 'e4', pitch: 64, onset: 2.5, duration: 1 }),  // pitch class 4 => 120 deg, len 10
    ]);
    const config = {
      ...DEFAULT_CONFIG,
      variation: 'polar_walk' as Variation,
      gapPolicy: 'ghost' as const,
      lengthScale: 10,
    };
    const geometry = mapScoreToGeometry(score, config, 800, 800);
    const segments = geometry.voicePaths[0].segments;
    
    // There should be: note1, gap segment, note2
    expect(segments).toHaveLength(3);
    const [, gap, s2] = segments;

    expect(gap.role).toBe('gap');
    expect(gap.start.x).toBeCloseTo(410);
    expect(gap.start.y).toBeCloseTo(400);

    // gap length = 1.5s * 10 = 15 pixels. Direction is 0 deg (from last note C4).
    expect(gap.end.x).toBeCloseTo(410 + 15);
    expect(gap.end.y).toBeCloseTo(400);

    // note 2 starts at gap endpoint
    expect(s2.start.x).toBeCloseTo(425);
    expect(s2.start.y).toBeCloseTo(400);
  });

  it('fans same-onset chord tones from current join and continues from centroid of ends', () => {
    const score = makeScore([
      note({ id: 'c4', pitch: 60, onset: 0, duration: 1 }), // pitch class 0 => 0 deg, len 10 (end: 410, 400)
      note({ id: 'e4', pitch: 64, onset: 0, duration: 1 }), // pitch class 4 => 120 deg, len 10
      note({ id: 'g4', pitch: 67, onset: 1, duration: 1 }), // pitch class 7 => 210 deg
    ]);
    const config = {
      ...DEFAULT_CONFIG,
      variation: 'polar_walk' as Variation,
      chordLayout: 'polyphony' as const,
      lengthScale: 10,
    };
    const geometry = mapScoreToGeometry(score, config, 800, 800);
    const segments = geometry.voicePaths[0].segments;
    expect(segments).toHaveLength(3);

    const [c, e, g] = segments;

    // c and e start at center (400, 400)
    expect(c.start.x).toBeCloseTo(400);
    expect(c.start.y).toBeCloseTo(400);
    expect(e.start.x).toBeCloseTo(400);
    expect(e.start.y).toBeCloseTo(400);

    // End points
    const radE = (120 * Math.PI) / 180;
    const endC = { x: 410, y: 400 };
    const endE = { x: 400 + 10 * Math.cos(radE), y: 400 + 10 * Math.sin(radE) };

    expect(c.end.x).toBeCloseTo(endC.x);
    expect(c.end.y).toBeCloseTo(endC.y);
    expect(e.end.x).toBeCloseTo(endE.x);
    expect(e.end.y).toBeCloseTo(endE.y);

    // Centroid of endpoints:
    const centroidX = (endC.x + endE.x) / 2;
    const centroidY = (endC.y + endE.y) / 2;

    // g should start at the centroid
    expect(g.start.x).toBeCloseTo(centroidX);
    expect(g.start.y).toBeCloseTo(centroidY);
  });

  it('maintains center origin under fitGeometryToCanvas for asymmetric scores', () => {
    const score = makeScore([
      note({ id: 'c4', pitch: 60, onset: 0, duration: 1 }), // pitch class 0 => 0 deg (right)
    ]);
    const config = { ...DEFAULT_CONFIG, variation: 'polar_walk' as Variation };
    const geometry = mapScoreToGeometry(score, config, 800, 800);
    const fitted = fitGeometryToCanvas(geometry, 1000, 600);

    const segment = fitted.voicePaths[0].segments[0];
    // Target center of 1000x600 is (500, 300)
    expect(segment.start.x).toBeCloseTo(500);
    expect(segment.start.y).toBeCloseTo(300);
  });

  it('returns appropriate legend content for polar_walk and 3d_polar_walk', () => {
    const content2d = getLegendContent({ ...DEFAULT_CONFIG, variation: 'polar_walk' as Variation });
    expect(content2d.title).toBe('POLAR WALK');
    expect(content2d.lines.some((line) => /continuous|walk|pitch class/i.test(line))).toBe(true);

    const content3d = getLegendContent({ ...DEFAULT_CONFIG, variation: '3d_polar_walk' as Variation });
    expect(content3d.title).toBe('3D POLAR WALK');
  });

  it('supports polar_walk in CLI parser options', () => {
    const options = parseCli(['--input', 'test.mid', '--mode', 'polar_walk']);
    expect(options).not.toBeNull();
    expect(options!.config.variation).toBe('polar_walk');
  });
});
