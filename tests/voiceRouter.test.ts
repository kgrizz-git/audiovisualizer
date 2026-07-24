import { describe, it, expect } from 'vitest';
import { VoiceRouter } from '../src/audio/soundfont/voiceRouter.js';
import { TrackScore } from '../src/core/types.js';
import { VoicePlaybackSettings } from '../src/audio/midiPreviewPlayer.js';

const track = (channel: number, program: number): TrackScore => ({
  name: `ch${channel}`,
  channel,
  program,
  instrumentName: 'x',
  notes: [],
  sustainEvents: [],
});

describe('VoiceRouter', () => {
  it('applies global engine and soundbank defaults to every track', () => {
    const router = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
    const a = router.resolveTrackSettings(track(0, 0));
    const b = router.resolveTrackSettings(track(1, 32));
    expect(a.engine).toBe('sample');
    expect(a.soundbank).toBe('FluidR3_GM');
    expect(b.engine).toBe('sample');
    expect(b.program).toBe(32);
  });

  it('merges per-channel mix overrides without changing global engine', () => {
    const router = new VoiceRouter({ engine: 'sample', soundbank: 'FatBoy' });
    router.setMix(0, { timbre: 'square', gain: 0.5, muted: true, solo: false });
    const a = router.resolveTrackSettings(track(0, 0));
    expect(a.timbre).toBe('square');
    expect(a.gain).toBe(0.5);
    expect(a.muted).toBe(true);
    expect(a.engine).toBe('sample');
    expect(a.soundbank).toBe('FatBoy');
  });

  it('syncFromVoicePlayback copies mix fields by channel', () => {
    const router = new VoiceRouter({ engine: 'oscillator', soundbank: 'FluidR3_GM' });
    const map = new Map<number, VoicePlaybackSettings>([
      [1, { timbre: 'sawtooth', gain: 1.2, muted: false, solo: true }],
    ]);
    router.syncFromVoicePlayback(map);
    const b = router.resolveTrackSettings(track(1, 40));
    expect(b.timbre).toBe('sawtooth');
    expect(b.gain).toBe(1.2);
    expect(b.solo).toBe(true);
    expect(b.engine).toBe('oscillator');
  });

  it('setDefaults updates engine/bank for subsequent resolves', () => {
    const router = new VoiceRouter({ engine: 'sample', soundbank: 'MusyngKite' });
    router.setDefaults({ engine: 'oscillator', soundbank: 'FluidR3_GM' });
    expect(router.resolveTrackSettings(track(0, 0)).engine).toBe('oscillator');
  });

  it('allows overriding a track GM program', () => {
    const router = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
    router.setProgram(0, 40); // violin
    expect(router.resolveTrackSettings(track(0, 0)).program).toBe(40);
    expect(router.getProgram(0)).toBe(40);
  });

  it('clearPrograms drops overrides', () => {
    const router = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
    router.setProgram(0, 40);
    router.clearPrograms();
    expect(router.resolveTrackSettings(track(0, 0)).program).toBe(0);
  });
});
