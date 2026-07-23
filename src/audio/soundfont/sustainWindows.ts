import { NoteEvent, Score, SustainEvent } from '../../core/types.js';

export interface SustainWindow {
  start: number;
  end: number;
}

export function buildSustainWindows(events: SustainEvent[], scoreEnd: number): SustainWindow[] {
  const windows: SustainWindow[] = [];
  let openAt: number | null = null;
  const sorted = [...events].sort((a, b) => a.time - b.time);
  for (const event of sorted) {
    const down = event.value >= 64;
    if (down && openAt === null) openAt = event.time;
    if (!down && openAt !== null) {
      windows.push({ start: openAt, end: event.time });
      openAt = null;
    }
  }
  if (openAt !== null) windows.push({ start: openAt, end: scoreEnd });
  return windows;
}

export function getSustainedDuration(note: NoteEvent, windows: SustainWindow[]): number {
  const release = note.onset + note.duration;
  for (const window of windows) {
    if (window.start <= release && release <= window.end) {
      return Math.max(note.duration, window.end - note.onset);
    }
  }
  return note.duration;
}

export function sustainEventsForChannel(score: Score, channel: number): SustainEvent[] {
  const merged: SustainEvent[] = [];
  for (const track of score.tracks) {
    if (track.channel !== channel) continue;
    if (track.sustainEvents) merged.push(...track.sustainEvents);
  }
  return merged.sort((a, b) => a.time - b.time);
}