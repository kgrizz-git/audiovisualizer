import { VoicePlaybackSettings } from './midiPreviewPlayer.js';

/**
 * Applies the UI's exclusive solo/mute rules without losing mutes the listener
 * set before entering solo mode.
 */
export class VoiceMixController {
  private mutedForSolo = new Set<number>();

  reset(): void {
    this.mutedForSolo.clear();
  }

  setMuted(
    voices: ReadonlyMap<number, VoicePlaybackSettings>,
    channel: number,
    muted: boolean,
  ): Map<number, VoicePlaybackSettings> {
    const next = copyVoices(voices);
    const current = next.get(channel);
    if (!current) return next;

    // Muting the solo voice exits solo mode first, restoring only the voices
    // that were muted as a consequence of that solo.
    if (muted && current.solo) this.clearSolo(next);

    // Unmuting a different voice is an explicit request to hear it, so it also
    // exits solo mode rather than leaving a visually unmuted but inaudible row.
    if (!muted && [...next.entries()].some(([other, settings]) => other !== channel && settings.solo)) {
      this.clearSolo(next);
    }

    const target = next.get(channel);
    if (target) next.set(channel, { ...target, muted, solo: muted ? false : target.solo });
    return next;
  }

  setSolo(
    voices: ReadonlyMap<number, VoicePlaybackSettings>,
    channel: number,
    solo: boolean,
  ): Map<number, VoicePlaybackSettings> {
    const next = copyVoices(voices);
    if (!next.has(channel)) return next;

    if (!solo) {
      const target = next.get(channel);
      if (target) next.set(channel, { ...target, solo: false });
      this.restoreSoloMutes(next);
      return next;
    }

    // A new solo replaces any existing one and restores its temporary mutes
    // before capturing the new pre-solo mute state.
    this.clearSolo(next);
    for (const [other, settings] of next) {
      if (other === channel) {
        next.set(other, { ...settings, muted: false, solo: true });
      } else {
        if (!settings.muted) this.mutedForSolo.add(other);
        next.set(other, { ...settings, muted: true, solo: false });
      }
    }
    return next;
  }

  private clearSolo(voices: Map<number, VoicePlaybackSettings>): void {
    for (const [channel, settings] of voices) {
      if (settings.solo) voices.set(channel, { ...settings, solo: false });
    }
    this.restoreSoloMutes(voices);
  }

  private restoreSoloMutes(voices: Map<number, VoicePlaybackSettings>): void {
    for (const channel of this.mutedForSolo) {
      const settings = voices.get(channel);
      if (settings) voices.set(channel, { ...settings, muted: false, solo: false });
    }
    this.mutedForSolo.clear();
  }
}

function copyVoices(voices: ReadonlyMap<number, VoicePlaybackSettings>): Map<number, VoicePlaybackSettings> {
  return new Map([...voices.entries()].map(([channel, settings]) => [channel, { ...settings }]));
}
