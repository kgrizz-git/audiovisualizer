import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../src/core/mapper/scoreMapper.js';
import { map3DGeometry, liftGeometryTo3D, base2DVariation, effectiveZScale, computeFittedSpan } from '../src/core/mapper/map3d.js';
import { mapScoreToGeometry } from '../src/core/mapper/scoreMapper.js';
import { fitGeometryToCanvas } from '../src/core/layout/fitGeometry.js';
import { DEFAULT_VIEWPORT_3D, NoteEvent, RuleConfig, Score, is3DVariation } from '../src/core/types.js';

function note(partial: Partial<NoteEvent> & Pick<NoteEvent, 'id' | 'pitch' | 'onset' | 'duration'>): NoteEvent {
  return {
    velocity: 100,
    voice: 0,
    pitchClass: partial.pitch % 12,
    ...partial,
  };
}

function scoreOf(notes: NoteEvent[], duration = 4): Score {
  return {
    title: 'Test',
    duration,
    bpm: 120,
    tracks: [{ name: 'Lead', channel: 0, program: 0, instrumentName: 'Piano', isPercussion: false, notes }],
  };
}

const linesConfig: RuleConfig = { ...DEFAULT_CONFIG, variation: '3d_lines', zScale: 100 };
const halosConfig: RuleConfig = { ...DEFAULT_CONFIG, variation: '3d_note_halos', zScale: 100 };
const spheresConfig: RuleConfig = { ...DEFAULT_CONFIG, variation: '3d_note_spheres', zScale: 100 };
const pianoConfig: RuleConfig = { ...DEFAULT_CONFIG, variation: '3d_piano_roll', zScale: 100 };

describe('base2DVariation', () => {
  it('maps 3d_lines to lines, and 3d_note_halos / 3d_note_spheres to circles', () => {
    expect(base2DVariation('3d_lines')).toBe('lines');
    expect(base2DVariation('3d_note_halos')).toBe('circles');
    expect(base2DVariation('3d_note_spheres')).toBe('circles');
  });

  it('maps 3d_radial_voice_paths to radial_voice_paths', () => {
    expect(base2DVariation('3d_radial_voice_paths')).toBe('radial_voice_paths');
  });
});

describe('3D viewport defaults', () => {
  it('defaults to the reveal cue and the time-up camera orientation', () => {
    expect(DEFAULT_VIEWPORT_3D.playbackCue).toBe('reveal');
    expect(DEFAULT_VIEWPORT_3D.preset).toBe('3d_time_up');
  });
});

describe('map3DGeometry', () => {
  it('tags geometry as 3d and preserves the requested variation in config', () => {
    const geo = map3DGeometry(scoreOf([note({ id: 'a', pitch: 60, onset: 0, duration: 1 })]), linesConfig, 800, 800);
    expect(geo.kind).toBe('3d');
    expect(geo.config.variation).toBe('3d_lines');
  });

  it('derives segment Z from note onset and offset × the effective z-scale', () => {
    const score = scoreOf([note({ id: 'a', pitch: 60, onset: 0.5, duration: 2 })]);
    const geo = map3DGeometry(score, linesConfig, 800, 800);
    const geo2d = fitGeometryToCanvas(mapScoreToGeometry(score, { ...linesConfig, variation: 'lines' }, 800, 800), 800, 800);
    const fittedSpan = computeFittedSpan(geo2d);
    const effZ = effectiveZScale(score.duration, fittedSpan, linesConfig);
    expect(geo.zScale).toBeCloseTo(effZ);
    const seg = geo.segments[0];
    expect(seg.startZ).toBeCloseTo(0.5 * effZ);
    expect(seg.endZ).toBeCloseTo(2.5 * effZ);
  });

  it('normalizes total depth to ~fitted XY span × zScale/100, independent of duration', () => {
    const shortScore = scoreOf([note({ id: 'a', pitch: 60, onset: 0, duration: 4 })], 4);
    const longScore = scoreOf([note({ id: 'a', pitch: 60, onset: 0, duration: 40 })], 40);
    const short = map3DGeometry(shortScore, linesConfig, 800, 800);
    const long = map3DGeometry(longScore, linesConfig, 800, 800);
    const span = computeFittedSpan(fitGeometryToCanvas(mapScoreToGeometry(shortScore, { ...linesConfig, variation: 'lines' }, 800, 800), 800, 800));
    expect(span).toBeLessThan(800);
    // With zScale = 100, Z depth matches the fitted X/Y span regardless of piece length.
    expect(short.depth).toBeCloseTo(span);
    expect(long.depth).toBeCloseTo(span);
  });

  it('stretches/compresses Z proportionally to zScale (the Z/time stretch control)', () => {
    const score = scoreOf([note({ id: 'a', pitch: 60, onset: 0, duration: 4 })], 4);
    const span = computeFittedSpan(fitGeometryToCanvas(mapScoreToGeometry(score, { ...linesConfig, variation: 'lines' }, 800, 800), 800, 800));
    const x2 = map3DGeometry(score, { ...linesConfig, zScale: 200 }, 800, 800).depth;
    const half = map3DGeometry(score, { ...linesConfig, zScale: 50 }, 800, 800).depth;
    expect(x2).toBeCloseTo(span * 2);
    expect(half).toBeCloseTo(span * 0.5);
  });

  it('produces discs (not segments) for 3d_note_halos with Z at onset and a Z extent for side visibility', () => {
    const score = scoreOf([note({ id: 'a', pitch: 60, onset: 1, duration: 1 })]);
    const geo = map3DGeometry(score, halosConfig, 800, 800);
    const geo2d = fitGeometryToCanvas(mapScoreToGeometry(score, { ...halosConfig, variation: 'circles' }, 800, 800), 800, 800);
    const effZ = effectiveZScale(score.duration, computeFittedSpan(geo2d), halosConfig);
    expect(geo.discs.length).toBe(1);
    expect(geo.segments.length).toBe(0);
    expect(geo.discs[0].cz).toBeCloseTo(1 * effZ);
    // Disc Z extent equals half the note duration × effZ (the renderer extrudes ± czExtent on Z).
    expect(geo.discs[0].czExtent).toBeCloseTo(1 * effZ / 2);
  });

  it('produces disc geometry for 3d_note_spheres that drives duration-proportional spheres', () => {
    const score = scoreOf([
      note({ id: 'a', pitch: 60, onset: 0, duration: 1 }),
      note({ id: 'b', pitch: 67, onset: 1, duration: 4 }),
    ]);
    const geo = map3DGeometry(score, spheresConfig, 800, 800);
    expect(is3DVariation(geo.config.variation)).toBe(true);
    expect(geo.config.variation).toBe('3d_note_spheres');
    // Spheres reuse the disc array (one per note), no segments/boxes.
    expect(geo.discs.length).toBe(2);
    expect(geo.segments).toHaveLength(0);
    expect(geo.boxes).toHaveLength(0);
    // Longer note gets a larger Z extent → larger sphere radius (radius = czExtent in renderer).
    expect(geo.discs[1].czExtent).toBeGreaterThan(geo.discs[0].czExtent);
  });

  it('preserves the 2D XY geometry exactly (front view matches fitted 2D lines)', () => {
    const notes = [
      note({ id: 'a', pitch: 60, onset: 0, duration: 1 }),
      note({ id: 'b', pitch: 67, onset: 1, duration: 1 }),
    ];
    const geo3d = map3DGeometry(scoreOf(notes), linesConfig, 800, 800);
    const geo2d = fitGeometryToCanvas(
      mapScoreToGeometry(scoreOf(notes), { ...linesConfig, variation: 'lines' }, 800, 800),
      800,
      800,
    );
    const flat2d = geo2d.voicePaths.flatMap((p) => p.segments);
    expect(geo3d.segments.length).toBe(flat2d.length);
    geo3d.segments.forEach((seg, i) => {
      expect(seg.startX).toBeCloseTo(flat2d[i].start.x);
      expect(seg.startY).toBeCloseTo(flat2d[i].start.y);
      expect(seg.endX).toBeCloseTo(flat2d[i].end.x);
      expect(seg.endY).toBeCloseTo(flat2d[i].end.y);
    });
  });

  it('is deterministic — same input yields identical output', () => {
    const notes = [
      note({ id: 'a', pitch: 60, onset: 0, duration: 1 }),
      note({ id: 'b', pitch: 63, onset: 0.02, duration: 1 }),
      note({ id: 'c', pitch: 67, onset: 1, duration: 0.5 }),
    ];
    const a = map3DGeometry(scoreOf(notes), linesConfig, 800, 800);
    const b = map3DGeometry(scoreOf(notes), linesConfig, 800, 800);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('maps piano-roll notes into deterministic pitch × voice × time boxes', () => {
    const score: Score = {
      title: 'Piano roll', duration: 4, bpm: 120,
      tracks: [
        { name: 'Low', channel: 0, program: 0, instrumentName: 'Piano', isPercussion: false, notes: [note({ id: 'a', pitch: 48, onset: 0, duration: 1 })] },
        { name: 'High', channel: 1, program: 0, instrumentName: 'Piano', isPercussion: false, notes: [note({ id: 'b', pitch: 72, onset: 2, duration: 1 })] },
      ],
    };
    const geometry = map3DGeometry(score, pianoConfig, 800, 600);
    // Piano roll normalizes Z to the padded usable width (targetWidth − 2×pad).
    const expectedZ = effectiveZScale(4, 800 - 56 * 2, pianoConfig);
    expect(geometry.segments).toHaveLength(0);
    expect(geometry.discs).toHaveLength(0);
    expect(geometry.boxes).toHaveLength(2);
    expect(geometry.boxes[1].cx).toBeGreaterThan(geometry.boxes[0].cx);
    expect(geometry.boxes[1].cy).toBeGreaterThan(geometry.boxes[0].cy);
    expect(geometry.boxes[1].cz).toBeGreaterThan(geometry.boxes[0].cz);
    expect(geometry.boxes[0].sz).toBeCloseTo(expectedZ);
    expect(JSON.stringify(map3DGeometry(score, pianoConfig, 800, 600))).toBe(JSON.stringify(geometry));
  });

  describe('3d_polar_fan', () => {
    const polar3dConfig: RuleConfig = { ...DEFAULT_CONFIG, variation: '3d_polar_fan', zScale: 150 };

    it('preserves the 2D polar_fan XY geometry exactly (front view matches fitted 2D polar_fan)', () => {
      const notes = [
        note({ id: 'a', pitch: 60, onset: 0, duration: 1 }),
        note({ id: 'b', pitch: 67, onset: 1, duration: 1 }),
      ];
      const score = scoreOf(notes);
      const geo3d = map3DGeometry(score, polar3dConfig, 800, 800);
      const geo2d = fitGeometryToCanvas(
        mapScoreToGeometry(score, { ...polar3dConfig, variation: 'polar_fan' }, 800, 800),
        800,
        800,
      );

      const flat2d = geo2d.voicePaths.flatMap((p) => p.segments);
      expect(geo3d.segments.length).toBe(flat2d.length);
      geo3d.segments.forEach((seg, i) => {
        expect(seg.startX).toBeCloseTo(flat2d[i].start.x);
        expect(seg.startY).toBeCloseTo(flat2d[i].start.y);
        expect(seg.endX).toBeCloseTo(flat2d[i].end.x);
        expect(seg.endY).toBeCloseTo(flat2d[i].end.y);
      });
    });

    it('maps segment Z to note onset and offset × zScale', () => {
      const score = scoreOf([note({ id: 'a', pitch: 60, onset: 0.5, duration: 2 })]);
      const geo = map3DGeometry(score, polar3dConfig, 800, 800);
      const geo2d = fitGeometryToCanvas(mapScoreToGeometry(score, { ...polar3dConfig, variation: 'polar_fan' }, 800, 800), 800, 800);
      const fittedSpan = computeFittedSpan(geo2d);
      const effZ = effectiveZScale(score.duration, fittedSpan, polar3dConfig);

      expect(geo.zScale).toBeCloseTo(effZ);
      const seg = geo.segments[0];
      expect(seg.startZ).toBeCloseTo(0.5 * effZ);
      expect(seg.endZ).toBeCloseTo(2.5 * effZ);
    });

    it('is completely deterministic', () => {
      const score = scoreOf([
        note({ id: 'a', pitch: 60, onset: 0, duration: 1 }),
        note({ id: 'b', pitch: 64, onset: 0.5, duration: 1.5 }),
      ]);
      const a = map3DGeometry(score, polar3dConfig, 800, 800);
      const b = map3DGeometry(score, polar3dConfig, 800, 800);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
  });

  describe('3d_polar_walk', () => {
    const walk3dConfig: RuleConfig = { ...DEFAULT_CONFIG, variation: '3d_polar_walk', zScale: 150 };

    it('preserves the 2D polar_walk XY geometry exactly (front view matches fitted 2D polar_walk)', () => {
      const notes = [
        note({ id: 'a', pitch: 60, onset: 0, duration: 1 }),
        note({ id: 'b', pitch: 67, onset: 1, duration: 1 }),
      ];
      const score = scoreOf(notes);
      const geo3d = map3DGeometry(score, walk3dConfig, 800, 800);
      const geo2d = fitGeometryToCanvas(
        mapScoreToGeometry(score, { ...walk3dConfig, variation: 'polar_walk' }, 800, 800),
        800,
        800,
      );

      const flat2d = geo2d.voicePaths.flatMap((p) => p.segments);
      expect(geo3d.segments.length).toBe(flat2d.length);
      geo3d.segments.forEach((seg, i) => {
        expect(seg.startX).toBeCloseTo(flat2d[i].start.x);
        expect(seg.startY).toBeCloseTo(flat2d[i].start.y);
        expect(seg.endX).toBeCloseTo(flat2d[i].end.x);
        expect(seg.endY).toBeCloseTo(flat2d[i].end.y);
      });
    });

    it('maps segment Z to note onset and offset × zScale', () => {
      const score = scoreOf([note({ id: 'a', pitch: 60, onset: 0.5, duration: 2 })]);
      const geo = map3DGeometry(score, walk3dConfig, 800, 800);
      const geo2d = fitGeometryToCanvas(mapScoreToGeometry(score, { ...walk3dConfig, variation: 'polar_walk' }, 800, 800), 800, 800);
      const fittedSpan = computeFittedSpan(geo2d);
      const effZ = effectiveZScale(score.duration, fittedSpan, walk3dConfig);

      expect(geo.zScale).toBeCloseTo(effZ);
      const seg = geo.segments[0];
      expect(seg.startZ).toBeCloseTo(0.5 * effZ);
      expect(seg.endZ).toBeCloseTo(2.5 * effZ);
    });

    it('is completely deterministic', () => {
      const score = scoreOf([
        note({ id: 'a', pitch: 60, onset: 0, duration: 1 }),
        note({ id: 'b', pitch: 64, onset: 0.5, duration: 1.5 }),
      ]);
      const a = map3DGeometry(score, walk3dConfig, 800, 800);
      const b = map3DGeometry(score, walk3dConfig, 800, 800);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
  });

  describe('3d_radial_voice_paths', () => {
    const radial3dConfig: RuleConfig = { ...DEFAULT_CONFIG, variation: '3d_radial_voice_paths', zScale: 150 };

    function drumScore(notes: NoteEvent[], duration = 4): Score {
      return {
        title: 'Drums',
        duration,
        bpm: 120,
        tracks: [{ name: 'Drums', channel: 9, program: 0, instrumentName: 'Drum Kit', isPercussion: true, notes }],
      };
    }

    it('tags geometry as 3d and preserves the requested variation in config', () => {
      const geo = map3DGeometry(scoreOf([note({ id: 'a', pitch: 60, onset: 0, duration: 1 })]), radial3dConfig, 800, 800);
      expect(geo.kind).toBe('3d');
      expect(geo.config.variation).toBe('3d_radial_voice_paths');
    });

    it('preserves the 2D radial_voice_paths XY geometry exactly (front view matches fitted 2D)', () => {
      const score: Score = {
        title: 'Two voices', duration: 4, bpm: 120,
        tracks: [
          { name: 'Bass', channel: 0, program: 32, instrumentName: 'Bass', isPercussion: false, notes: [note({ id: 'a', pitch: 40, onset: 0, duration: 1 })] },
          { name: 'Violin', channel: 1, program: 40, instrumentName: 'Violin', isPercussion: false, notes: [note({ id: 'b', pitch: 84, onset: 1, duration: 1 })] },
        ],
      };
      const geo3d = map3DGeometry(score, radial3dConfig, 800, 800);
      const geo2d = fitGeometryToCanvas(
        mapScoreToGeometry(score, { ...radial3dConfig, variation: 'radial_voice_paths' }, 800, 800),
        800,
        800,
      );

      const flat2d = geo2d.voicePaths.flatMap((p) => p.segments);
      expect(geo3d.segments.length).toBe(flat2d.length);
      geo3d.segments.forEach((seg, i) => {
        expect(seg.startX).toBeCloseTo(flat2d[i].start.x);
        expect(seg.startY).toBeCloseTo(flat2d[i].start.y);
        expect(seg.endX).toBeCloseTo(flat2d[i].end.x);
        expect(seg.endY).toBeCloseTo(flat2d[i].end.y);
      });
    });

    it('maps segment Z to note onset and offset × zScale', () => {
      const score = scoreOf([note({ id: 'a', pitch: 60, onset: 0.5, duration: 2 })]);
      const geo = map3DGeometry(score, radial3dConfig, 800, 800);
      const geo2d = fitGeometryToCanvas(mapScoreToGeometry(score, { ...radial3dConfig, variation: 'radial_voice_paths' }, 800, 800), 800, 800);
      const fittedSpan = computeFittedSpan(geo2d);
      const effZ = effectiveZScale(score.duration, fittedSpan, radial3dConfig);

      expect(geo.zScale).toBeCloseTo(effZ);
      const seg = geo.segments[0];
      expect(seg.startZ).toBeCloseTo(0.5 * effZ);
      expect(seg.endZ).toBeCloseTo(2.5 * effZ);
    });

    it('lifts percussion rings to discs at onset depth instead of dropping them', () => {
      const score = drumScore([
        note({ id: 'k1', pitch: 36, onset: 1, duration: 0.5 }),
        note({ id: 'k2', pitch: 36, onset: 2, duration: 0.5 }),
      ]);
      const geo = map3DGeometry(score, radial3dConfig, 800, 800);
      const geo2d = fitGeometryToCanvas(mapScoreToGeometry(score, { ...radial3dConfig, variation: 'radial_voice_paths' }, 800, 800), 800, 800);
      const effZ = effectiveZScale(score.duration, computeFittedSpan(geo2d), radial3dConfig);

      expect(geo.segments).toHaveLength(0);
      expect(geo.discs).toHaveLength(2);
      expect(geo.discs[0].cz).toBeCloseTo(1 * effZ);
      expect(geo.discs[1].cz).toBeCloseTo(2 * effZ);
      expect(geo.discs[0].czExtent).toBeCloseTo(0.5 * effZ / 2);
      // Radii carry the fitted 2D ring radii across unchanged.
      const rings2d = geo2d.voicePaths.flatMap((p) => p.circles);
      expect(geo.discs[0].radius).toBeCloseTo(rings2d[0].radius);
      expect(geo.discs[1].radius).toBeCloseTo(rings2d[1].radius);
    });

    it('colors percussion discs from the ring stroke (family) color, not the transparent fill', () => {
      const score = drumScore([note({ id: 'k', pitch: 36, onset: 1, duration: 0.5 })]);
      const geo = map3DGeometry(score, radial3dConfig, 800, 800);
      const ring = fitGeometryToCanvas(mapScoreToGeometry(score, { ...radial3dConfig, variation: 'radial_voice_paths' }, 800, 800), 800, 800)
        .voicePaths.flatMap((p) => p.circles)[0];
      expect(ring.fillColor).toBe('none');
      expect(geo.discs[0].fillColor).toBe(ring.strokeColor);
    });

    it('produces segments and discs together for a mixed pitched + percussion score', () => {
      const score: Score = {
        title: 'Mixed', duration: 4, bpm: 120,
        tracks: [
          { name: 'Lead', channel: 0, program: 0, instrumentName: 'Piano', isPercussion: false, notes: [note({ id: 'a', pitch: 60, onset: 0, duration: 1 })] },
          { name: 'Drums', channel: 9, program: 0, instrumentName: 'Drum Kit', isPercussion: true, notes: [note({ id: 'k', pitch: 36, onset: 1, duration: 0.5 })] },
        ],
      };
      const geo = map3DGeometry(score, radial3dConfig, 800, 800);
      expect(geo.segments.length).toBe(1);
      expect(geo.discs.length).toBe(1);
    });

    it('is completely deterministic', () => {
      const score: Score = {
        title: 'Mixed', duration: 4, bpm: 120,
        tracks: [
          { name: 'Bass', channel: 0, program: 32, instrumentName: 'Bass', isPercussion: false, notes: [note({ id: 'a', pitch: 40, onset: 0, duration: 1 }), note({ id: 'b', pitch: 43, onset: 1.5, duration: 0.5 })] },
          { name: 'Drums', channel: 9, program: 0, instrumentName: 'Drum Kit', isPercussion: true, notes: [note({ id: 'k', pitch: 36, onset: 1, duration: 0.1 }), note({ id: 'h', pitch: 42, onset: 2, duration: 0.1 })] },
        ],
      };
      const a = map3DGeometry(score, radial3dConfig, 800, 800);
      const b = map3DGeometry(score, radial3dConfig, 800, 800);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
  });
});

describe('liftGeometryTo3D', () => {
  it('carries color, width, and opacity through unchanged', () => {
    const config: RuleConfig = { ...DEFAULT_CONFIG, variation: 'lines', zScale: 50 };
    const geo2d = mapScoreToGeometry(
      scoreOf([note({ id: 'a', pitch: 72, onset: 0, duration: 1, velocity: 120 })]),
      config,
      800,
      800,
    );
    const seg2d = geo2d.voicePaths[0].segments[0];
    const lifted = liftGeometryTo3D(geo2d, 200, config);
    expect(lifted.segments[0].color).toBe(seg2d.color);
    expect(lifted.segments[0].width).toBe(seg2d.width);
    expect(lifted.segments[0].opacity).toBe(seg2d.opacity);
  });
});
