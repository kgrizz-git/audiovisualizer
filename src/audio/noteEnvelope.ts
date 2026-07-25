/**
 * Shared ADSR amplitude envelope for oscillator and SoundFont sample playback.
 *
 * Schedules attack → decay → sustain hold until `end` → release after `end`.
 * Uses exponential ramps with a non-zero floor so Web Audio never receives 0.
 */

/** Documented default envelope timings (seconds / linear sustain multiplier). */
export const NOTE_ENVELOPE_DEFAULTS = {
  attack: 0.008,
  decay: 0.04,
  sustainLevel: 1.0,
  release: 0.08,
  floor: 0.0001,
} as const;

export interface NoteEnvelopeOptions {
  /** Absolute AudioContext time when the note begins. */
  start: number;
  /** Absolute AudioContext time when the note-off / sustain hold ends (before release). */
  end: number;
  /** Peak gain after attack (typically from {@link noteVolume}). */
  peak: number;
  attack?: number;
  decay?: number;
  sustainLevel?: number;
  release?: number;
  floor?: number;
}

/**
 * Apply a four-stage note envelope to a gain AudioParam.
 *
 * Attack and decay are scaled down when `end - start` is shorter than their sum
 * so very short notes still produce audible output.
 *
 * @returns The release duration (seconds) so callers can `source.stop(end + release + ε)`.
 */
export function applyNoteEnvelope(gainParam: AudioParam, opts: NoteEnvelopeOptions): number {
  const attack = opts.attack ?? NOTE_ENVELOPE_DEFAULTS.attack;
  const decay = opts.decay ?? NOTE_ENVELOPE_DEFAULTS.decay;
  const sustainLevel = opts.sustainLevel ?? NOTE_ENVELOPE_DEFAULTS.sustainLevel;
  const release = opts.release ?? NOTE_ENVELOPE_DEFAULTS.release;
  const floor = opts.floor ?? NOTE_ENVELOPE_DEFAULTS.floor;

  const { start, end, peak } = opts;
  const playDuration = Math.max(0, end - start);
  const peakGain = Math.max(floor, peak);
  const sustainGain = Math.max(floor, peak * sustainLevel);

  let clampedAttack = attack;
  let clampedDecay = decay;
  const adSum = attack + decay;
  if (adSum > playDuration && playDuration > 0) {
    const scale = playDuration / adSum;
    clampedAttack = attack * scale;
    clampedDecay = decay * scale;
  }

  gainParam.setValueAtTime(floor, start);

  const attackEnd = start + clampedAttack;
  if (clampedAttack > 0) {
    gainParam.exponentialRampToValueAtTime(peakGain, attackEnd);
  } else {
    gainParam.setValueAtTime(peakGain, start);
  }

  const decayEnd = attackEnd + clampedDecay;
  if (clampedDecay > 0) {
    gainParam.exponentialRampToValueAtTime(sustainGain, decayEnd);
  } else {
    gainParam.setValueAtTime(sustainGain, attackEnd);
  }

  const holdStart = Math.max(decayEnd, start);
  if (holdStart < end) {
    gainParam.setValueAtTime(sustainGain, end);
  }

  const releaseEnd = end + release;
  gainParam.exponentialRampToValueAtTime(floor, releaseEnd);

  return release;
}

/** Small post-release pad so `AudioBufferSourceNode.stop` fires after the ramp completes. */
export const NOTE_ENVELOPE_STOP_PAD = 0.002;

/**
 * Absolute AudioContext time when a source should be stopped after a note envelope.
 */
export function noteSourceStopTime(noteEnd: number, release?: number): number {
  const rel = release ?? NOTE_ENVELOPE_DEFAULTS.release;
  return noteEnd + rel + NOTE_ENVELOPE_STOP_PAD;
}
