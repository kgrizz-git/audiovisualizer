import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/core/mapper/scoreMapper.js';
import { ConfigHistory, decodeConfig, encodeConfig, restoreConfig } from '../src/ui/configPersistence.js';

describe('config persistence', () => {
  it('round-trips visual configuration without voice filters or MIDI data', () => {
    const encoded = encodeConfig({ ...DEFAULT_CONFIG, variation: 'radial_pitch_spokes', voiceFilter: [1, 4] });
    expect(encoded).not.toContain('voiceFilter');
    expect(encoded).not.toContain('midi');
    expect(restoreConfig(decodeConfig(encoded)!)).toMatchObject({ variation: 'radial_pitch_spokes', voiceFilter: null });
  });

  it('rejects malformed or unknown variations', () => {
    expect(decodeConfig('not-json')).toBeNull();
    expect(decodeConfig(encodeURIComponent(JSON.stringify({ ...DEFAULT_CONFIG, variation: 'unknown' })))).toBeNull();
  });

  it('keeps a bounded undo/redo history', () => {
    const history = new ConfigHistory(2);
    history.reset(DEFAULT_CONFIG);
    history.record({ ...DEFAULT_CONFIG, transposeSemitones: 3 });
    history.record({ ...DEFAULT_CONFIG, transposeSemitones: 5 });
    expect(history.undo()?.transposeSemitones).toBe(3);
    expect(history.undo()).toBeNull();
    expect(history.redo()?.transposeSemitones).toBe(5);
  });
});
