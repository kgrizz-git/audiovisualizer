/**
 * Shared per-note style helpers driven by RuleConfig visual options.
 *
 * Lives outside scoreMapper.ts so that both scoreMapper.ts and polyphonicLines.ts
 * (which scoreMapper imports) can share one implementation without a circular import.
 * Pure and deterministic: same note + config → identical output.
 */
import { NoteEvent, RuleConfig } from '../types.js';

/**
 * Visual sounding time in seconds. With `lengthProportionalTo: 'velocity'` the raw
 * duration is scaled by velocity/127 and floored at `velocityLengthMin` seconds so
 * very quiet notes never collapse to invisibility; otherwise the raw duration.
 */
export function getVisualDuration(note: NoteEvent, config: RuleConfig): number {
  if (config.lengthProportionalTo !== 'velocity') return note.duration;
  return Math.max(config.velocityLengthMin, (note.velocity / 127) * note.duration);
}

/** Stroke width for a note: velocity-scaled by default, or flat base width when constantStrokeWidth is set. */
export function getStrokeWidth(note: NoteEvent, config: RuleConfig): number {
  if (config.constantStrokeWidth) return config.strokeWidthBase;
  return config.strokeWidthBase + (note.velocity / 127) * config.strokeWidthScale;
}

/**
 * Rewrites the saturation of an `hsl(h, s%, l%)` color so it tracks velocity:
 * velocity 0 → 45%, velocity 127 → 100% (the default 85% corresponds to ~92).
 * Non-HSL colors (gap ghosts, hex accents) pass through unchanged.
 */
export function modulateColorByVelocity(color: string, velocity: number): string {
  const match = color.match(/^hsl\((-?[\d.]+), ([\d.]+)%, ([\d.]+)%\)$/);
  if (!match) return color;
  const saturation = Math.round(45 + (Math.min(127, Math.max(0, velocity)) / 127) * 55);
  return `hsl(${match[1]}, ${saturation}%, ${match[3]}%)`;
}
