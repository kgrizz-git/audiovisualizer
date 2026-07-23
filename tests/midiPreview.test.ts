import { describe, it, expect } from 'vitest';
import { defaultVoiceSettings, selectAudibleTracks } from '../src/audio/midiPreviewPlayer.js';
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
