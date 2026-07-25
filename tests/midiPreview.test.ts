import { describe, it, expect, vi } from 'vitest';
import { defaultVoiceSettings, noteVolume, selectAudibleTracks } from '../src/audio/midiPreviewPlayer.js';
import {
  buildSustainWindows,
  getSustainedDuration,
  playbackEndTime,
  sustainEventsForChannel,
} from '../src/audio/soundfont/sustainWindows.js';
import { NoteEvent, Score } from '../src/core/types.js';

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

describe('oscillator CC64 sustain parity', () => {
  const note = (partial: Partial<NoteEvent> & Pick<NoteEvent, 'onset' | 'duration'>): NoteEvent => ({
    id: 'n', pitch: 60, velocity: 100, voice: 0, pitchClass: 0, ...partial,
  });

  it('extends held duration under CC64 the same way as the sample path', () => {
    const score: Score = {
      title: 't',
      duration: 1.0,
      bpm: 120,
      tracks: [{
        name: 'piano',
        channel: 0,
        program: 0,
        instrumentName: 'p',
        notes: [note({ onset: 0.2, duration: 0.3 })],
        sustainEvents: [{ time: 0, value: 127 }, { time: 2.5, value: 0 }],
      }],
    };
    const windows = buildSustainWindows(sustainEventsForChannel(score, 0), playbackEndTime(score));
    expect(getSustainedDuration(score.tracks[0].notes[0], windows)).toBeCloseTo(2.3);
  });

  it('reports playbackEndTime past visual duration when the pedal trails', () => {
    const score: Score = {
      title: 't',
      duration: 1.0,
      bpm: 120,
      tracks: [{
        name: 'piano',
        channel: 0,
        program: 0,
        instrumentName: 'p',
        notes: [note({ onset: 0, duration: 1.0 })],
        sustainEvents: [{ time: 0, value: 127 }, { time: 2.0, value: 0 }],
      }],
    };
    expect(score.duration).toBe(1.0);
    expect(playbackEndTime(score)).toBeGreaterThan(score.duration);
    expect(playbackEndTime(score)).toBeCloseTo(2.0);
  });

  it('keeps playbackEndTime at visual duration when pedal lifts with the last note', () => {
    const score: Score = {
      title: 't',
      duration: 1.0,
      bpm: 120,
      tracks: [{
        name: 'piano',
        channel: 0,
        program: 0,
        instrumentName: 'p',
        notes: [note({ onset: 0, duration: 1.0 })],
        sustainEvents: [{ time: 0, value: 127 }, { time: 1.0, value: 0 }],
      }],
    };
    expect(playbackEndTime(score)).toBeCloseTo(1.0);
  });
});

describe('MidiPreviewPlayer sustain scheduling', () => {
  it('schedules a CC64-extended note via getSustainedDuration windows', async () => {
    const score: Score = {
      title: 't',
      duration: 0.5,
      bpm: 120,
      tracks: [{
        name: 'piano',
        channel: 0,
        program: 0,
        instrumentName: 'p',
        notes: [{ id: 'n', pitch: 60, onset: 0, duration: 0.2, velocity: 100, voice: 0, pitchClass: 0 }],
        sustainEvents: [{ time: 0, value: 127 }, { time: 1.5, value: 0 }],
      }],
    };
    const windows = buildSustainWindows(sustainEventsForChannel(score, 0), playbackEndTime(score));
    const sustained = getSustainedDuration(score.tracks[0].notes[0], windows);
    expect(sustained).toBeCloseTo(1.5);

    const stop = vi.fn();
    const mockOscillator = {
      type: 'sine' as const,
      frequency: { value: 440 },
      connect: vi.fn().mockReturnThis(),
      start: vi.fn(),
      stop,
      onended: null as (() => void) | null,
    };
    const mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn().mockReturnThis(),
    };
    const context = {
      currentTime: 0,
      resume: vi.fn(async () => {}),
      createOscillator: vi.fn(() => mockOscillator),
      createGain: vi.fn(() => mockGain),
      destination: {},
    } as unknown as AudioContext;

    const { MidiPreviewPlayer } = await import('../src/audio/midiPreviewPlayer.js');
    const player = new MidiPreviewPlayer(context);
    const voices = new Map([[0, defaultVoiceSettings(0)]]);
    await player.start(score, 0, voices);

    expect(mockOscillator.start).toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
    const stopTime = stop.mock.calls[0][0] as number;
    expect(stopTime).toBeGreaterThan(1.5);
  });
});
