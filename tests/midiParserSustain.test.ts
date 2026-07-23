import { describe, expect, it } from 'vitest';
import { parseMidiData } from '../src/core/midi/parser.js';

describe('MIDI parser sustain (CC64)', () => {
  it('captures sustain pedal control changes as 0–127 values', () => {
    // Type-0 SMF: CC64=127 at t=0, note 60, CC64=0, end. Division 96 PPQ.
    const bytes = new Uint8Array([
      0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96, // MThd
      0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 20,                   // MTrk length 20
      0, 0xb0, 64, 127,                                       // CC64 down
      0, 0x90, 60, 100,                                       // note on
      96, 0x80, 60, 64,                                       // note off after 96 ticks
      0, 0xb0, 64, 0,                                         // CC64 up
      0, 0xff, 0x2f, 0,                                       // end of track
    ]);
    const score = parseMidiData(bytes.buffer, 'Sustain Fixture');
    expect(score.tracks.length).toBeGreaterThanOrEqual(1);
    const events = score.tracks[0].sustainEvents ?? [];
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].value).toBeGreaterThanOrEqual(64);
    expect(events.some((e) => e.value < 64)).toBe(true);
  });
});
