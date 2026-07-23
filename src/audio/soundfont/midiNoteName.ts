const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** midi-js-soundfonts key names use sharps only (never flats). MIDI 60 = C4. */
export function midiNoteName(midi: number): string {
  const n = Math.max(0, Math.min(127, Math.trunc(midi)));
  const name = NAMES[n % 12];
  const octave = Math.floor(n / 12) - 1;
  return `${name}${octave}`;
}

export function midiFromNoteName(name: string): number {
  const match = /^([A-G]#?)(-?\d+)$/.exec(name);
  if (!match) return 60;
  const pc = NAMES.indexOf(match[1] as typeof NAMES[number]);
  const octave = Number(match[2]);
  if (pc < 0) return 60;
  return (octave + 1) * 12 + pc;
}

export function nearestSampleKey(midi: number, availableKeys: string[]): string {
  if (availableKeys.length === 0) return midiNoteName(midi);
  const exact = midiNoteName(midi);
  if (availableKeys.includes(exact)) return exact;
  let best = availableKeys[0];
  let bestDist = Infinity;
  for (const key of availableKeys) {
    const dist = Math.abs(midiFromNoteName(key) - midi);
    const bestMidi = midiFromNoteName(best);
    if (dist < bestDist || (dist === bestDist && midiFromNoteName(key) < bestMidi)) {
      best = key;
      bestDist = dist;
    }
  }
  return best;
}
