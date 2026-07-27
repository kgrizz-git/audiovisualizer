import { describe, expect, it } from 'vitest';
import { parseMidiData, resolveScoreTitle } from '../src/core/midi/parser.js';

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
    expect(score.tracks[0].isPercussion).toBe(false);
    expect(score.tracks[0].notes[0]).toMatchObject({ pitch: 60, onset: 0, velocity: 100, pitchClass: 0 });
    expect(score.tracks[0].notes[0].duration).toBeGreaterThan(0);
  });

  it('sets isPercussion to true for channel 9 (MIDI Channel 10)', () => {
    // 0x99 is Note On on Channel 9 (10th MIDI channel, zero-indexed 9)
    const bytes = new Uint8Array([
      0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96,
      0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 12,
      0, 0x99, 36, 100, 96, 0x89, 36, 64, 0, 0xff, 0x2f, 0,
    ]);
    const score = parseMidiData(bytes.buffer, 'Percussion MIDI');
    expect(score.tracks).toHaveLength(1);
    expect(score.tracks[0].channel).toBe(9);
    expect(score.tracks[0].isPercussion).toBe(true);
  });

  it('ignores MuseScore "control track" sequence names and uses the fallback title', () => {
    // Sequence name meta (FF 03): "control track" + one Middle-C note.
    const name = 'control track';
    const nameBytes = [...name].map((ch) => ch.charCodeAt(0));
    const trackPayload = new Uint8Array([
      0, 0xff, 0x03, nameBytes.length, ...nameBytes,
      0, 0x90, 60, 100,
      96, 0x80, 60, 64,
      0, 0xff, 0x2f, 0,
    ]);
    const trackLen = trackPayload.length;
    const bytes = new Uint8Array([
      0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96,
      0x4d, 0x54, 0x72, 0x6b, 0, 0, (trackLen >> 8) & 0xff, trackLen & 0xff,
      ...trackPayload,
    ]);
    const score = parseMidiData(bytes.buffer, 'Bach Prelude in C · full score (2:20)');
    expect(score.title).toBe('Bach Prelude in C · full score (2:20)');
  });
});

describe('resolveScoreTitle', () => {
  it('keeps real sequence names and rejects blank / placeholder names', () => {
    expect(resolveScoreTitle('Beethoven - Für Elise', 'fallback')).toBe('Beethoven - Für Elise');
    expect(resolveScoreTitle('', 'fallback')).toBe('fallback');
    expect(resolveScoreTitle('   ', 'fallback')).toBe('fallback');
    expect(resolveScoreTitle('control track', 'fallback')).toBe('fallback');
    expect(resolveScoreTitle('Control Track', 'fallback')).toBe('fallback');
    expect(resolveScoreTitle('Tempo Track', 'fallback')).toBe('fallback');
  });
});
