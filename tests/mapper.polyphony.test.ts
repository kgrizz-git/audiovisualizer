import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../src/core/mapper/scoreMapper.js';

describe('polyphonic line paths', () => {
  it('defaults chordLayout to polyphony', () => {
    expect(DEFAULT_CONFIG.chordLayout).toBe('polyphony');
  });
});
