import { describe, it, expect } from 'vitest';
import { generateDemoScore } from '../src/core/midi/parser.js';
import { getAverageScoreBackground, getDominantScoreAccent, getTrackAverageAccents, getVisualPitch, mapScoreToGeometry, DEFAULT_CONFIG, getNoteColor, computeRadialVoiceAngles, getPercussionColor } from '../src/core/mapper/scoreMapper.js';
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
        { name: 'Lead', channel: 0, program: 0, instrumentName: 'Piano', isPercussion: false, notes: [
          // pitch-class 0 => hue 0, but quiet and short.
          { id: 'a', pitch: 60, onset: 0, duration: 0.1, velocity: 10, voice: 0, pitchClass: 0 },
        ] },
        { name: 'Bass', channel: 1, program: 32, instrumentName: 'Bass', isPercussion: false, notes: [
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
      tracks: [{ name: 'Lead', channel: 0, program: 0, instrumentName: 'Piano', isPercussion: false, notes: [
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
        { name: 'Lead', channel: 0, program: 0, instrumentName: 'Piano', isPercussion: false, notes: [
          // Quiet, short note at hue 0 — should barely perturb the average.
          { id: 'a', pitch: 60, onset: 0, duration: 0.1, velocity: 10, voice: 0, pitchClass: 0 },
        ] },
        { name: 'Bass', channel: 1, program: 32, instrumentName: 'Bass', isPercussion: false, notes: [
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
        { name: 'Lead', channel: 0, program: 0, instrumentName: 'Piano', isPercussion: false, notes: [
          { id: 'a', pitch: 60, onset: 0.02, duration: 0.2, velocity: 100, voice: 0, pitchClass: 0 },
          { id: 'b', pitch: 64, onset: 0.63, duration: 0.2, velocity: 100, voice: 0, pitchClass: 4 },
        ] },
        { name: 'Bass', channel: 1, program: 32, instrumentName: 'Bass', isPercussion: false, notes: [{ id: 'c', pitch: 36, onset: 0, duration: 1, velocity: 100, voice: 1, pitchClass: 0 }] },
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
      tracks: [{ name: 'Lead', channel: 0, program: 0, instrumentName: 'Piano', isPercussion: false, notes: [
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
      tracks: [{ name: 'Lead', channel: 0, program: 0, instrumentName: 'Piano', isPercussion: false, notes: [
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
      title: 'Tonal fixture', duration: 4, bpm: 120, tracks: [{ name: 'Voice', channel: 0, program: 0, instrumentName: 'Piano', isPercussion: false, notes: [
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
      tracks: [{ name: 'Track 1', channel: 0, program: 0, instrumentName: 'Piano', isPercussion: false, notes }],
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
          { name: 'T1', channel: 0, program: 0, instrumentName: 'Piano', isPercussion: false, notes: [{ id: 'a', pitch: 60, onset: 0, duration: 1, velocity: 100, voice: 0, pitchClass: 0 }] },
          { name: 'T2', channel: 1, program: 0, instrumentName: 'Piano', isPercussion: false, notes: [{ id: 'b', pitch: 60, onset: 0, duration: 1, velocity: 100, voice: 1, pitchClass: 0 }] },
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

describe('radial_voice_paths mapping', () => {
  const config = { ...DEFAULT_CONFIG, variation: 'radial_voice_paths' as const };

  function rvNote(id: string, pitch: number, onset: number, duration: number, velocity = 100): NoteEvent {
    return { id, pitch, onset, duration, velocity, voice: 0, pitchClass: pitch % 12 };
  }

  function rvScore(tracks: Score['tracks'], duration = 4): Score {
    return { title: 'Radial fixture', duration, bpm: 120, tracks };
  }

  function pitchedTrack(name: string, channel: number, notes: NoteEvent[]): Score['tracks'][0] {
    return { name, channel, program: 0, instrumentName: 'Piano', isPercussion: false, notes };
  }

  function drumTrack(notes: NoteEvent[]): Score['tracks'][0] {
    return { name: 'Drums', channel: 9, program: 0, instrumentName: 'Drum Kit', isPercussion: true, notes };
  }

  /** Angle of a segment's outward direction from the 800×800 center, in y-up degrees [0, 360). */
  function segmentAngle(segment: { start: { x: number; y: number }; end: { x: number; y: number } }): number {
    const deg = (Math.atan2(-(segment.end.y - 400), segment.end.x - 400) * 180) / Math.PI;
    return (deg + 360) % 360;
  }

  describe('computeRadialVoiceAngles', () => {
    it('points the lowest voice down (270°) and the highest up (90°)', () => {
      const spokes = computeRadialVoiceAngles([
        { voice: 0, medianPitch: 40 },
        { voice: 1, medianPitch: 84 },
      ]);
      expect(spokes.get(0)!.angle).toBeCloseTo(270);
      expect(spokes.get(1)!.angle).toBeCloseTo(90);
    });

    it('distributes intermediate voices between the vertical extremes', () => {
      const spokes = computeRadialVoiceAngles([
        { voice: 0, medianPitch: 40 },
        { voice: 1, medianPitch: 60 },
        { voice: 2, medianPitch: 84 },
      ]);
      expect(spokes.get(0)!.angle).toBeCloseTo(270); // bass down
      expect(spokes.get(1)!.angle).toBeCloseTo(180); // middle lateral
      expect(spokes.get(2)!.angle).toBeCloseTo(90); // treble up
    });

    it('points a single voice laterally right (0°)', () => {
      const spokes = computeRadialVoiceAngles([{ voice: 0, medianPitch: 60 }]);
      expect(spokes.get(0)!.angle).toBeCloseTo(0);
    });

    it('fans voices sharing a median pitch apart instead of overlapping them', () => {
      const spokes = computeRadialVoiceAngles([
        { voice: 0, medianPitch: 60 },
        { voice: 1, medianPitch: 60 },
      ]);
      const a = spokes.get(0)!;
      const b = spokes.get(1)!;
      expect(a.angle).not.toBeCloseTo(b.angle);
      expect(Math.abs(a.angle - b.angle)).toBeCloseTo(4); // ±2° around the shared spoke
      expect(a.voicesOnSpoke).toBe(2);
      expect(b.voicesOnSpoke).toBe(2);
    });

    it('groups voices into at most 12 spoke slots when many registers are present', () => {
      const voices = Array.from({ length: 24 }, (_, i) => ({ voice: i, medianPitch: 30 + i * 2 }));
      const spokes = computeRadialVoiceAngles(voices);
      expect(spokes.size).toBe(24);
      // 24 distinct medians squeeze into 12 slots, so every spoke is shared by 2 voices.
      spokes.forEach((spoke) => expect(spoke.voicesOnSpoke).toBe(2));
    });

    it('returns an empty map for no voices', () => {
      expect(computeRadialVoiceAngles([]).size).toBe(0);
    });
  });

  describe('pitched voice segments', () => {
    it('renders bass in the bottom half and violin in the top half of the canvas', () => {
      const score = rvScore([
        pitchedTrack('Bass', 0, [rvNote('b1', 40, 1, 1)]),
        pitchedTrack('Violin', 1, [rvNote('v1', 84, 1, 1)]),
      ]);
      const geometry = mapScoreToGeometry(score, config, 800, 800);
      const bass = geometry.voicePaths[0].segments[0];
      const violin = geometry.voicePaths[1].segments[0];
      expect(bass.end.y).toBeGreaterThan(400); // below center
      expect(violin.end.y).toBeLessThan(400); // above center
    });

    it('maps onset/offset to radial start/end distances from the center', () => {
      const score = rvScore([pitchedTrack('Lead', 0, [rvNote('a', 60, 1, 2)])], 4);
      const geometry = mapScoreToGeometry(score, config, 800, 800);
      const segment = geometry.voicePaths[0].segments[0];
      const maxRadius = 800 * 0.45;
      expect(Math.hypot(segment.start.x - 400, segment.start.y - 400)).toBeCloseTo((1 / 4) * maxRadius);
      expect(Math.hypot(segment.end.x - 400, segment.end.y - 400)).toBeCloseTo((3 / 4) * maxRadius);
    });

    it('fans notes ±1° per semitone from the voice median, clamped to ±5°', () => {
      const score = rvScore([
        pitchedTrack('Lead', 0, [
          rvNote('low', 60, 0.5, 1),
          rvNote('mid', 60, 1.5, 1),
          rvNote('far', 80, 2.5, 1), // 20 semitones above median 60 → clamped to +5°
        ]),
      ]);
      const geometry = mapScoreToGeometry(score, config, 800, 800);
      const [low, , far] = geometry.voicePaths[0].segments;
      expect(segmentAngle(low)).toBeCloseTo(0); // at the median: straight along the spoke
      expect(segmentAngle(far)).toBeCloseTo(5); // clamped, not 20°
    });

    it('scales opacity as 1/n for voices sharing a spoke', () => {
      const solo = mapScoreToGeometry(rvScore([pitchedTrack('Solo', 0, [rvNote('a', 60, 1, 1)])]), config, 800, 800);
      const shared = mapScoreToGeometry(
        rvScore([
          pitchedTrack('T1', 0, [rvNote('a', 60, 1, 1)]),
          pitchedTrack('T2', 1, [rvNote('b', 60, 1, 1)]),
        ]),
        config,
        800,
        800,
      );
      const soloOpacity = solo.voicePaths[0].segments[0].opacity;
      expect(shared.voicePaths[0].segments[0].opacity).toBeCloseTo(soloOpacity / 2);
      expect(shared.voicePaths[1].segments[0].opacity).toBeCloseTo(soloOpacity / 2);
    });

    it('maps velocity to stroke width', () => {
      const score = rvScore([
        pitchedTrack('Lead', 0, [rvNote('soft', 60, 0.5, 1, 20), rvNote('loud', 60, 2, 1, 127)]),
      ]);
      const geometry = mapScoreToGeometry(score, config, 800, 800);
      const [soft, loud] = geometry.voicePaths[0].segments;
      expect(loud.width).toBeGreaterThan(soft.width);
      expect(loud.width).toBeCloseTo(config.strokeWidthBase + config.strokeWidthScale);
    });
  });

  describe('percussion concentric rings', () => {
    it('routes percussion to circles only, never spoke segments', () => {
      const score = rvScore([
        pitchedTrack('Lead', 0, [rvNote('a', 60, 1, 1)]),
        drumTrack([rvNote('k', 36, 2, 0.1)]),
      ]);
      const geometry = mapScoreToGeometry(score, config, 800, 800);
      expect(geometry.voicePaths[0].segments.length).toBe(1);
      expect(geometry.voicePaths[0].circles.length).toBe(0);
      expect(geometry.voicePaths[1].segments.length).toBe(0);
      expect(geometry.voicePaths[1].circles.length).toBe(1);
    });

    it('renders rings centered on the canvas with radius proportional to onset', () => {
      const score = rvScore([drumTrack([rvNote('k1', 36, 1, 0.1), rvNote('k2', 36, 2, 0.1)])], 4);
      const geometry = mapScoreToGeometry(score, config, 800, 800);
      const [first, second] = geometry.voicePaths[0].circles;
      const maxRadius = 800 * 0.45;
      expect(first.center).toEqual({ x: 400, y: 400 });
      expect(first.radius).toBeCloseTo((1 / 4) * maxRadius);
      expect(second.radius).toBeCloseTo((2 / 4) * maxRadius);
    });

    it('emits stroke-only rings flagged as percussion', () => {
      const score = rvScore([drumTrack([rvNote('k', 36, 1, 0.1)])]);
      const circle = mapScoreToGeometry(score, config, 800, 800).voicePaths[0].circles[0];
      expect(circle.fillColor).toBe('none');
      expect(circle.isPercussion).toBe(true);
    });

    it('keeps beat-one hits visible with a minimum ring radius', () => {
      const score = rvScore([drumTrack([rvNote('k', 36, 0, 0.1)])]);
      const circle = mapScoreToGeometry(score, config, 800, 800).voicePaths[0].circles[0];
      expect(circle.radius).toBeGreaterThan(0);
    });

    it('colors rings by General MIDI percussion family with a grey fallback', () => {
      expect(getPercussionColor(36)).toBe('hsl(0, 85%, 60%)'); // kick — red
      expect(getPercussionColor(38)).toBe('hsl(30, 85%, 60%)'); // snare — orange
      expect(getPercussionColor(42)).toBe('hsl(190, 85%, 60%)'); // hi-hat — cyan
      expect(getPercussionColor(49)).toBe('hsl(55, 85%, 60%)'); // cymbal — yellow
      expect(getPercussionColor(45)).toBe('hsl(140, 85%, 60%)'); // tom — green
      expect(getPercussionColor(75)).toBe('hsl(0, 0%, 62%)'); // unknown — grey
      const score = rvScore([drumTrack([rvNote('k', 36, 1, 0.1), rvNote('h', 42, 2, 0.1)])]);
      const circles = mapScoreToGeometry(score, config, 800, 800).voicePaths[0].circles;
      expect(circles[0].strokeColor).toBe(getPercussionColor(36));
      expect(circles[1].strokeColor).toBe(getPercussionColor(42));
    });
  });

  it('is completely deterministic', () => {
    const score = rvScore([
      pitchedTrack('Bass', 0, [rvNote('b1', 40, 0, 1), rvNote('b2', 43, 1.5, 0.5)]),
      pitchedTrack('Violin', 1, [rvNote('v1', 84, 0.25, 1)]),
      drumTrack([rvNote('k', 36, 1, 0.1), rvNote('h', 42, 2, 0.1)]),
    ]);
    const geo1 = mapScoreToGeometry(score, config, 800, 800);
    const geo2 = mapScoreToGeometry(score, config, 800, 800);
    expect(geo1).toEqual(geo2);
  });
});
