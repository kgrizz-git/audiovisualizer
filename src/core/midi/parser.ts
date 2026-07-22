import { Midi } from '@tonejs/midi';
import { Score, NoteEvent, TrackScore } from '../types.js';

/**
 * Parses binary MIDI data into a normalized Score object.
 */
export function parseMidiData(arrayBuffer: ArrayBuffer, fileName: string = 'Untitled Score'): Score {
  const midi = new Midi(arrayBuffer);

  let maxDuration = 0;
  const tracks: TrackScore[] = [];

  midi.tracks.forEach((track, trackIdx) => {
    if (track.notes.length === 0) return;

    const notes: NoteEvent[] = track.notes.map((n, noteIdx) => {
      const duration = Math.max(0.01, n.duration);
      const endTime = n.time + duration;
      if (endTime > maxDuration) {
        maxDuration = endTime;
      }

      return {
        id: `t${trackIdx}-n${noteIdx}`,
        pitch: n.midi,
        onset: n.time,
        duration: duration,
        velocity: Math.round(n.velocity * 127),
        voice: track.channel ?? trackIdx,
        pitchClass: n.midi % 12,
      };
    });

    // Sort notes chronologically by onset time
    notes.sort((a, b) => a.onset - b.onset);

    tracks.push({
      name: track.name || `Track ${trackIdx + 1}`,
      channel: track.channel ?? trackIdx,
      notes,
    });
  });

  const bpm = midi.header.tempos.length > 0 ? Math.round(midi.header.tempos[0].bpm) : 120;

  return {
    title: midi.header.name || fileName,
    duration: maxDuration > 0 ? maxDuration : 10,
    bpm,
    tracks,
  };
}

/**
 * Generates a synthetic multi-track demo score for initial UI previews without needing an external MIDI file.
 */
export function generateDemoScore(): Score {
  const pitchScale = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76]; // C major scale
  const bassScale = [36, 41, 43, 45, 48];

  const leadNotes: NoteEvent[] = [];
  let currentTime = 0;
  for (let i = 0; i < 24; i++) {
    const pitch = pitchScale[i % pitchScale.length];
    const duration = 0.25 + (i % 3) * 0.25;
    leadNotes.push({
      id: `lead-${i}`,
      pitch,
      onset: currentTime,
      duration,
      velocity: 85 + (i % 5) * 8,
      voice: 0,
      pitchClass: pitch % 12,
    });
    currentTime += duration + 0.05;
  }

  const bassNotes: NoteEvent[] = [];
  let bassTime = 0;
  for (let i = 0; i < 12; i++) {
    const pitch = bassScale[i % bassScale.length];
    const duration = 0.8;
    bassNotes.push({
      id: `bass-${i}`,
      pitch,
      onset: bassTime,
      duration,
      velocity: 100,
      voice: 1,
      pitchClass: pitch % 12,
    });
    bassTime += duration + 0.1;
  }

  return {
    title: 'Demo Score (Synthesized)',
    duration: Math.max(currentTime, bassTime),
    bpm: 120,
    tracks: [
      { name: 'Melody (Channel 1)', channel: 0, notes: leadNotes },
      { name: 'Bass (Channel 2)', channel: 1, notes: bassNotes },
    ],
  };
}
