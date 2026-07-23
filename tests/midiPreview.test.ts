import { describe, it, expect } from 'vitest';
import { defaultVoiceSettings } from '../src/audio/midiPreviewPlayer.js';

describe('MIDI preview voice defaults', () => {
  it('assigns distinct timbres by voice order, wrapping after four voices', () => {
    expect(defaultVoiceSettings(0).timbre).toBe('sine');
    expect(defaultVoiceSettings(1).timbre).toBe('triangle');
    expect(defaultVoiceSettings(2).timbre).toBe('sawtooth');
    expect(defaultVoiceSettings(3).timbre).toBe('square');
    expect(defaultVoiceSettings(4).timbre).toBe('sine');
  });
});
