import { describe, it, expect } from 'vitest';
import { midiNoteName, midiFromNoteName, nearestSampleKey } from '../src/audio/soundfont/midiNoteName.js';

describe('midi note names (midi-js convention, sharps only)', () => {
  it('maps MIDI 60 to C4 and 61 to C#4', () => {
    expect(midiNoteName(60)).toBe('C4');
    expect(midiNoteName(61)).toBe('C#4');
    expect(midiNoteName(69)).toBe('A4');
    expect(midiFromNoteName('C4')).toBe(60);
  });

  it('picks nearest available sample key (tie → lower)', () => {
    const available = ['C4', 'E4'];
    expect(nearestSampleKey(60, available)).toBe('C4');      // exact
    expect(nearestSampleKey(62, available)).toBe('C4');      // D4 missing; closer to C4? D=62, C=60, E=64 → distances 2 and 2 → lower → C4
    expect(nearestSampleKey(63, available)).toBe('E4');      // closer to E4
  });
});
