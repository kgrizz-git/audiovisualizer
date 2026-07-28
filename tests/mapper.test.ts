import { describe, it, expect } from 'vitest';
import { generateDemoScore } from '../src/core/midi/parser.js';
import { getAverageScoreBackground, getDominantScoreAccent, getTrackAverageAccents, getVisualPitch, mapScoreToGeometry, DEFAULT_CONFIG, getNoteColor, computeRadialVoiceAngles, getPercussionColor, modulateColorByVelocity, getRadialSpokeAutoScale } from '../src/core/mapper/scoreMapper.js';
import { fitGeometryToCanvas } from '../src/core/layout/fitGeometry.js';
import { NoteEvent, RuleConfig, Score } from '../src/core/types.js';

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

    it('draws thin rings whose thickness tracks a 1/64→1/32 note scaled by velocity', () => {
      const score = rvScore([drumTrack([rvNote('loud', 36, 1, 0.1, 127), rvNote('soft', 38, 2, 0.1, 1)])]);
      const [loud, soft] = mapScoreToGeometry(score, config, 800, 800).voicePaths[0].circles;
      const maxRadius = 800 * 0.45;
      const secondsPerBeat = 60 / 120;
      const thirtySecondSec = secondsPerBeat / 8;
      const sixtyFourthSec = secondsPerBeat / 16;
      const expectedFor = (velocity: number) => {
        const v = Math.min(127, Math.max(0, velocity)) / 127;
        const sec = sixtyFourthSec + v * (thirtySecondSec - sixtyFourthSec);
        return Math.max(0.4, (sec / 4) * maxRadius);
      };
      expect(loud.strokeWidth).toBeCloseTo(expectedFor(127));
      expect(soft.strokeWidth).toBeCloseTo(expectedFor(1));
      const expectedOpacityFor = (velocity: number) => 0.35 + 0.45 * (Math.min(127, Math.max(0, velocity)) / 127);
      expect(loud.opacity).toBeCloseTo(expectedOpacityFor(127));
      expect(soft.opacity).toBeCloseTo(expectedOpacityFor(1));
      // Thickness scales with velocity (loud > soft) and stays within a 1/64 → 1/32 band.
      expect(loud.strokeWidth).toBeGreaterThan(soft.strokeWidth);
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

describe('radial_pitch_spokes mapping', () => {
  const note = (id: string, pitch: number, onset: number, duration: number): NoteEvent =>
    ({ id, pitch, onset, duration, velocity: 100, voice: 0, pitchClass: pitch % 12 });
  const track = (name: string, channel: number, notes: NoteEvent[]): Score['tracks'][0] =>
    ({ name, channel, program: 0, instrumentName: name, isPercussion: false, notes });
  const angle = (segment: { start: { x: number; y: number }; end: { x: number; y: number } }) =>
    (Math.atan2(-(segment.end.y - segment.start.y), segment.end.x - segment.start.x) * 180 / Math.PI + 360) % 360;

  it('uses absolute octave-class directions and yellow-to-violet pitch colors', () => {
    const score: Score = {
      title: 'C and G', duration: 4, bpm: 120,
      tracks: [track('Bass', 0, [note('c', 48, 1, 1)]), track('Piccolo', 1, [note('g', 91, 1, 1)])],
    };
    const geometry = mapScoreToGeometry(score, { ...DEFAULT_CONFIG, variation: 'radial_pitch_spokes' }, 800, 800);
    const [c] = geometry.voicePaths[0].segments;
    const [g] = geometry.voicePaths[1].segments;
    expect(angle(c)).toBeCloseTo(90); // C points up
    expect(angle(g)).toBeCloseTo(300); // G points down-right
    expect(c.color).toBe('hsl(60, 85%, 60%)');
    expect(g.color).toBe('hsl(270, 85%, 60%)');
    expect(c.start.y).toBeGreaterThan(400); // bass placement below center
    expect(g.start.y).toBeLessThan(400); // piccolo placement above center
  });

  it('keeps same pitch classes parallel and pitch classes six semitones apart antiparallel', () => {
    const score: Score = {
      title: 'Parallel classes', duration: 4, bpm: 120,
      tracks: [
        track('Bass', 0, [note('c-low', 48, 1, 1), note('fs-low', 54, 2, 1)]),
        track('Piccolo', 1, [note('c-high', 84, 1, 1), note('fs-high', 90, 2, 1)]),
      ],
    };
    const segments = mapScoreToGeometry(score, { ...DEFAULT_CONFIG, variation: 'radial_pitch_spokes' }, 800, 800)
      .voicePaths.flatMap((path) => path.segments);
    const cAngles = segments.filter((segment) => segment.note.pitchClass === 0).map(angle);
    const fsAngles = segments.filter((segment) => segment.note.pitchClass === 6).map(angle);
    expect(cAngles[0]).toBeCloseTo(cAngles[1]);
    expect(Math.abs(cAngles[0] - fsAngles[0])).toBeCloseTo(180);
  });

  it('automatically makes long-score spokes visible and caps short-spoke width', () => {
    const score: Score = {
      title: 'Long score', duration: 320, bpm: 120,
      tracks: [track('Lead', 0, [note('short', 60, 40, 0.05), note('typical', 67, 120, 0.2)])],
    };
    const config = { ...DEFAULT_CONFIG, variation: 'radial_pitch_spokes' as const };
    const autoScale = getRadialSpokeAutoScale(score.tracks[0].notes, score.duration, 360, config);
    expect(autoScale).toBe(96);
    const segments = mapScoreToGeometry(score, config, 800, 800).voicePaths[0].segments;
    const typical = segments.find((segment) => segment.note.id === 'typical')!;
    const short = segments.find((segment) => segment.note.id === 'short')!;
    expect(Math.hypot(typical.end.x - typical.start.x, typical.end.y - typical.start.y)).toBeGreaterThan(20);
    expect(short.width).toBeLessThanOrEqual(Math.hypot(short.end.x - short.start.x, short.end.y - short.start.y) * 0.28);
  });

  it('applies the explicit spoke multiplier after the automatic baseline', () => {
    const score: Score = { title: 'Scale', duration: 40, bpm: 120, tracks: [track('Lead', 0, [note('c', 60, 10, 0.5)])] };
    const length = (scale: number) => {
      const segment = mapScoreToGeometry(score, { ...DEFAULT_CONFIG, variation: 'radial_pitch_spokes', radialSpokeScale: scale }, 800, 800).voicePaths[0].segments[0];
      return Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y);
    };
    expect(length(0.5)).toBeCloseTo(length(1) / 2);
  });
});

describe('Visual property options', () => {
  const fixtureNote = (id: string, velocity: number, onset: number): NoteEvent => ({
    id, pitch: 60, onset, duration: 1, velocity, voice: 0, pitchClass: 0,
  });
  const scoreWith = (notes: NoteEvent[]): Score => ({
    title: 'Options fixture', duration: 4, bpm: 120,
    tracks: [{ name: 'Lead', channel: 0, program: 0, instrumentName: 'Piano', isPercussion: false, notes }],
  });
  const segmentLength = (segment: { start: { x: number; y: number }; end: { x: number; y: number } }): number =>
    Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y);

  describe('velocityOpacity', () => {
    it('maps normal note opacity from 0.6 at velocity zero to 1.0 at velocity 127', () => {
      const score = scoreWith([fixtureNote('soft', 0, 0), fixtureNote('loud', 127, 2)]);
      const config = { ...DEFAULT_CONFIG, chordLayout: 'chain' as const, velocityOpacity: true };
      const segments = mapScoreToGeometry(score, config, 800, 800).voicePaths[0].segments;
      expect(segments[0].opacity).toBeCloseTo(0.6);
      expect(segments[1].opacity).toBeCloseTo(1);
    });

    it('applies the same velocity opacity to note halos and overlap-weighted tonal bands', () => {
      const score = scoreWith([fixtureNote('soft', 0, 0), fixtureNote('loud', 127, 2)]);
      const circles = mapScoreToGeometry(score, { ...DEFAULT_CONFIG, variation: 'circles', velocityOpacity: true }, 800, 800).voicePaths[0].circles;
      expect(circles[0].opacity).toBeCloseTo(0.6);
      expect(circles[1].opacity).toBeCloseTo(1);
      const bands = mapScoreToGeometry(score, { ...DEFAULT_CONFIG, variation: 'tonal_time_lines', velocityOpacity: true }, 800, 4).bands;
      expect(bands[0].opacity).toBeCloseTo(0.6);
      expect(bands[2].opacity).toBeCloseTo(1);
    });
  });

  describe('lengthProportionalTo', () => {
    it('scales segment length with velocity when set to velocity', () => {
      const config: RuleConfig = { ...DEFAULT_CONFIG, chordLayout: 'chain', lengthProportionalTo: 'velocity' };
      const geometry = mapScoreToGeometry(scoreWith([fixtureNote('loud', 127, 0), fixtureNote('half', 64, 2)]), config, 800, 800);
      const [loud, half] = geometry.voicePaths[0].segments.filter((segment) => segment.role !== 'gap');
      expect(segmentLength(loud)).toBeCloseTo(1 * config.lengthScale);
      expect(segmentLength(half)).toBeCloseTo((64 / 127) * config.lengthScale);
    });

    it('keeps very quiet notes visible via the velocityLengthMin floor', () => {
      const config: RuleConfig = { ...DEFAULT_CONFIG, chordLayout: 'chain', lengthProportionalTo: 'velocity', minSegmentLength: 0 };
      const geometry = mapScoreToGeometry(scoreWith([fixtureNote('quiet', 1, 0)]), config, 800, 800);
      expect(segmentLength(geometry.voicePaths[0].segments[0])).toBeCloseTo(config.velocityLengthMin * config.lengthScale);
    });

    it('applies velocity length in the polyphonic line layout', () => {
      const config: RuleConfig = { ...DEFAULT_CONFIG, lengthProportionalTo: 'velocity' };
      const geometry = mapScoreToGeometry(scoreWith([fixtureNote('half', 64, 0)]), config, 800, 800);
      expect(segmentLength(geometry.voicePaths[0].segments[0])).toBeCloseTo((64 / 127) * config.lengthScale);
    });

    it('applies velocity length in the polyphonic polar walk', () => {
      const config: RuleConfig = { ...DEFAULT_CONFIG, variation: 'polar_walk', lengthProportionalTo: 'velocity' };
      const geometry = mapScoreToGeometry(scoreWith([fixtureNote('half', 64, 0)]), config, 800, 800);
      expect(segmentLength(geometry.voicePaths[0].segments[0])).toBeCloseTo((64 / 127) * config.lengthScale);
    });

    it('defaults to duration-proportional length (no regression)', () => {
      const geometry = mapScoreToGeometry(scoreWith([fixtureNote('quiet', 1, 0)]), { ...DEFAULT_CONFIG, chordLayout: 'chain' }, 800, 800);
      expect(segmentLength(geometry.voicePaths[0].segments[0])).toBeCloseTo(DEFAULT_CONFIG.lengthScale);
    });
  });

  describe('velocityGlow', () => {
    const noteAt = (velocity: number): NoteEvent => fixtureNote('n', velocity, 0);

    it('scales HSL saturation with velocity when enabled', () => {
      const config: RuleConfig = { ...DEFAULT_CONFIG, velocityGlow: true };
      expect(getNoteColor(noteAt(127), config)).toBe('hsl(0, 100%, 60%)');
      expect(getNoteColor(noteAt(0), config)).toBe('hsl(0, 45%, 60%)');
    });

    it('keeps the fixed 85% saturation when disabled', () => {
      expect(getNoteColor(noteAt(127), DEFAULT_CONFIG)).toBe('hsl(0, 85%, 60%)');
    });

    it('gives identical velocities identical colors', () => {
      const config: RuleConfig = { ...DEFAULT_CONFIG, velocityGlow: true };
      expect(getNoteColor(fixtureNote('a', 96, 0), config)).toBe(getNoteColor(fixtureNote('b', 96, 2), config));
    });

    it('modulateColorByVelocity rewrites hsl saturation and passes other colors through', () => {
      expect(modulateColorByVelocity('hsl(120, 85%, 60%)', 127)).toBe('hsl(120, 100%, 60%)');
      expect(modulateColorByVelocity('#94a3b8', 127)).toBe('#94a3b8');
    });

    it('applies velocity saturation in the polyphonic line layout', () => {
      const config: RuleConfig = { ...DEFAULT_CONFIG, velocityGlow: true };
      const geometry = mapScoreToGeometry(scoreWith([fixtureNote('n', 127, 0)]), config, 800, 800);
      expect(geometry.voicePaths[0].segments[0].color).toBe('hsl(0, 100%, 60%)');
    });
  });

  describe('constantStrokeWidth', () => {
    it('uses the base width for every note when enabled', () => {
      const config: RuleConfig = { ...DEFAULT_CONFIG, chordLayout: 'chain', constantStrokeWidth: true };
      const geometry = mapScoreToGeometry(scoreWith([fixtureNote('loud', 127, 0), fixtureNote('soft', 10, 2)]), config, 800, 800);
      const widths = geometry.voicePaths[0].segments.filter((segment) => segment.role !== 'gap').map((segment) => segment.width);
      expect(widths).toEqual([config.strokeWidthBase, config.strokeWidthBase]);
    });

    it('keeps uniform widths across polyphonic chord fans', () => {
      const config: RuleConfig = { ...DEFAULT_CONFIG, constantStrokeWidth: true };
      const chord = [fixtureNote('a', 127, 0), { ...fixtureNote('b', 30, 0), pitch: 64, pitchClass: 4 }];
      const geometry = mapScoreToGeometry(scoreWith(chord), config, 800, 800);
      const widths = geometry.voicePaths[0].segments.map((segment) => segment.width);
      expect(new Set(widths).size).toBe(1);
      expect(widths[0]).toBe(config.strokeWidthBase);
    });

    it('scales width with velocity by default (no regression)', () => {
      const geometry = mapScoreToGeometry(scoreWith([fixtureNote('soft', 10, 0)]), { ...DEFAULT_CONFIG, chordLayout: 'chain' }, 800, 800);
      expect(geometry.voicePaths[0].segments[0].width).toBeCloseTo(DEFAULT_CONFIG.strokeWidthBase + (10 / 127) * DEFAULT_CONFIG.strokeWidthScale);
    });
  });
});
