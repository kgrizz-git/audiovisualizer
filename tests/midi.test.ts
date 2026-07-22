import { describe, expect, it } from 'vitest';
import { parseMidiData } from '../src/core/midi/parser.js';

describe('MIDI parser', () => {
  it('normalizes a minimal MIDI file into a timed, sorted note track', () => {
    const bytes = new Uint8Array([
      0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96,
      0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 12,
      0, 0x90, 60, 100, 96, 0x80, 60, 64, 0, 0xff, 0x2f, 0,
    ]);
    const score = parseMidiData(bytes.buffer, 'Fixture MIDI');
    expect(score.title).toBe('Fixture MIDI');
    expect(score.tracks).toHaveLength(1);
    expect(score.tracks[0].notes[0]).toMatchObject({ pitch: 60, onset: 0, velocity: 100, pitchClass: 0 });
    expect(score.tracks[0].notes[0].duration).toBeGreaterThan(0);
  });
});
