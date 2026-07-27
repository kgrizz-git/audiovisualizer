import { TrackScore } from '../core/types.js';
import { GM_INSTRUMENT_SLUGS } from '../audio/soundfont/gmInstrumentSlugs.js';
import { PatchStatus, PlaybackEngine, SoundbankPreset } from '../audio/soundfont/soundfontTypes.js';
import { VoicePlaybackSettings } from '../audio/midiPreviewPlayer.js';

export interface VoiceRowContext {
  engine: PlaybackEngine;
  soundbank: SoundbankPreset;
  statusMap?: Map<number, PatchStatus>;
  isPercussion?: (track: TrackScore) => boolean;
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
    drumkit: '🥁 Drum Kit',
    'drumkit-missing': '❌ Drum Kit Missing',
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

function createBadgeSpan(status: PatchStatus | undefined): HTMLSpanElement {
  const badgeSpan = document.createElement('span');
  badgeSpan.className = 'patch-badge';
  applyBadge(badgeSpan, status);
  return badgeSpan;
}

function createGainControl(
  track: TrackScore,
  settings: VoicePlaybackSettings,
  context: VoiceRowContext
): HTMLInputElement {
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
  return gain;
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

  let timbreOrGmSelect: HTMLElement | null = null;
  let badgeSpan: HTMLSpanElement | null = null;

  const isPercussion = context.isPercussion ? context.isPercussion(track) : Boolean(track.isPercussion);

  if (isPercussion) {
    effectiveRoute.textContent = 'Playback: Drum kit · FluidR3 Standard';
    badgeSpan = createBadgeSpan(context.statusMap?.get(track.channel));
  } else if (context.engine === 'sample') {
    const currentProgram = context.getProgram ? context.getProgram(track) : track.program;
    effectiveRoute.textContent = `Playback: ${gmLabel(currentProgram)} · ${soundbankLabel(context.soundbank)}`;
    const gmSelect = document.createElement('select');
    gmSelect.setAttribute('aria-label', `${track.name} playback instrument`);
    GM_INSTRUMENT_SLUGS.forEach((_, pIndex) => {
      gmSelect.add(new Option(gmLabel(pIndex), String(pIndex), false, pIndex === currentProgram));
    });
    gmSelect.addEventListener('change', () => {
      context.onProgramChange(track.channel, Number(gmSelect.value));
    });
    timbreOrGmSelect = gmSelect;
    badgeSpan = createBadgeSpan(context.statusMap?.get(track.channel));
  } else {
    effectiveRoute.textContent = `Playback: ${settings.timbre} oscillator`;
    const timbreSelect = document.createElement('select');
    timbreSelect.setAttribute('aria-label', `${track.name} timbre`);
    (['sine', 'triangle', 'sawtooth', 'square'] as const).forEach((value) => {
      timbreSelect.add(new Option(value, value, false, settings.timbre === value));
    });
    timbreSelect.addEventListener('change', () => {
      context.onTimbreChange(track.channel, timbreSelect.value as VoicePlaybackSettings['timbre']);
    });
    timbreOrGmSelect = timbreSelect;
  }

  const gain = createGainControl(track, settings, context);
  const mute = createAudioToggle('M', settings.muted, `${track.name} mute`, (c) => context.onMute(track.channel, c));
  const solo = createAudioToggle('S', settings.solo, `${track.name} solo`, (c) => context.onSolo(track.channel, c));

  const children: HTMLElement[] = [name, effectiveRoute];
  if (timbreOrGmSelect) children.push(timbreOrGmSelect);
  if (badgeSpan) children.push(badgeSpan);
  children.push(gain, mute, solo);
  row.append(...children);

  return row;
}
