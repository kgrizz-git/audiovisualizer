import { describe, it, expect } from 'vitest';
import { generateDemoScore } from '../src/core/midi/parser.js';
import { getAverageScoreBackground, mapScoreToGeometry, DEFAULT_CONFIG, getNoteColor } from '../src/core/mapper/scoreMapper.js';
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
        { name: 'Lead', channel: 0, program: 0, instrumentName: 'Piano', notes: [
          { id: 'a', pitch: 60, onset: 0.02, duration: 0.2, velocity: 100, voice: 0, pitchClass: 0 },
          { id: 'b', pitch: 64, onset: 0.63, duration: 0.2, velocity: 100, voice: 0, pitchClass: 4 },
        ] },
        { name: 'Bass', channel: 1, program: 32, instrumentName: 'Bass', notes: [{ id: 'c', pitch: 36, onset: 0, duration: 1, velocity: 100, voice: 1, pitchClass: 0 }] },
      ],
    };
    const geometry = mapScoreToGeometry(score, { ...DEFAULT_CONFIG, quantizeOnset: true, gapPolicy: 'ghost', voiceFilter: [0] });
    expect(geometry.voicePaths).toHaveLength(1);
    expect(geometry.voicePaths[0].segments.filter((segment) => segment.role === 'gap')).toHaveLength(1);
    expect(geometry.voicePaths[0].segments.find((segment) => segment.note.id === 'b')?.note.onset).toBe(0.625);
  });

  it('can disable interval turns for a straight line mapping', () => {
    const score = generateDemoScore();
    const geometry = mapScoreToGeometry(score, { ...DEFAULT_CONFIG, intervalAngleEnabled: false });
    const [first, second] = geometry.voicePaths[0].segments;
    expect(first.end.y).toBeCloseTo(first.start.y);
    expect(second.end.y).toBeCloseTo(second.start.y);
  });

  it('maps ascending and descending intervals to opposite heading turns by default', () => {
    const score = {
      title: 'Interval fixture', duration: 3, bpm: 120,
      tracks: [{ name: 'Lead', channel: 0, program: 0, instrumentName: 'Piano', notes: [
        { id: 'n1', pitch: 60, onset: 0, duration: 0.5, velocity: 100, voice: 0, pitchClass: 0 },
        { id: 'n2', pitch: 64, onset: 0.5, duration: 0.5, velocity: 100, voice: 0, pitchClass: 4 },
        { id: 'n3', pitch: 60, onset: 1, duration: 0.5, velocity: 100, voice: 0, pitchClass: 0 },
      ] }],
    };
    expect(DEFAULT_CONFIG.spiralBias).toBe(0);
    const geometry = mapScoreToGeometry(score, DEFAULT_CONFIG, 800, 800);
    const [first, second, third] = geometry.voicePaths[0].segments;
    // Left-to-right starts heading 0° (right). +4 semitones → +60°; −4 → −60° from that heading.
    expect(first.end.y).toBeCloseTo(first.start.y);
    expect(second.end.y).toBeGreaterThan(second.start.y);
    expect(third.end.y).toBeCloseTo(third.start.y);
  });

  it('derives a stable, dark average background from mapped pitch hues', () => {
    const background = getAverageScoreBackground(generateDemoScore(), DEFAULT_CONFIG);
    expect(background).toMatch(/^hsl\(\d+, 32%, 9%\)$/);
  });

  it('maps top-to-bottom tonal bands with circular active-note hue averaging and silence', () => {
    const score = {
      title: 'Tonal fixture', duration: 4, bpm: 120, tracks: [{ name: 'Voice', channel: 0, program: 0, instrumentName: 'Piano', notes: [
        { id: 'c', pitch: 60, onset: 0, duration: 2, velocity: 100, voice: 0, pitchClass: 0 },
        { id: 'b', pitch: 71, onset: 0, duration: 2, velocity: 100, voice: 0, pitchClass: 11 },
        { id: 'c-octave', pitch: 72, onset: 2, duration: 1, velocity: 100, voice: 0, pitchClass: 0 },
      ] }],
    };
    const geometry = mapScoreToGeometry(score, { ...DEFAULT_CONFIG, variation: 'tonal_time_lines' }, 300, 4);
    expect(geometry.voicePaths).toEqual([]);
    expect(geometry.bands).toHaveLength(4);
    expect(geometry.bands[0]).toMatchObject({ y: 0, height: 1, color: 'hsl(345, 85%, 60%)', silent: false });
    expect(geometry.bands[2]).toMatchObject({ color: 'hsl(0, 85%, 60%)', silent: false });
    expect(geometry.bands[3]).toMatchObject({ color: 'rgb(226, 232, 240)', silent: true });
  });
});
