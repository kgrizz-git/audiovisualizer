import { generateDemoScore, parseMidiData } from '../core/midi/parser.js';
import { DEFAULT_CONFIG, getAverageScoreBackground, mapScoreToGeometry } from '../core/mapper/scoreMapper.js';
import { fitGeometryToCanvas } from '../core/layout/fitGeometry.js';
import { CanvasRenderer } from '../renderers/canvas/canvasRenderer.js';
import { buildSvg } from '../renderers/svg/svgBuilder.js';
import { GapPolicy, OriginMode, PitchHueMode, RuleConfig, Score, Variation } from '../core/types.js';
import { defaultVoiceSettings, MidiPreviewPlayer, VoicePlaybackSettings } from '../audio/midiPreviewPlayer.js';

class AudioVisualizerApp {
  private currentScore: Score = generateDemoScore();
  private currentConfig: RuleConfig = { ...DEFAULT_CONFIG };
  private canvasRenderer: CanvasRenderer;
  private currentTime = this.currentScore.duration;
  private animationFrameId: number | null = null;
  private playbackStart = 0;
  private playbackOffset = 0;
  private isPlaying = false;
  private midiPreview = new MidiPreviewPlayer();
  private voicePlayback = new Map<number, VoicePlaybackSettings>();
  private backgroundMode: 'black' | 'average' = 'black';

  constructor() {
    this.canvasRenderer = new CanvasRenderer(this.element<HTMLCanvasElement>('visualizer-canvas'));
    this.bindEvents();
    this.updateScoreUi();
    this.render();
  }

  private element<T extends HTMLElement>(id: string): T { return document.getElementById(id) as T; }

  private bindEvents(): void {
    const demoSelect = this.element<HTMLSelectElement>('demo-midi-select');
    demoSelect.addEventListener('change', async () => {
      if (demoSelect.value === 'synthetic') { this.setScore(generateDemoScore(), 'Generative study loaded'); return; }
      await this.loadUrl(demoSelect.value, demoSelect.selectedOptions[0].text);
    });
    const sourceSelect = this.element<HTMLSelectElement>('source-midi-select');
    sourceSelect.addEventListener('change', () => { if (sourceSelect.value) window.open(sourceSelect.value, '_blank', 'noopener'); sourceSelect.value = ''; });

    const fileInput = this.element<HTMLInputElement>('midi-file-input');
    fileInput.addEventListener('change', () => { const file = fileInput.files?.[0]; if (file) void this.loadFile(file); });
    const dropzone = this.element<HTMLElement>('dropzone');
    ['dragenter', 'dragover'].forEach((name) => dropzone.addEventListener(name, (event) => { event.preventDefault(); dropzone.classList.add('is-dragging'); }));
    ['dragleave', 'drop'].forEach((name) => dropzone.addEventListener(name, (event) => { event.preventDefault(); dropzone.classList.remove('is-dragging'); }));
    dropzone.addEventListener('drop', (event) => { const file = event.dataTransfer?.files[0]; if (file) void this.loadFile(file); });
    dropzone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') fileInput.click(); });

    this.select<Variation>('variation-select', (value) => { this.currentConfig.variation = value; });
    this.select<OriginMode>('origin-select', (value) => { this.currentConfig.originMode = value; });
    this.select<PitchHueMode>('hue-mode-select', (value) => { this.currentConfig.pitchHueMode = value; });
    this.select<'black' | 'average'>('background-select', (value) => { this.backgroundMode = value; });
    this.select<GapPolicy>('gap-policy-select', (value) => { this.currentConfig.gapPolicy = value; });
    this.element<HTMLInputElement>('interval-angle-toggle').addEventListener('change', (event) => { this.currentConfig.intervalAngleEnabled = (event.target as HTMLInputElement).checked; this.render(); });
    this.element<HTMLInputElement>('quantize-toggle').addEventListener('change', (event) => { this.currentConfig.quantizeOnset = (event.target as HTMLInputElement).checked; this.render(); });
    this.range('length-scale', 'val-length', (value) => { this.currentConfig.lengthScale = value; }, '');
    this.range('angle-scale', 'val-angle', (value) => { this.currentConfig.angleScale = value; }, '°');
    this.range('stroke-base', 'val-stroke', (value) => { this.currentConfig.strokeWidthBase = value; }, 'px');
    this.range('time-line-density', 'val-density', (value) => { this.currentConfig.timeLineDensity = value; }, '×');

    const scrubber = this.element<HTMLInputElement>('progress-scrubber');
    scrubber.addEventListener('input', () => { this.pause(); this.currentTime = this.currentScore.duration * Number(scrubber.value) / 1000; this.render(); });
    this.element<HTMLButtonElement>('play-btn').addEventListener('click', () => this.togglePlay());
    this.element<HTMLButtonElement>('btn-export-svg').addEventListener('click', () => this.downloadSvg(false));
    this.element<HTMLButtonElement>('btn-export-plotter').addEventListener('click', () => this.downloadSvg(true));
    this.element<HTMLButtonElement>('btn-export-png').addEventListener('click', () => this.downloadPng());
  }

  private select<T extends string>(id: string, apply: (value: T) => void): void {
    this.element<HTMLSelectElement>(id).addEventListener('change', (event) => { apply((event.target as HTMLSelectElement).value as T); this.render(); });
  }
  private range(id: string, outputId: string, apply: (value: number) => void, suffix: string): void {
    this.element<HTMLInputElement>(id).addEventListener('input', (event) => { const value = Number((event.target as HTMLInputElement).value); apply(value); this.element<HTMLOutputElement>(outputId).value = `${value}${suffix}`; this.render(); });
  }

  private async loadUrl(url: string, title: string): Promise<void> {
    try { this.setStatus('Loading included MIDI…'); const response = await fetch(url); if (!response.ok) throw new Error(`HTTP ${response.status}`); this.setScore(parseMidiData(await response.arrayBuffer(), title), 'Included MIDI loaded'); }
    catch { this.setStatus('Could not load this MIDI. Try another score or upload a file.', true); }
  }
  private async loadFile(file: File): Promise<void> {
    if (!/\.(mid|midi)$/i.test(file.name)) { this.setStatus('Please choose a .mid or .midi file.', true); return; }
    try { this.setScore(parseMidiData(await file.arrayBuffer(), file.name), `Loaded ${file.name}`); this.element<HTMLLabelElement>('file-label').textContent = `Loaded · ${file.name}`; }
    catch { this.setStatus('That file could not be read as MIDI.', true); }
  }
  private setScore(score: Score, message: string): void { this.pause(); this.currentScore = score; this.currentTime = score.duration; this.currentConfig.voiceFilter = null; this.voicePlayback = new Map(score.tracks.map((track) => [track.channel, defaultVoiceSettings(track.program)])); this.updateScoreUi(); this.render(); this.setStatus(message); }

  private updateScoreUi(): void {
    this.element<HTMLElement>('score-title').textContent = this.currentScore.title;
    this.element<HTMLElement>('score-meta').textContent = `${this.currentScore.tracks.length} voice${this.currentScore.tracks.length === 1 ? '' : 's'} · ${this.currentScore.bpm} BPM`;
    const options = this.element<HTMLElement>('voice-filter-options'); options.replaceChildren();
    this.currentScore.tracks.forEach((track) => {
      const label = document.createElement('label'); label.className = 'voice-chip';
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = true; input.value = String(track.channel);
      input.addEventListener('change', () => { const checked = [...options.querySelectorAll<HTMLInputElement>('input:checked')].map((node) => Number(node.value)); this.currentConfig.voiceFilter = checked.length === this.currentScore.tracks.length ? null : checked; this.render(); });
      label.append(input, document.createTextNode(track.name)); options.append(label);
    });
    const audioOptions = this.element<HTMLElement>('audio-voice-options'); audioOptions.replaceChildren();
    this.currentScore.tracks.forEach((track) => {
      const settings = this.voicePlayback.get(track.channel) ?? defaultVoiceSettings(track.program);
      this.voicePlayback.set(track.channel, settings);
      const row = document.createElement('div'); row.className = 'audio-voice-row';
      const name = document.createElement('span'); name.textContent = `${track.name} · ${track.instrumentName}`;
      const timbre = document.createElement('select');
      ['sine', 'triangle', 'sawtooth', 'square'].forEach((value) => { const option = new Option(value, value, false, settings.timbre === value); timbre.add(option); });
      timbre.addEventListener('change', () => { settings.timbre = timbre.value as VoicePlaybackSettings['timbre']; });
      const gain = document.createElement('input'); gain.type = 'range'; gain.min = '0'; gain.max = '1.5'; gain.step = '0.05'; gain.value = String(settings.gain); gain.setAttribute('aria-label', `${track.name} volume`); gain.addEventListener('input', () => { settings.gain = Number(gain.value); });
      const mute = this.createAudioToggle('M', settings.muted, `${track.name} mute`, (checked) => { settings.muted = checked; });
      const solo = this.createAudioToggle('S', settings.solo, `${track.name} solo`, (checked) => { settings.solo = checked; });
      row.append(name, timbre, gain, mute, solo); audioOptions.append(row);
    });
  }

  private createAudioToggle(label: string, checked: boolean, ariaLabel: string, apply: (checked: boolean) => void): HTMLLabelElement {
    const wrapper = document.createElement('label'); wrapper.className = 'audio-toggle'; wrapper.textContent = label;
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = checked; input.setAttribute('aria-label', ariaLabel); input.addEventListener('change', () => apply(input.checked)); wrapper.prepend(input); return wrapper;
  }

  private async togglePlay(): Promise<void> {
    if (this.isPlaying) { this.pause(); return; }
    if (this.currentTime >= this.currentScore.duration) this.currentTime = 0;
    try {
      await this.midiPreview.start(this.currentScore, this.currentTime, this.voicePlayback);
      this.isPlaying = true; this.playbackOffset = this.currentTime; this.playbackStart = performance.now();
      this.element<HTMLButtonElement>('play-btn').textContent = '❚❚'; this.setStatus('Playing local synth preview'); this.tick();
    } catch { this.setStatus('Audio preview could not start in this browser.', true); }
  }
  private pause(): void { this.isPlaying = false; this.midiPreview.stop(); if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; this.element<HTMLButtonElement>('play-btn').textContent = '▶'; }
  private tick = (): void => { if (!this.isPlaying) return; this.currentTime = Math.min(this.currentScore.duration, this.playbackOffset + (performance.now() - this.playbackStart) / 1000); this.render(); if (this.currentTime >= this.currentScore.duration) this.pause(); else this.animationFrameId = requestAnimationFrame(this.tick); };

  private render(): void {
    const geometry = this.geometryFor(900);
    this.canvasRenderer.render(geometry, { time: this.currentTime, showLegend: true, backgroundColor: this.backgroundColor() });
    this.element<HTMLInputElement>('progress-scrubber').value = String(Math.round(this.currentTime / Math.max(this.currentScore.duration, 0.01) * 1000));
    this.element<HTMLOutputElement>('time-display').value = `${formatTime(this.currentTime)} / ${formatTime(this.currentScore.duration)}`;
  }
  private downloadSvg(plotter: boolean): void { const geometry = this.geometryFor(1200); this.download(new Blob([buildSvg(geometry, { includeLegend: !plotter, penPlotterMode: plotter, backgroundColor: this.backgroundColor() })], { type: 'image/svg+xml' }), `${this.filename()}${plotter ? '-plotter' : ''}.svg`); }
  private downloadPng(): void { const geometry = this.geometryFor(1200); this.canvasRenderer.render(geometry, { showLegend: true, backgroundColor: this.backgroundColor() }); this.canvasRenderer.downloadPng(`${this.filename()}.png`); this.render(); }
  private geometryFor(size: number) { return fitGeometryToCanvas(mapScoreToGeometry(this.currentScore, this.currentConfig, size, size), size, size); }
  private backgroundColor(): string { return this.backgroundMode === 'average' ? getAverageScoreBackground(this.currentScore, this.currentConfig) : '#000000'; }
  private download(blob: Blob, name: string): void { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
  private filename(): string { return `${this.currentScore.title.replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '').toLowerCase()}-${this.currentConfig.variation}`; }
  private setStatus(message: string, isError = false): void { const status = this.element<HTMLElement>('app-status'); status.textContent = message; status.classList.toggle('is-error', isError); }
}

function formatTime(seconds: number): string { const whole = Math.max(0, Math.floor(seconds)); return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`; }
window.addEventListener('DOMContentLoaded', () => { new AudioVisualizerApp(); });
