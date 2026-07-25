import { describe, it, expect } from 'vitest';
import { defaultVoiceSettings, noteVolume, selectAudibleTracks } from '../src/audio/midiPreviewPlayer.js';
import { Score } from '../src/core/types.js';

describe('MIDI preview voice defaults', () => {
  it('assigns distinct timbres by voice order, wrapping after four voices', () => {
    expect(defaultVoiceSettings(0).timbre).toBe('sine');
    expect(defaultVoiceSettings(1).timbre).toBe('triangle');
    expect(defaultVoiceSettings(2).timbre).toBe('sawtooth');
    expect(defaultVoiceSettings(3).timbre).toBe('square');
    expect(defaultVoiceSettings(4).timbre).toBe('sine');
  });
});

describe('noteVolume', () => {
  it('produces a louder level than the former conservative formula', () => {
    // Old formula peak (velocity 90, gain 1): 0.035 + (90/127)*0.065 ≈ 0.081.
    const oldPeak = 0.035 + (90 / 127) * 0.065;
    expect(noteVolume(90, 1)).toBeGreaterThan(oldPeak * 2.5);
  });

  it('scales linearly with velocity and the per-voice gain', () => {
    expect(noteVolume(0, 1)).toBeCloseTo(0.12, 4);
    expect(noteVolume(127, 1)).toBeCloseTo(0.30, 4);
    expect(noteVolume(127, 0.5)).toBeCloseTo(0.15, 4);
    expect(noteVolume(64, 2)).toBeCloseTo((0.12 + (64 / 127) * 0.18) * 2, 4);
  });

  it('never exceeds a safe ceiling at full velocity/gain overdrive', () => {
    expect(noteVolume(127, 1.5)).toBeLessThanOrEqual(0.5);
  });
});

describe('selectAudibleTracks', () => {
  const score: Score = {
    title: 't', duration: 1, bpm: 120,
    tracks: [
      { name: 'a', channel: 0, program: 0, instrumentName: 'p', notes: [], sustainEvents: [] },
      { name: 'b', channel: 1, program: 32, instrumentName: 'b', notes: [], sustainEvents: [] },
    ],
  };

  it('filters to allowlisted channels', () => {
    const voices = new Map([
      [0, defaultVoiceSettings(0)],
      [1, defaultVoiceSettings(1)],
    ]);
    expect(selectAudibleTracks(score, voices, [1]).map((t) => t.channel)).toEqual([1]);
  });

  it('respects mute', () => {
    const voices = new Map([
      [0, { ...defaultVoiceSettings(0), muted: true }],
      [1, defaultVoiceSettings(1)],
    ]);
    expect(selectAudibleTracks(score, voices).map((t) => t.channel)).toEqual([1]);
  });
});

describe('oscillator fallback timbre (why a two-piano score can sound split)', () => {
  it('cycles timbre by track order: lower=sine, upper=triangle', () => {
    // When the SoundFont patch fails, both voices fall back to the oscillator
    // engine, whose per-voice timbre default cycles by track index. A sine
    // lower voice can read as a soft piano while the triangle upper reads as
    // a synth — the split is the per-voice default, not a shared-patch bug.
    expect(defaultVoiceSettings(0).timbre).toBe('sine');
    expect(defaultVoiceSettings(1).timbre).toBe('triangle');
  });
});
