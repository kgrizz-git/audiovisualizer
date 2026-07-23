import { describe, it, expect } from 'vitest';
import {
  buildSustainWindows,
  getSustainedDuration,
  sustainEventsForChannel,
} from '../src/audio/soundfont/sustainWindows.js';
import { NoteEvent, Score } from '../src/core/types.js';

const note = (partial: Partial<NoteEvent> & Pick<NoteEvent, 'onset' | 'duration'>): NoteEvent => ({
  id: 'n', pitch: 60, velocity: 100, voice: 0, pitchClass: 0, ...partial,
});

describe('offline sustain windows', () => {
  it('extends note duration through the pedal-up time', () => {
    const windows = buildSustainWindows(
      [{ time: 0.5, value: 127 }, { time: 2.0, value: 0 }],
      10,
    );
    expect(windows).toEqual([{ start: 0.5, end: 2.0 }]);
    // onset 0.4, natural release 0.7 → inside [0.5, 2.0] → duration 2.0 - 0.4 = 1.6
    expect(getSustainedDuration(note({ onset: 0.4, duration: 0.3 }), windows)).toBeCloseTo(1.6);
  });

  it('clamps an open pedal to score end (never Infinity)', () => {
    const windows = buildSustainWindows([{ time: 1, value: 100 }], 5);
    expect(windows[0].end).toBe(5);
    expect(Number.isFinite(getSustainedDuration(note({ onset: 1.2, duration: 0.2 }), windows))).toBe(true);
  });

  it('sustains a note that starts after pedal is already down', () => {
    const windows = buildSustainWindows(
      [{ time: 0, value: 127 }, { time: 3, value: 0 }],
      10,
    );
    expect(getSustainedDuration(note({ onset: 1, duration: 0.2 }), windows)).toBeCloseTo(2);
  });

  it('leaves duration unchanged when release is outside any pedal window', () => {
    const windows = buildSustainWindows(
      [{ time: 2, value: 127 }, { time: 4, value: 0 }],
      10,
    );
    expect(getSustainedDuration(note({ onset: 0, duration: 0.5 }), windows)).toBeCloseTo(0.5);
  });

  it('handles two sequential pedal windows', () => {
    const windows = buildSustainWindows(
      [
        { time: 0, value: 127 }, { time: 1, value: 0 },
        { time: 2, value: 127 }, { time: 4, value: 0 },
      ],
      10,
    );
    expect(windows).toEqual([{ start: 0, end: 1 }, { start: 2, end: 4 }]);
    expect(getSustainedDuration(note({ onset: 2.1, duration: 0.2 }), windows)).toBeCloseTo(1.9);
  });

  it('merges sustain events across tracks that share a channel', () => {
    const score = {
      title: 't', duration: 10, bpm: 120,
      tracks: [
        { name: 'a', channel: 0, program: 0, instrumentName: 'p', notes: [], sustainEvents: [{ time: 0, value: 127 }] },
        { name: 'b', channel: 0, program: 0, instrumentName: 'p', notes: [], sustainEvents: [{ time: 2, value: 0 }] },
        { name: 'c', channel: 1, program: 32, instrumentName: 'b', notes: [], sustainEvents: [{ time: 1, value: 127 }] },
      ],
    } as Score;
    expect(sustainEventsForChannel(score, 0)).toEqual([
      { time: 0, value: 127 },
      { time: 2, value: 0 },
    ]);
  });
});
