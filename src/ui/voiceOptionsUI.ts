import { TrackScore } from '../core/types.js';
import { GM_INSTRUMENT_SLUGS } from '../audio/soundfont/gmInstrumentSlugs.js';
import { PatchStatus, PlaybackEngine, SoundbankPreset } from '../audio/soundfont/soundfontTypes.js';
import { VoicePlaybackSettings } from '../audio/midiPreviewPlayer.js';

export interface VoiceRowContext {
  engine: PlaybackEngine;
  soundbank: SoundbankPreset;
  statusMap?: Map<number, PatchStatus>;
  getProgram?: (track: TrackScore) => number;
  onProgramChange(channel: number, program: number): void;
  onTimbreChange(channel: number, timbre: VoicePlaybackSettings['timbre']): void;
  onGainInput?(channel: number, gain: number): void;
  onMixChange(channel: number, settings: VoicePlaybackSettings): void;
  onMute(channel: number, muted: boolean): void;
  onSolo(channel: number, solo: boolean): void;
}

export function gmLabel(program: number): string {
  const slug = GM_INSTRUMENT_SLUGS[program] ?? 'acoustic_grand_piano';
  return `${program} · ${slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`;
}

export function applyBadge(span: HTMLElement, status: PatchStatus | undefined): void {
  const map: Record<PatchStatus, string> = {
    loading: '⏳ Loading sample…',
    loaded: '✓ Sample loaded',
    fallback: '⚡ Synth Fallback',
  };
  span.textContent = status ? map[status] : '—';
}

export function soundbankLabel(soundbank: SoundbankPreset): string {
  return {
    FluidR3_GM: 'FluidR3 GM',
    MusyngKite: 'MusyngKite',
    FatBoy: 'FatBoy',
  }[soundbank];
}

function createAudioToggle(
  label: string,
  checked: boolean,
  ariaLabel: string,
  apply: (checked: boolean) => void
): HTMLLabelElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'audio-toggle';
  wrapper.textContent = label;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.setAttribute('aria-label', ariaLabel);
  input.addEventListener('change', () => apply(input.checked));
  wrapper.prepend(input);
  return wrapper;
}

export function buildAudioVoiceRow(
  track: TrackScore,
  _index: number,
  settings: VoicePlaybackSettings,
  context: VoiceRowContext
): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'audio-voice-row';

  const name = document.createElement('span');
  name.className = 'voice-source-label';
  name.textContent = `${track.name} · MIDI: ${track.instrumentName}`;

  const effectiveRoute = document.createElement('span');
  effectiveRoute.className = 'voice-effective-route';

  let timbreOrGmSelect: HTMLElement;
  let badgeSpan: HTMLSpanElement | null = null;

  if (context.engine === 'sample') {
    const currentProgram = context.getProgram ? context.getProgram(track) : track.program;
    effectiveRoute.textContent = `Playback: ${gmLabel(currentProgram)} · ${soundbankLabel(context.soundbank)}`;
    const gmSelect = document.createElement('select');
    gmSelect.setAttribute('aria-label', `${track.name} playback instrument`);
    GM_INSTRUMENT_SLUGS.forEach((_, pIndex) => {
      const option = new Option(gmLabel(pIndex), String(pIndex), false, pIndex === currentProgram);
      gmSelect.add(option);
    });
    gmSelect.addEventListener('change', () => {
      context.onProgramChange(track.channel, Number(gmSelect.value));
    });
    timbreOrGmSelect = gmSelect;

    badgeSpan = document.createElement('span');
    badgeSpan.className = 'patch-badge';
    applyBadge(badgeSpan, context.statusMap?.get(track.channel));
  } else {
    effectiveRoute.textContent = `Playback: ${settings.timbre} oscillator`;
    const timbreSelect = document.createElement('select');
    timbreSelect.setAttribute('aria-label', `${track.name} timbre`);
    (['sine', 'triangle', 'sawtooth', 'square'] as const).forEach((value) => {
      const option = new Option(value, value, false, settings.timbre === value);
      timbreSelect.add(option);
    });
    timbreSelect.addEventListener('change', () => {
      context.onTimbreChange(track.channel, timbreSelect.value as VoicePlaybackSettings['timbre']);
    });
    timbreOrGmSelect = timbreSelect;
  }

  const gain = document.createElement('input');
  gain.type = 'range';
  gain.min = '0';
  gain.max = '1.5';
  gain.step = '0.05';
  gain.value = String(settings.gain);
  gain.setAttribute('aria-label', `${track.name} volume`);

  gain.addEventListener('input', () => {
    const newGain = Number(gain.value);
    if (context.onGainInput) {
      context.onGainInput(track.channel, newGain);
    } else {
      settings.gain = newGain;
      context.onMixChange(track.channel, settings);
    }
  });
  gain.addEventListener('change', () => {
    settings.gain = Number(gain.value);
    context.onMixChange(track.channel, settings);
  });

  const mute = createAudioToggle('M', settings.muted, `${track.name} mute`, (checked) => {
    context.onMute(track.channel, checked);
  });
  const solo = createAudioToggle('S', settings.solo, `${track.name} solo`, (checked) => {
    context.onSolo(track.channel, checked);
  });

  if (badgeSpan) {
    row.append(name, effectiveRoute, timbreOrGmSelect, badgeSpan, gain, mute, solo);
  } else {
    row.append(name, effectiveRoute, timbreOrGmSelect, gain, mute, solo);
  }

  return row;
}
