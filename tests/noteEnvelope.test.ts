import { describe, it, expect, beforeEach } from 'vitest';
import {
  NOTE_ENVELOPE_DEFAULTS,
  applyNoteEnvelope,
  noteSourceStopTime,
} from '../src/audio/noteEnvelope.js';

type GainCall =
  | { method: 'setValueAtTime'; value: number; time: number }
  | { method: 'exponentialRampToValueAtTime'; value: number; time: number };

function createMockAudioParam(): AudioParam & { calls: GainCall[] } {
  const calls: GainCall[] = [];
  return {
    calls,
    setValueAtTime(value: number, time: number) {
      calls.push({ method: 'setValueAtTime', value, time });
      return this;
    },
    exponentialRampToValueAtTime(value: number, time: number) {
      calls.push({ method: 'exponentialRampToValueAtTime', value, time });
      return this;
    },
  } as unknown as AudioParam & { calls: GainCall[] };
}

describe('applyNoteEnvelope', () => {
  let gain: AudioParam & { calls: GainCall[] };

  beforeEach(() => {
    gain = createMockAudioParam();
  });

  it('schedules attack → decay → hold → release with documented defaults', () => {
    const start = 1.0;
    const end = 2.0;
    const peak = 0.25;
    const release = applyNoteEnvelope(gain, { start, end, peak });

    expect(release).toBe(NOTE_ENVELOPE_DEFAULTS.release);
    expect(gain.calls.map((c) => c.method)).toEqual([
      'setValueAtTime',
      'exponentialRampToValueAtTime',
      'exponentialRampToValueAtTime',
      'setValueAtTime',
      'exponentialRampToValueAtTime',
    ]);

    expect(gain.calls[0]).toMatchObject({ method: 'setValueAtTime', value: NOTE_ENVELOPE_DEFAULTS.floor, time: start });
    expect(gain.calls[1]).toMatchObject({
      method: 'exponentialRampToValueAtTime',
      value: peak,
      time: start + NOTE_ENVELOPE_DEFAULTS.attack,
    });
    expect(gain.calls[2]).toMatchObject({
      method: 'exponentialRampToValueAtTime',
      value: peak * NOTE_ENVELOPE_DEFAULTS.sustainLevel,
      time: start + NOTE_ENVELOPE_DEFAULTS.attack + NOTE_ENVELOPE_DEFAULTS.decay,
    });
    expect(gain.calls[3]).toMatchObject({
      method: 'setValueAtTime',
      value: peak * NOTE_ENVELOPE_DEFAULTS.sustainLevel,
      time: end,
    });
    expect(gain.calls[4]).toMatchObject({
      method: 'exponentialRampToValueAtTime',
      value: NOTE_ENVELOPE_DEFAULTS.floor,
      time: end + NOTE_ENVELOPE_DEFAULTS.release,
    });
  });

  it('clamps attack and decay when the note is shorter than attack + decay', () => {
    const start = 0;
    const end = 0.03;
    applyNoteEnvelope(gain, { start, end, peak: 0.2 });

    const attackEnd = gain.calls[1].time;
    const decayEnd = gain.calls[2].time;
    expect(attackEnd - start).toBeLessThan(NOTE_ENVELOPE_DEFAULTS.attack);
    expect(decayEnd - attackEnd).toBeLessThan(NOTE_ENVELOPE_DEFAULTS.decay);
    expect(decayEnd - start).toBeLessThanOrEqual(end + 1e-9);
  });

  it('returns release duration for source.stop scheduling', () => {
    const customRelease = 0.12;
    const returned = applyNoteEnvelope(gain, { start: 0, end: 1, peak: 0.5, release: customRelease });
    expect(returned).toBe(customRelease);
    expect(noteSourceStopTime(1, returned)).toBeCloseTo(1 + customRelease + 0.002, 5);
  });
});
