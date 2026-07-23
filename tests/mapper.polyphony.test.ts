import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../src/core/mapper/scoreMapper.js';
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
