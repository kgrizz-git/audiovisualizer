import { NoteEvent, Score } from '../core/types.js';

/** Local Web Audio audition engine; this is a preview synth, not General MIDI playback. */
export class MidiPreviewPlayer {
  private context: AudioContext | null = null;
  private activeSources: OscillatorNode[] = [];

  public async start(score: Score, offsetSeconds: number): Promise<void> {
    this.stop();
    this.context ??= new AudioContext();
    await this.context.resume();
    const now = this.context.currentTime + 0.03;
    score.tracks.forEach((track, index) => track.notes.forEach((note) => this.schedule(note, index, offsetSeconds, now)));
  }

  public stop(): void {
    this.activeSources.forEach((source) => { try { source.stop(); } catch { /* source already ended */ } });
    this.activeSources = [];
  }

  private schedule(note: NoteEvent, trackIndex: number, offset: number, now: number): void {
    if (!this.context || note.onset + note.duration <= offset) return;
    const delay = Math.max(0, note.onset - offset);
    const duration = Math.max(0.03, note.duration - Math.max(0, offset - note.onset));
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = ['sine', 'triangle', 'sawtooth', 'square'][trackIndex % 4] as OscillatorType;
    oscillator.frequency.value = 440 * 2 ** ((note.pitch - 69) / 12);
    const volume = 0.035 + (note.velocity / 127) * 0.065;
    const start = now + delay;
    const end = start + duration;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.02, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
    oscillator.onended = () => { this.activeSources = this.activeSources.filter((source) => source !== oscillator); };
    this.activeSources.push(oscillator);
  }
}
