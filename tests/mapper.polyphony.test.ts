import { describe, it, expect } from 'vitest';
import { mapScoreToGeometry, DEFAULT_CONFIG } from '../src/core/mapper/scoreMapper.js';
import {
  CHORD_ONSET_WINDOW_SECONDS,
  clusterNotesByOnset,
  medianPitch,
  tipPointAt,
  centroid,
} from '../src/core/mapper/polyphonicLines.js';
import { NoteEvent } from '../src/core/types.js';

function note(partial: Partial<NoteEvent> & Pick<NoteEvent, 'id' | 'pitch' | 'onset' | 'duration'>): NoteEvent {
  return {
    velocity: 100,
    voice: 0,
    pitchClass: partial.pitch % 12,
    ...partial,
  };
}

describe('polyphonic line paths', () => {
  it('defaults chordLayout to polyphony', () => {
    expect(DEFAULT_CONFIG.chordLayout).toBe('polyphony');
  });
});

describe('polyphonic helpers', () => {
  it('clusters notes within the 40ms onset window', () => {
    expect(CHORD_ONSET_WINDOW_SECONDS).toBe(0.04);
    const clusters = clusterNotesByOnset([
      note({ id: 'a', pitch: 60, onset: 0, duration: 1 }),
      note({ id: 'b', pitch: 64, onset: 0.03, duration: 1 }),
      note({ id: 'c', pitch: 67, onset: 0.1, duration: 1 }),
    ]);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].map((n) => n.id)).toEqual(['a', 'b']);
    expect(clusters[1].map((n) => n.id)).toEqual(['c']);
  });

  it('sorts each cluster by pitch ascending', () => {
    const [cluster] = clusterNotesByOnset([
      note({ id: 'hi', pitch: 67, onset: 0, duration: 1 }),
      note({ id: 'lo', pitch: 60, onset: 0.01, duration: 1 }),
    ]);
    expect(cluster.map((n) => n.id)).toEqual(['lo', 'hi']);
  });

  it('computes median pitch for odd and even counts', () => {
    expect(medianPitch([60, 64, 67])).toBe(64);
    expect(medianPitch([60, 64])).toBe(62);
  });

  it('lerps tip position by musical time along the segment', () => {
    const point = tipPointAt({ x: 0, y: 0 }, { x: 100, y: 0 }, 0, 1, 0.25);
    expect(point.x).toBeCloseTo(25);
    expect(point.y).toBeCloseTo(0);
  });

  it('averages tip positions for centroid joins', () => {
    expect(centroid([{ x: 0, y: 0 }, { x: 10, y: 20 }])).toEqual({ x: 5, y: 10 });
  });
});

describe('mapScoreToGeometry polyphony', () => {
  it('starts a staggered overlapping note at the time-true point on the previous segment', () => {
    const score = {
      title: 'Overlap', duration: 2, bpm: 120,
      tracks: [{ name: 'Lead', channel: 0, program: 0, instrumentName: 'Piano', notes: [
        note({ id: 'a', pitch: 60, onset: 0, duration: 1, pitchClass: 0 }),
        note({ id: 'b', pitch: 64, onset: 0.5, duration: 0.5, pitchClass: 4 }),
      ] }],
    };
    const geometry = mapScoreToGeometry(score, { ...DEFAULT_CONFIG, variation: 'lines', chordLayout: 'polyphony', intervalAngleEnabled: false }, 800, 800);
    const [first, second] = geometry.voicePaths[0].segments.filter((s) => s.role !== 'gap');
    expect(second.start.x).toBeCloseTo(first.start.x + (first.end.x - first.start.x) * 0.5);
    expect(second.start.y).toBeCloseTo(first.start.y + (first.end.y - first.start.y) * 0.5);
    expect(second.start.x).not.toBeCloseTo(first.end.x);
  });

  it('fans same-onset chord tones from one join using interval angle offsets', () => {
    const score = {
      title: 'Chord', duration: 2, bpm: 120,
      tracks: [{ name: 'Lead', channel: 0, program: 0, instrumentName: 'Piano', notes: [
        note({ id: 'c', pitch: 60, onset: 0, duration: 1, pitchClass: 0 }),
        note({ id: 'e', pitch: 64, onset: 0, duration: 1, pitchClass: 4 }),
        note({ id: 'g', pitch: 67, onset: 0, duration: 1, pitchClass: 7 }),
      ] }],
    };
    const geometry = mapScoreToGeometry(score, { ...DEFAULT_CONFIG, variation: 'lines', chordLayout: 'polyphony', angleScale: 180 }, 800, 800);
    const segs = geometry.voicePaths[0].segments.filter((s) => s.role !== 'gap');
    expect(segs).toHaveLength(3);
    expect(segs[0].start).toEqual(segs[1].start);
    expect(segs[1].start).toEqual(segs[2].start);
    expect(segs[1].end.y).toBeCloseTo(segs[1].start.y);
    expect(segs[0].end.y).toBeLessThan(segs[0].start.y);
    expect(segs[2].end.y).toBeGreaterThan(segs[2].start.y);
  });

  it('joins the next note at the centroid of still-active tips after one chord tone ends', () => {
    const score = {
      title: 'Centroid', duration: 3, bpm: 120,
      tracks: [{ name: 'Lead', channel: 0, program: 0, instrumentName: 'Piano', notes: [
        note({ id: 'lo', pitch: 60, onset: 0, duration: 1.0, pitchClass: 0 }),
        note({ id: 'hi', pitch: 72, onset: 0, duration: 1.0, pitchClass: 0 }),
        note({ id: 'mid', pitch: 66, onset: 0, duration: 0.4, pitchClass: 6 }),
        note({ id: 'next', pitch: 64, onset: 0.5, duration: 0.5, pitchClass: 4 }),
      ] }],
    };
    const geometry = mapScoreToGeometry(score, { ...DEFAULT_CONFIG, variation: 'lines', chordLayout: 'polyphony', intervalAngleEnabled: false }, 800, 800);
    const segs = geometry.voicePaths[0].segments.filter((s) => s.role !== 'gap');
    const lo = segs.find((s) => s.note.id === 'lo')!;
    const hi = segs.find((s) => s.note.id === 'hi')!;
    const next = segs.find((s) => s.note.id === 'next')!;
    const loMid = {
      x: lo.start.x + (lo.end.x - lo.start.x) * 0.5,
      y: lo.start.y + (lo.end.y - lo.start.y) * 0.5,
    };
    const hiMid = {
      x: hi.start.x + (hi.end.x - hi.start.x) * 0.5,
      y: hi.start.y + (hi.end.y - hi.start.y) * 0.5,
    };
    expect(next.start.x).toBeCloseTo((loMid.x + hiMid.x) / 2);
    expect(next.start.y).toBeCloseTo((loMid.y + hiMid.y) / 2);
  });

  it('uses parallel headings within a cluster when interval turns are off', () => {
    const score = {
      title: 'Parallel', duration: 1, bpm: 120,
      tracks: [{ name: 'Lead', channel: 0, program: 0, instrumentName: 'Piano', notes: [
        note({ id: 'a', pitch: 60, onset: 0, duration: 1, pitchClass: 0 }),
        note({ id: 'b', pitch: 67, onset: 0, duration: 1, pitchClass: 7 }),
      ] }],
    };
    const geometry = mapScoreToGeometry(score, { ...DEFAULT_CONFIG, variation: 'lines', chordLayout: 'polyphony', intervalAngleEnabled: false }, 800, 800);
    const [a, b] = geometry.voicePaths[0].segments.filter((s) => s.role !== 'gap');
    expect(a.end.y - a.start.y).toBeCloseTo(b.end.y - b.start.y);
    expect(a.end.x - a.start.x).toBeCloseTo(b.end.x - b.start.x);
  });

  it('advances the pen across rests with lift_pen without drawing a gap segment', () => {
    const score = {
      title: 'Rest', duration: 2, bpm: 120,
      tracks: [{ name: 'Lead', channel: 0, program: 0, instrumentName: 'Piano', notes: [
        note({ id: 'a', pitch: 60, onset: 0, duration: 0.5, pitchClass: 0 }),
        note({ id: 'b', pitch: 64, onset: 1, duration: 0.5, pitchClass: 4 }),
      ] }],
    };
    const config = {
      ...DEFAULT_CONFIG,
      variation: 'lines' as const,
      chordLayout: 'polyphony' as const,
      gapPolicy: 'lift_pen' as const,
      intervalAngleEnabled: false,
    };
    const polyphony = mapScoreToGeometry(score, config, 800, 800);
    const chain = mapScoreToGeometry(score, { ...config, chordLayout: 'chain' }, 800, 800);
    const polySegs = polyphony.voicePaths[0].segments.filter((s) => s.role !== 'gap');
    const chainSegs = chain.voicePaths[0].segments.filter((s) => s.role !== 'gap');
    expect(polyphony.voicePaths[0].segments.some((s) => s.role === 'gap')).toBe(false);
    expect(polySegs[1].start.x).toBeCloseTo(chainSegs[1].start.x);
    expect(polySegs[1].start.y).toBeCloseTo(chainSegs[1].start.y);
  });

  it('preserves sequential chain geometry when chordLayout is chain', () => {
    const score = {
      title: 'Chain', duration: 2, bpm: 120,
      tracks: [{ name: 'Lead', channel: 0, program: 0, instrumentName: 'Piano', notes: [
        note({ id: 'a', pitch: 60, onset: 0, duration: 1, pitchClass: 0 }),
        note({ id: 'b', pitch: 64, onset: 0.5, duration: 0.5, pitchClass: 4 }),
      ] }],
    };
    const chain = mapScoreToGeometry(score, { ...DEFAULT_CONFIG, variation: 'lines', chordLayout: 'chain', intervalAngleEnabled: false }, 800, 800);
    const [first, second] = chain.voicePaths[0].segments.filter((s) => s.role !== 'gap');
    expect(second.start.x).toBeCloseTo(first.end.x);
    expect(second.start.y).toBeCloseTo(first.end.y);
  });
});
