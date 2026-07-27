import { describe, expect, it } from 'vitest';
import { Variation } from '../src/core/types.js';
import { VARIATIONS, pickRandom } from '../src/ui/launchRandomizer.js';

describe('launchRandomizer', () => {
  describe('VARIATIONS', () => {
    it('has exactly 12 variations', () => {
      expect(VARIATIONS.length).toBe(12);
    });

    it('contains all 12 expected variation values', () => {
      const expected: Variation[] = [
        'lines',
        'circles',
        'vertical_tone',
        'tonal_time_lines',
        'polar_fan',
        'polar_walk',
        '3d_lines',
        '3d_note_halos',
        '3d_note_spheres',
        '3d_piano_roll',
        '3d_polar_fan',
        '3d_polar_walk',
      ];
      expect(Array.from(VARIATIONS)).toEqual(expected);
    });

    it('all elements in VARIATIONS are non-empty strings conforming to Variation type', () => {
      for (const v of VARIATIONS) {
        expect(typeof v).toBe('string');
        expect(v.length).toBeGreaterThan(0);
      }
    });
  });

  describe('pickRandom', () => {
    it('selects items from normal array based on random function', () => {
      const items = ['a', 'b', 'c', 'd'];

      // rand() = 0 -> index 0 ('a')
      expect(pickRandom(items, () => 0)).toBe('a');

      // rand() = 0.25 -> index 1 ('b')
      expect(pickRandom(items, () => 0.25)).toBe('b');

      // rand() = 0.5 -> index 2 ('c')
      expect(pickRandom(items, () => 0.5)).toBe('c');

      // rand() = 0.999 -> index 3 ('d')
      expect(pickRandom(items, () => 0.999)).toBe('d');
    });

    it('handles single-item array', () => {
      const items = ['only'];
      expect(pickRandom(items, () => 0)).toBe('only');
      expect(pickRandom(items, () => 0.5)).toBe('only');
      expect(pickRandom(items, () => 0.999)).toBe('only');
    });

    it('clamps index safely if rand() returns 1.0', () => {
      const items = ['x', 'y', 'z'];
      expect(pickRandom(items, () => 1.0)).toBe('z');
    });

    it('throws error when array is empty', () => {
      expect(() => pickRandom([], () => 0.5)).toThrow(
        'Cannot pick random item from empty array'
      );
    });
  });

  describe('select element option querying & randomization', () => {
    it('correctly reads options from a mock select element and picks a random demo option', () => {
      const mockSelect = {
        options: [
          { value: 'demo/bach.mid', text: 'Bach - Inventio 1' },
          { value: 'demo/beethoven.mid', text: 'Beethoven - Elise' },
          { value: 'demo/chopin.mid', text: 'Chopin - Nocturne' },
        ],
      };

      const demoOptions = Array.from(mockSelect.options).map((opt) => ({
        url: opt.value,
        title: opt.text,
      }));

      expect(demoOptions.length).toBe(3);

      const pickedFirst = pickRandom(demoOptions, () => 0);
      expect(pickedFirst).toEqual({
        url: 'demo/bach.mid',
        title: 'Bach - Inventio 1',
      });

      const pickedSecond = pickRandom(demoOptions, () => 0.4);
      expect(pickedSecond).toEqual({
        url: 'demo/beethoven.mid',
        title: 'Beethoven - Elise',
      });
    });

    it('handles select element with empty options array without calling pickRandom', () => {
      const mockSelect = {
        options: [] as { value: string; text: string }[],
      };

      const demoOptions = Array.from(mockSelect.options).map((opt) => ({
        url: opt.value,
        title: opt.text,
      }));

      expect(demoOptions.length).toBe(0);
      if (demoOptions.length > 0) {
        pickRandom(demoOptions, () => 0.5);
      }
    });
  });
});
