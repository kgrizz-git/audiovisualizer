import { describe, it, expect } from 'vitest';
import { generateDemoScore } from '../src/core/midi/parser.js';
import { getAverageScoreBackground, getDominantScoreAccent, getTrackAverageAccents, getVisualPitch, mapScoreToGeometry, DEFAULT_CONFIG, getNoteColor } from '../src/core/mapper/scoreMapper.js';
import { fitGeometryToCanvas } from '../src/core/layout/fitGeometry.js';
import { NoteEvent, Score } from '../src/core/types.js';

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

  it('supports visual transposition and a stable voice palette without mutating source notes', () => {
    const note: NoteEvent = { id: 'transpose', pitch: 60, onset: 0, duration: 1, velocity: 100, voice: 1, pitchClass: 0 };
    expect(getVisualPitch(note, { ...DEFAULT_CONFIG, transposeSemitones: 2 })).toBe(62);
    expect(getNoteColor(note, { ...DEFAULT_CONFIG, transposeSemitones: 1 })).toBe('hsl(55, 85%, 60%)');
    expect(getNoteColor(note, { ...DEFAULT_CONFIG, pitchHueMode: 'voice_palette', transposeSemitones: 12 })).toBe('hsl(196, 85%, 60%)');
    expect(note.pitch).toBe(60);
  });

  it('derives one deterministic mapped accent per visible track', () => {
    const score = generateDemoScore();
    const accents = getTrackAverageAccents(score, { ...DEFAULT_CONFIG, pitchHueMode: 'voice_palette' });
    expect(accents).toHaveLength(score.tracks.length);
    expect(accents[0]).toBe('hsl(12, 85%, 60%)');
  });

  it('produces a single weighted average accent dominated by long, loud notes', () => {
    const score = {
      title: 'Weighted fixture', duration: 2, bpm: 120,
      tracks: [
        { name: 'Lead', channel: 0, program: 0, instrumentName: 'Piano', notes: [
          // pitch-class 0 => hue 0, but quiet and short.
          { id: 'a', pitch: 60, onset: 0, duration: 0.1, velocity: 10, voice: 0, pitchClass: 0 },
        ] },
        { name: 'Bass', channel: 1, program: 32, instrumentName: 'Bass', notes: [
          // pitch-class 7 => hue 210, loud and long: weight = 2 × 127 = 254 vs 0.1 × 10 = 1.
          { id: 'b', pitch: 67, onset: 0, duration: 2, velocity: 127, voice: 1, pitchClass: 7 },
        ] },
      ],
    };
    const accent = getDominantScoreAccent(score as any, DEFAULT_CONFIG);
    expect(accent).not.toBeNull();
    // The long loud bass note dominates; accent hue sits near 210 rather than 0.
    const match = accent!.match(/hsl\((\d+),/);
    expect(match).not.toBeNull();
    expect(parseInt(match![1], 10)).toBeGreaterThan(180);
    expect(parseInt(match![1], 10)).toBeLessThan(240);
  });

  it('returns null when no tracks are visible under the voice filter', () => {
    const score = {
      title: 'Filtered', duration: 1, bpm: 120,
      tracks: [{ name: 'Lead', channel: 0, program: 0, instrumentName: 'Piano', notes: [
        { id: 'a', pitch: 60, onset: 0, duration: 1, velocity: 100, voice: 0, pitchClass: 0 },
      ] }],
    };
    const accent = getDominantScoreAccent(score as any, { ...DEFAULT_CONFIG, voiceFilter: [1] });
    expect(accent).toBeNull();
  });

  it('weights getAverageScoreBackground by duration × velocity for consistency with the accent', () => {
    const score = {
      title: 'Weighted bg', duration: 2, bpm: 120,
      tracks: [
        { name: 'Lead', channel: 0, program: 0, instrumentName: 'Piano', notes: [
          // Quiet, short note at hue 0 — should barely perturb the average.
          { id: 'a', pitch: 60, onset: 0, duration: 0.1, velocity: 10, voice: 0, pitchClass: 0 },
        ] },
        { name: 'Bass', channel: 1, program: 32, instrumentName: 'Bass', notes: [
          // Loud, long note at hue 210 — should dominate.
          { id: 'b', pitch: 67, onset: 0, duration: 2, velocity: 127, voice: 1, pitchClass: 7 },
        ] },
      ],
    };
    const background = getAverageScoreBackground(score as any, DEFAULT_CONFIG);
    expect(background).toMatch(/^hsl\(\d+, 32%, 9%\)$/);
    const match = background.match(/hsl\((\d+),/)!;
    const hue = parseInt(match[1], 10);
    expect(hue).toBeGreaterThan(180);
    expect(hue).toBeLessThan(240);
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
    // Left-to-right starts heading 0° (right). Default 180°/oct → +4 semitones = +60°.
    expect(first.end.y).toBeCloseTo(first.start.y);
    expect(second.end.y).toBeGreaterThan(second.start.y);
    expect(third.end.y).toBeCloseTo(third.start.y);
  });

  it('places circle centers with interval turns or straight along the origin heading', () => {
    const score = {
      title: 'Circle interval fixture', duration: 3, bpm: 120,
      tracks: [{ name: 'Lead', channel: 0, program: 0, instrumentName: 'Piano', notes: [
        { id: 'n1', pitch: 60, onset: 0, duration: 0.5, velocity: 100, voice: 0, pitchClass: 0 },
        { id: 'n2', pitch: 64, onset: 0.5, duration: 0.5, velocity: 100, voice: 0, pitchClass: 4 },
        { id: 'n3', pitch: 60, onset: 1, duration: 0.5, velocity: 100, voice: 0, pitchClass: 0 },
      ] }],
    };
    const turning = mapScoreToGeometry(score, { ...DEFAULT_CONFIG, variation: 'circles' }, 800, 800);
    const [c1, c2, c3] = turning.voicePaths[0].circles;
    expect(c2.center.y).toBeGreaterThan(c1.center.y);
    expect(c3.center.y).toBeCloseTo(c2.center.y);

    const straight = mapScoreToGeometry(score, { ...DEFAULT_CONFIG, variation: 'circles', intervalAngleEnabled: false }, 800, 800);
    const [s1, s2, s3] = straight.voicePaths[0].circles;
    expect(s2.center.y).toBeCloseTo(s1.center.y);
    expect(s3.center.y).toBeCloseTo(s1.center.y);
    expect(s2.center.x).toBeGreaterThan(s1.center.x);
    expect(s3.center.x).toBeGreaterThan(s2.center.x);
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

  describe('Polar Fan Mapping', () => {
    const makeScore = (notes: NoteEvent[]): Score => ({
      title: 'Test Score',
      duration: Math.max(...notes.map((n) => n.onset + n.duration)),
      bpm: 120,
      tracks: [{ name: 'Track 1', channel: 0, program: 0, instrumentName: 'Piano', notes }],
    });

    it('generates segments from the center origin at correct spoke angles and lengths', () => {
      const score = makeScore([
        { id: 'c4', pitch: 60, onset: 0, duration: 2, velocity: 100, voice: 0, pitchClass: 0 },
      ]);
      const config = { ...DEFAULT_CONFIG, variation: 'polar_fan' as const, lengthScale: 10 };
      const geometry = mapScoreToGeometry(score, config, 800, 800);

      expect(geometry.voicePaths[0].segments).toHaveLength(1);
      expect(geometry.voicePaths[0].circles).toHaveLength(0);
      expect(geometry.bands).toHaveLength(0);

      const segment = geometry.voicePaths[0].segments[0];
      // Origin is targetWidth/2, targetHeight/2 (400, 400)
      expect(segment.start.x).toBeCloseTo(400);
      expect(segment.start.y).toBeCloseTo(400);

      // C4 is pitchClass 0 -> angle = 0 -> end point should be (400 + duration * lengthScale, 400)
      const expectedLen = 2 * 10;
      expect(segment.end.x).toBeCloseTo(400 + expectedLen);
      expect(segment.end.y).toBeCloseTo(400);
    });

    it('maps a C-major triad to spokes at 0, 120, and 210 degrees', () => {
      const score = makeScore([
        { id: 'c4', pitch: 60, onset: 0, duration: 1, velocity: 100, voice: 0, pitchClass: 0 },
        { id: 'e4', pitch: 64, onset: 0, duration: 1, velocity: 100, voice: 0, pitchClass: 4 },
        { id: 'g4', pitch: 67, onset: 0, duration: 1, velocity: 100, voice: 0, pitchClass: 7 },
      ]);
      const config = { ...DEFAULT_CONFIG, variation: 'polar_fan' as const, lengthScale: 10 };
      const geometry = mapScoreToGeometry(score, config, 800, 800);

      const segments = geometry.voicePaths[0].segments;
      expect(segments).toHaveLength(3);

      segments.forEach((seg) => {
        expect(seg.start.x).toBe(400);
        expect(seg.start.y).toBe(400);
      });

      // Assert endpoint angles:
      // seg C: angle 0 -> endX = 400 + 10, endY = 400
      const segC = segments.find(s => s.note.id === 'c4')!;
      expect(segC.end.x).toBeCloseTo(410);
      expect(segC.end.y).toBeCloseTo(400);

      // seg E: angle 120 deg -> endX = 400 + 10 * cos(120), endY = 400 + 10 * sin(120)
      const segE = segments.find(s => s.note.id === 'e4')!;
      const radE = (120 * Math.PI) / 180;
      expect(segE.end.x).toBeCloseTo(400 + 10 * Math.cos(radE));
      expect(segE.end.y).toBeCloseTo(400 + 10 * Math.sin(radE));

      // seg G: angle 210 deg -> endX = 400 + 10 * cos(210), endY = 400 + 10 * sin(210)
      const segG = segments.find(s => s.note.id === 'g4')!;
      const radG = (210 * Math.PI) / 180;
      expect(segG.end.x).toBeCloseTo(400 + 10 * Math.cos(radG));
      expect(segG.end.y).toBeCloseTo(400 + 10 * Math.sin(radG));
    });

    it('respects visual transposition for both spoke angle and color', () => {
      const score = makeScore([
        { id: 'c4', pitch: 60, onset: 0, duration: 1, velocity: 100, voice: 0, pitchClass: 0 },
      ]);
      const config = { ...DEFAULT_CONFIG, variation: 'polar_fan' as const, lengthScale: 10, transposeSemitones: 2 };
      const geometry = mapScoreToGeometry(score, config, 800, 800);

      const segment = geometry.voicePaths[0].segments[0];
      // pitch 60 + transpose 2 = 62 -> D -> pitchClass 2 -> angle = 60 deg
      const radD = (60 * Math.PI) / 180;
      expect(segment.end.x).toBeCloseTo(400 + 10 * Math.cos(radD));
      expect(segment.end.y).toBeCloseTo(400 + 10 * Math.sin(radD));
      expect(segment.color).toBe('hsl(60, 85%, 60%)'); // D's color
    });

    it('allows unison notes to overlap exactly', () => {
      const score: Score = {
        title: 'Unison', duration: 1, bpm: 120,
        tracks: [
          { name: 'T1', channel: 0, program: 0, instrumentName: 'Piano', notes: [{ id: 'a', pitch: 60, onset: 0, duration: 1, velocity: 100, voice: 0, pitchClass: 0 }] },
          { name: 'T2', channel: 1, program: 0, instrumentName: 'Piano', notes: [{ id: 'b', pitch: 60, onset: 0, duration: 1, velocity: 100, voice: 1, pitchClass: 0 }] },
        ],
      };
      const config = { ...DEFAULT_CONFIG, variation: 'polar_fan' as const };
      const geometry = mapScoreToGeometry(score, config, 800, 800);
      const seg1 = geometry.voicePaths[0].segments[0];
      const seg2 = geometry.voicePaths[1].segments[0];
      expect(seg1.start).toEqual(seg2.start);
      expect(seg1.end).toEqual(seg2.end);
    });

    it('maintains center origin under fitGeometryToCanvas for asymmetric scores', () => {
      const score = makeScore([
        { id: 'c4', pitch: 60, onset: 0, duration: 1, velocity: 100, voice: 0, pitchClass: 0 },
      ]);
      const config = { ...DEFAULT_CONFIG, variation: 'polar_fan' as const };
      const geometry = mapScoreToGeometry(score, config, 800, 800);
      const fitted = fitGeometryToCanvas(geometry, 1000, 600);

      const segment = fitted.voicePaths[0].segments[0];
      // Target center of 1000x600 is (500, 300)
      expect(segment.start.x).toBeCloseTo(500);
      expect(segment.start.y).toBeCloseTo(300);
    });

    it('is completely deterministic', () => {
      const score = makeScore([
        { id: 'c4', pitch: 60, onset: 0, duration: 1, velocity: 100, voice: 0, pitchClass: 0 },
      ]);
      const config = { ...DEFAULT_CONFIG, variation: 'polar_fan' as const };
      const geo1 = mapScoreToGeometry(score, config, 800, 800);
      const geo2 = mapScoreToGeometry(score, config, 800, 800);
      expect(geo1).toEqual(geo2);
    });

    it('ignores gapPolicy and emits no gap segments', () => {
      const score = makeScore([
        { id: 'a', pitch: 60, onset: 0, duration: 0.5, velocity: 100, voice: 0, pitchClass: 0 },
        { id: 'b', pitch: 62, onset: 1.0, duration: 0.5, velocity: 100, voice: 0, pitchClass: 2 },
      ]);
      const config = { ...DEFAULT_CONFIG, variation: 'polar_fan' as const, gapPolicy: 'ghost' as const };
      const geometry = mapScoreToGeometry(score, config, 800, 800);
      const segments = geometry.voicePaths[0].segments;
      expect(segments).toHaveLength(2); // no gap segments
      expect(segments.filter(s => s.role === 'gap')).toHaveLength(0);
    });
  });
});
