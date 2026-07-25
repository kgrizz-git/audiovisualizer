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

/**
 * Playback end time for audio scheduling and playhead completion.
 *
 * Extends visual {@link Score.duration} (last note-off) when sustain-pedal events or
 * CC64-held notes ring past the last written note-off. Visual mapper duration is unchanged.
 */
export function playbackEndTime(score: Score): number {
  let end = score.duration;

  for (const track of score.tracks) {
    for (const event of track.sustainEvents ?? []) {
      end = Math.max(end, event.time);
    }
  }

  const channels = new Set(score.tracks.map((track) => track.channel));
  for (const channel of channels) {
    const windows = buildSustainWindows(sustainEventsForChannel(score, channel), end);
    for (const track of score.tracks) {
      if (track.channel !== channel) continue;
      for (const note of track.notes) {
        const sustained = getSustainedDuration(note, windows);
        end = Math.max(end, note.onset + sustained);
      }
    }
  }

  return end;
}