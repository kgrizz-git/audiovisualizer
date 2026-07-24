import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../src/core/mapper/scoreMapper.js';
import { map3DGeometry, liftGeometryTo3D, base2DVariation, effectiveZScale } from '../src/core/mapper/map3d.js';
import { mapScoreToGeometry } from '../src/core/mapper/scoreMapper.js';
import { fitGeometryToCanvas } from '../src/core/layout/fitGeometry.js';
import { DEFAULT_VIEWPORT_3D, NoteEvent, RuleConfig, Score } from '../src/core/types.js';

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
    tracks: [{ name: 'Lead', channel: 0, program: 0, instrumentName: 'Piano', notes }],
  };
}

const linesConfig: RuleConfig = { ...DEFAULT_CONFIG, variation: '3d_lines', zScale: 100 };
const halosConfig: RuleConfig = { ...DEFAULT_CONFIG, variation: '3d_note_halos', zScale: 100 };
const pianoConfig: RuleConfig = { ...DEFAULT_CONFIG, variation: '3d_piano_roll', zScale: 100 };

describe('base2DVariation', () => {
  it('maps 3d_lines to lines and 3d_note_halos to circles', () => {
    expect(base2DVariation('3d_lines')).toBe('lines');
    expect(base2DVariation('3d_note_halos')).toBe('circles');
  });
});

describe('3D viewport defaults', () => {
  it('uses the existing now-plane cue unless reveal is explicitly selected', () => {
    expect(DEFAULT_VIEWPORT_3D.playbackCue).toBe('now_plane');
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
    const effZ = effectiveZScale(score.duration, 800, linesConfig); // 800 × 1 / 4 = 200
    expect(geo.zScale).toBeCloseTo(effZ);
    const seg = geo.segments[0];
    expect(seg.startZ).toBeCloseTo(0.5 * effZ);
    expect(seg.endZ).toBeCloseTo(2.5 * effZ);
  });

  it('normalizes total depth to ~canvas width × zScale/100, independent of duration', () => {
    const short = map3DGeometry(scoreOf([note({ id: 'a', pitch: 60, onset: 0, duration: 4 })], 4), linesConfig, 800, 800);
    const long = map3DGeometry(scoreOf([note({ id: 'a', pitch: 60, onset: 0, duration: 40 })], 40), linesConfig, 800, 800);
    // Both target 800 × 100/100 = 800 units of depth regardless of length.
    expect(short.depth).toBeCloseTo(800);
    expect(long.depth).toBeCloseTo(800);
  });

  it('produces discs (not segments) for 3d_note_halos with Z at onset', () => {
    const score = scoreOf([note({ id: 'a', pitch: 60, onset: 1, duration: 1 })]);
    const geo = map3DGeometry(score, halosConfig, 800, 800);
    const effZ = effectiveZScale(score.duration, 800, halosConfig);
    expect(geo.discs.length).toBe(1);
    expect(geo.segments.length).toBe(0);
    expect(geo.discs[0].cz).toBeCloseTo(1 * effZ);
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
        { name: 'Low', channel: 0, program: 0, instrumentName: 'Piano', notes: [note({ id: 'a', pitch: 48, onset: 0, duration: 1 })] },
        { name: 'High', channel: 1, program: 0, instrumentName: 'Piano', notes: [note({ id: 'b', pitch: 72, onset: 2, duration: 1 })] },
      ],
    };
    const geometry = map3DGeometry(score, pianoConfig, 800, 600);
    expect(geometry.segments).toHaveLength(0);
    expect(geometry.discs).toHaveLength(0);
    expect(geometry.boxes).toHaveLength(2);
    expect(geometry.boxes[1].cx).toBeGreaterThan(geometry.boxes[0].cx);
    expect(geometry.boxes[1].cy).toBeGreaterThan(geometry.boxes[0].cy);
    expect(geometry.boxes[1].cz).toBeGreaterThan(geometry.boxes[0].cz);
    expect(geometry.boxes[0].sz).toBeCloseTo(effectiveZScale(4, 800, pianoConfig));
    expect(JSON.stringify(map3DGeometry(score, pianoConfig, 800, 600))).toBe(JSON.stringify(geometry));
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
