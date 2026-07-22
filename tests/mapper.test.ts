import { describe, it, expect } from 'vitest';
import { generateDemoScore } from '../src/core/midi/parser.js';
import { mapScoreToGeometry, DEFAULT_CONFIG, getNoteColor } from '../src/core/mapper/scoreMapper.js';
import { NoteEvent } from '../src/core/types.js';

describe('Score Mapper Unit Tests', () => {
  it('calculates deterministic pitch class HSL colors', () => {
    const noteC: NoteEvent = {
      id: '1', pitch: 60, onset: 0, duration: 1, velocity: 100, voice: 0, pitchClass: 0
    };
    const noteFs: NoteEvent = {
      id: '2', pitch: 66, onset: 0, duration: 1, velocity: 100, voice: 0, pitchClass: 6
    };

    expect(getNoteColor(noteC, DEFAULT_CONFIG)).toBe('hsl(0, 85%, 60%)');
    expect(getNoteColor(noteFs, DEFAULT_CONFIG)).toBe('hsl(180, 85%, 60%)');
  });

  it('generates expected geometry segments for demo score in Left-to-Right mode', () => {
    const score = generateDemoScore();
    const geometry = mapScoreToGeometry(score, DEFAULT_CONFIG, 800, 800);

    expect(geometry.width).toBe(800);
    expect(geometry.height).toBe(800);
    expect(geometry.voicePaths.length).toBe(score.tracks.length);
    expect(geometry.voicePaths[0].segments.length).toBeGreaterThan(0);
  });

  it('generates circle geometry when variation B is selected', () => {
    const score = generateDemoScore();
    const config = { ...DEFAULT_CONFIG, variation: 'circles' as const };
    const geometry = mapScoreToGeometry(score, config, 800, 800);

    expect(geometry.voicePaths[0].circles.length).toBeGreaterThan(0);
  });

  it('quantizes event onsets, applies gap policies, and filters voices deterministically', () => {
    const score = {
      title: 'Fixture', duration: 2, bpm: 120,
      tracks: [
        { name: 'Lead', channel: 0, notes: [
          { id: 'a', pitch: 60, onset: 0.02, duration: 0.2, velocity: 100, voice: 0, pitchClass: 0 },
          { id: 'b', pitch: 64, onset: 0.63, duration: 0.2, velocity: 100, voice: 0, pitchClass: 4 },
        ] },
        { name: 'Bass', channel: 1, notes: [{ id: 'c', pitch: 36, onset: 0, duration: 1, velocity: 100, voice: 1, pitchClass: 0 }] },
      ],
    };
    const geometry = mapScoreToGeometry(score, { ...DEFAULT_CONFIG, quantizeOnset: true, gapPolicy: 'ghost', voiceFilter: [0] });
    expect(geometry.voicePaths).toHaveLength(1);
    expect(geometry.voicePaths[0].segments.filter((segment) => segment.role === 'gap')).toHaveLength(1);
    expect(geometry.voicePaths[0].segments.find((segment) => segment.note.id === 'b')?.note.onset).toBe(0.625);
  });

  it('can disable interval turns for a straight line mapping', () => {
    const score = generateDemoScore();
    const geometry = mapScoreToGeometry(score, { ...DEFAULT_CONFIG, intervalAngleEnabled: false, spiralBias: 0 });
    const [first, second] = geometry.voicePaths[0].segments;
    expect(first.end.y).toBeCloseTo(first.start.y);
    expect(second.end.y).toBeCloseTo(second.start.y);
  });
});
