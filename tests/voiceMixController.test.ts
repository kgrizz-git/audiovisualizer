import { describe, expect, it } from 'vitest';
import { VoiceMixController } from '../src/audio/voiceMixController.js';
import { VoicePlaybackSettings } from '../src/audio/midiPreviewPlayer.js';

function voices(...entries: Array<[number, Partial<VoicePlaybackSettings>]>): Map<number, VoicePlaybackSettings> {
  return new Map(entries.map(([channel, settings]) => [channel, {
    timbre: 'sine', gain: 1, muted: false, solo: false, ...settings,
  }]));
}

function expectNoMuteSoloCollision(mix: ReadonlyMap<number, VoicePlaybackSettings>): void {
  for (const settings of mix.values()) expect(settings.muted && settings.solo).toBe(false);
}

describe('VoiceMixController', () => {
  it('makes solo exclusive and mutes every other voice', () => {
    const controller = new VoiceMixController();
    const result = controller.setSolo(voices([0, {}], [1, {}], [2, {}]), 1, true);

    expect(result.get(0)).toMatchObject({ muted: true, solo: false });
    expect(result.get(1)).toMatchObject({ muted: false, solo: true });
    expect(result.get(2)).toMatchObject({ muted: true, solo: false });
    expectNoMuteSoloCollision(result);
  });

  it('restores only mutes that solo introduced when solo is turned off', () => {
    const controller = new VoiceMixController();
    const initial = voices([0, { muted: true }], [1, {}], [2, {}]);
    const soloed = controller.setSolo(initial, 1, true);
    const restored = controller.setSolo(soloed, 1, false);

    expect(restored.get(0)).toMatchObject({ muted: true, solo: false });
    expect(restored.get(1)).toMatchObject({ muted: false, solo: false });
    expect(restored.get(2)).toMatchObject({ muted: false, solo: false });
    expectNoMuteSoloCollision(restored);
  });

  it('clears solo before muting its voice, so one voice can never be both muted and soloed', () => {
    const controller = new VoiceMixController();
    const soloed = controller.setSolo(voices([0, {}], [1, {}]), 0, true);
    const muted = controller.setMuted(soloed, 0, true);

    expect(muted.get(0)).toMatchObject({ muted: true, solo: false });
    expect(muted.get(1)).toMatchObject({ muted: false, solo: false });
    expectNoMuteSoloCollision(muted);
  });

  it('exits solo mode when another voice is explicitly unmuted', () => {
    const controller = new VoiceMixController();
    const soloed = controller.setSolo(voices([0, {}], [1, {}]), 0, true);
    const unmuted = controller.setMuted(soloed, 1, false);

    expect(unmuted.get(0)).toMatchObject({ muted: false, solo: false });
    expect(unmuted.get(1)).toMatchObject({ muted: false, solo: false });
    expectNoMuteSoloCollision(unmuted);
  });
});
