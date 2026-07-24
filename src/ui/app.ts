import { generateDemoScore, parseMidiData } from '../core/midi/parser.js';
import { DEFAULT_CONFIG, getAverageScoreBackground, mapScoreToGeometry } from '../core/mapper/scoreMapper.js';
import { fitGeometryToCanvas } from '../core/layout/fitGeometry.js';
import { CanvasRenderer } from '../renderers/canvas/canvasRenderer.js';
import { buildSvg } from '../renderers/svg/svgBuilder.js';
import { AutoZoomWindowMode, ChordLayout, GapPolicy, OriginMode, PitchHueMode, RuleConfig, Score, Variation, ViewportTransform } from '../core/types.js';
import { defaultVoiceSettings, VoicePlaybackSettings } from '../audio/midiPreviewPlayer.js';
import { SoundfontPatchLoader } from '../audio/soundfont/soundfontPatchLoader.js';
import { SoundfontPlayer } from '../audio/soundfont/soundfontPlayer.js';
import { VoiceRouter } from '../audio/soundfont/voiceRouter.js';
import { GM_INSTRUMENT_SLUGS } from '../audio/soundfont/gmInstrumentSlugs.js';
import { clearSoundfontCache, getCacheStatus, prefetchBank } from '../audio/soundfont/soundfontLibrary.js';
import { PatchStatus, PlaybackEngine, SoundbankPreset } from '../audio/soundfont/soundfontTypes.js';
import { AUTO_ZOOM_BAR_LABELS, AUTO_ZOOM_BAR_STEPS, AUTO_ZOOM_SECOND_STEPS, ViewportController } from '../core/layout/viewportController.js';
import { ViewportGestures } from './viewportGestures.js';

const PREVIEW_SIZE = 900;
const EXPORT_SIZE = 1200;
const DEFAULT_DEMO_URL = './demo-midi/bach_prelude_c_full.mid';
const DEFAULT_DEMO_TITLE = 'Bach Prelude in C · full score (2:20)';
const LIBRARY_PROMPT_FLAG = 'av-soundfont-library-prompted';

class AudioVisualizerApp {
  private currentScore: Score = generateDemoScore();
  private currentConfig: RuleConfig = { ...DEFAULT_CONFIG };
  private canvasRenderer: CanvasRenderer;
  private viewportController: ViewportController;
  private currentTime = this.currentScore.duration;
  private animationFrameId: number | null = null;
  private playbackStart = 0;
  private playbackOffset = 0;
  private isPlaying = false;
  private audioContext: AudioContext | null = null;
  private soundfontPlayer: SoundfontPlayer | null = null;
  private voiceRouter = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
  private voicePlayback = new Map<number, VoicePlaybackSettings>();
  private backgroundMode: 'black' | 'average' = 'black';
  private exportTitle: string = this.currentScore.title;
  private downloadAbort: AbortController | null = null;

  constructor() {
    this.canvasRenderer = new CanvasRenderer(this.element<HTMLCanvasElement>('visualizer-canvas'));
    this.viewportController = new ViewportController();
    new ViewportGestures(
      this.element<HTMLCanvasElement>('visualizer-canvas'),
      this.viewportController,
      PREVIEW_SIZE,
      () => this.render()
    );
    this.voicePlayback = new Map(this.currentScore.tracks.map((track, index) => [track.channel, defaultVoiceSettings(index)]));
    this.voiceRouter.syncFromVoicePlayback(this.voicePlayback);
    this.bindEvents();
    this.updateScoreUi();
    this.render();
    // Boot with the Bach prelude rather than the generative study.
    void this.loadUrl(DEFAULT_DEMO_URL, DEFAULT_DEMO_TITLE);
    void this.refreshCacheStatus();
    this.maybeShowLibraryPrompt();
  }

  private element<T extends HTMLElement>(id: string): T { return document.getElementById(id) as T; }

  private bindEvents(): void {
    const demoSelect = this.element<HTMLSelectElement>('demo-midi-select');
    demoSelect.addEventListener('change', async () => {
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
    this.select<ChordLayout>('chord-layout-select', (value) => { this.currentConfig.chordLayout = value; });
    this.element<HTMLInputElement>('interval-angle-toggle').addEventListener('change', (event) => { this.currentConfig.intervalAngleEnabled = (event.target as HTMLInputElement).checked; this.render(); });
    this.element<HTMLInputElement>('quantize-toggle').addEventListener('change', (event) => { this.currentConfig.quantizeOnset = (event.target as HTMLInputElement).checked; this.render(); });
    this.range('length-scale', 'val-length', (value) => { this.currentConfig.lengthScale = value; }, '');
    this.range('angle-scale', 'val-angle', (value) => { this.currentConfig.angleScale = value; }, '', (value) => {
      const perSemitone = value / 12;
      const semitoneLabel = Number.isInteger(perSemitone) ? String(perSemitone) : perSemitone.toFixed(2).replace(/\.?0+$/, '');
      return `${value}°/oct (${semitoneLabel}°/semitone)`;
    });
    this.range('spiral-bias', 'val-spiral', (value) => { this.currentConfig.spiralBias = value; }, '°');
    this.range('stroke-base', 'val-stroke', (value) => { this.currentConfig.strokeWidthBase = value; }, 'px');
    this.range('time-line-density', 'val-density', (value) => { this.currentConfig.timeLineDensity = value; }, '×');

    this.element<HTMLSelectElement>('playback-engine-select').addEventListener('change', (event) => {
      this.voiceRouter.setDefaults({ engine: (event.target as HTMLSelectElement).value as PlaybackEngine });
      this.updateScoreUi();
    });
    this.element<HTMLSelectElement>('playback-bank-select').addEventListener('change', (event) => {
      this.voiceRouter.setDefaults({ soundbank: (event.target as HTMLSelectElement).value as SoundbankPreset });
      this.updateScoreUi();
    });

    const scrubber = this.element<HTMLInputElement>('progress-scrubber');
    scrubber.addEventListener('input', () => { this.pause(); this.currentTime = this.currentScore.duration * Number(scrubber.value) / 1000; this.render(); });
    this.element<HTMLButtonElement>('play-btn').addEventListener('click', () => this.togglePlay());
    this.element<HTMLButtonElement>('btn-export-svg').addEventListener('click', () => this.downloadSvg(false));
    this.element<HTMLButtonElement>('btn-export-plotter').addEventListener('click', () => this.downloadSvg(true));
    this.element<HTMLButtonElement>('btn-export-png').addEventListener('click', () => this.downloadPng());

    const titleInput = this.element<HTMLInputElement>('export-title-input');
    titleInput.addEventListener('input', () => { this.exportTitle = titleInput.value; this.updateCanvasAriaLabel(); this.render(); });

    // Viewport HUD + Section 05 controls
    const center = PREVIEW_SIZE / 2;
    this.element<HTMLButtonElement>('hud-zoom-in').addEventListener('click', () => {
      const z = this.viewportController.getViewport().zoom;
      this.viewportController.zoomAt(z * 1.25, center, center, PREVIEW_SIZE, PREVIEW_SIZE);
      this.render();
    });
    this.element<HTMLButtonElement>('hud-zoom-out').addEventListener('click', () => {
      const z = this.viewportController.getViewport().zoom;
      this.viewportController.zoomAt(z / 1.25, center, center, PREVIEW_SIZE, PREVIEW_SIZE);
      this.render();
    });
    const reset = () => { this.viewportController.resetView(); this.render(); };
    this.element<HTMLButtonElement>('hud-reset').addEventListener('click', reset);
    this.element<HTMLButtonElement>('btn-reset-viewport').addEventListener('click', reset);

    const syncAuto = (enabled: boolean) => {
      this.viewportController.setAutoZoom(enabled);
      this.render();
    };
    this.element<HTMLInputElement>('hud-autozoom-toggle').addEventListener('change', (e) => {
      syncAuto((e.target as HTMLInputElement).checked);
    });
    this.element<HTMLInputElement>('viewport-autozoom-toggle').addEventListener('change', (e) => {
      syncAuto((e.target as HTMLInputElement).checked);
    });
    this.element<HTMLInputElement>('viewport-zoom-range').addEventListener('input', (e) => {
      const zoom = Number((e.target as HTMLInputElement).value);
      this.viewportController.zoomAt(zoom, center, center, PREVIEW_SIZE, PREVIEW_SIZE);
      this.render();
    });

    const modeMusical = this.element<HTMLButtonElement>('btn-mode-musical');
    const modeTime = this.element<HTMLButtonElement>('btn-mode-time');
    
    const setMode = (mode: AutoZoomWindowMode) => {
      this.viewportController.setAutoZoomMode(mode);
      this.viewportController.setAutoZoom(true);
      this.render();
    };

    modeMusical.addEventListener('click', () => setMode('musical'));
    modeTime.addEventListener('click', () => setMode('time'));

    this.range('viewport-bars-range', 'val-viewport-bars', (val) => {
      this.viewportController.setAutoZoomWindowBars(AUTO_ZOOM_BAR_STEPS[val]);
      this.viewportController.setAutoZoom(true);
    }, '', (val) => AUTO_ZOOM_BAR_LABELS[val]);

    this.range('viewport-seconds-range', 'val-viewport-seconds', (val) => {
      this.viewportController.setAutoZoomWindowSeconds(AUTO_ZOOM_SECOND_STEPS[val]);
      this.viewportController.setAutoZoom(true);
    }, '', (val) => {
      const s = AUTO_ZOOM_SECOND_STEPS[val];
      return s === Infinity ? 'Full track' : `${s}s`;
    });

    // SoundFont library management
    this.element<HTMLButtonElement>('btn-download-library').addEventListener('click', () => void this.downloadLibrary());
    this.element<HTMLButtonElement>('btn-cancel-download').addEventListener('click', () => this.downloadAbort?.abort());
    this.element<HTMLButtonElement>('btn-clear-cache').addEventListener('click', () => void this.clearLibraryCache());
    this.element<HTMLButtonElement>('btn-prompt-download').addEventListener('click', () => {
      this.dismissLibraryPrompt();
      void this.downloadLibrary();
    });
    this.element<HTMLButtonElement>('btn-prompt-dismiss').addEventListener('click', () => this.dismissLibraryPrompt());

    // Keyboard shortcuts
    window.addEventListener('keydown', (event) => {
      const t = event.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
      if (t instanceof HTMLElement && t.isContentEditable) return;
      const centerPt = PREVIEW_SIZE / 2;
      if (event.key === '+' || event.key === '=') {
        this.viewportController.zoomAt(this.viewportController.getViewport().zoom * 1.25, centerPt, centerPt, PREVIEW_SIZE, PREVIEW_SIZE);
      } else if (event.key === '-' || event.key === '_') {
        this.viewportController.zoomAt(this.viewportController.getViewport().zoom / 1.25, centerPt, centerPt, PREVIEW_SIZE, PREVIEW_SIZE);
      } else if (event.key === '0' || event.key === 'r' || event.key === 'R') {
        this.viewportController.resetView();
      } else if (event.key === 'a' || event.key === 'A') {
        this.viewportController.setAutoZoom(!this.viewportController.getViewport().autoZoom);
      } else {
        return;
      }
      this.render();
    });
  }

  private select<T extends string>(id: string, apply: (value: T) => void): void {
    this.element<HTMLSelectElement>(id).addEventListener('change', (event) => { apply((event.target as HTMLSelectElement).value as T); this.render(); });
  }
  private range(id: string, outputId: string, apply: (value: number) => void, suffix: string, format?: (value: number) => string): void {
    this.element<HTMLInputElement>(id).addEventListener('input', (event) => {
      const value = Number((event.target as HTMLInputElement).value);
      apply(value);
      this.element<HTMLOutputElement>(outputId).value = format ? format(value) : `${value}${suffix}`;
      this.render();
    });
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
  private setScore(score: Score, message: string): void {
    this.pause();
    this.currentScore = score;
    this.currentTime = score.duration;
    this.currentConfig.voiceFilter = null;
    this.voicePlayback = new Map(score.tracks.map((track, index) => [track.channel, defaultVoiceSettings(index)]));
    this.voiceRouter.clearPrograms();
    this.voiceRouter.syncFromVoicePlayback(this.voicePlayback);
    this.exportTitle = score.title;
    this.viewportController.resetView();
    this.updateScoreUi();
    this.render();
    this.setStatus(message);
  }

  private gmLabel(program: number): string {
    const slug = GM_INSTRUMENT_SLUGS[program] ?? 'acoustic_grand_piano';
    return `${program} · ${slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`;
  }

  private applyBadge(span: HTMLElement, status: PatchStatus | undefined): void {
    const map: Record<PatchStatus, string> = {
      loading: '⏳ Loading…',
      loaded: '✓ Loaded',
      fallback: '⚡ Synth Fallback',
    };
    span.textContent = status ? map[status] : '—';
  }

  private updateScoreUi(): void {
    this.element<HTMLElement>('score-title').textContent = this.currentScore.title;
    this.element<HTMLElement>('score-meta').textContent = `${this.currentScore.tracks.length} voice${this.currentScore.tracks.length === 1 ? '' : 's'} · ${this.currentScore.bpm} BPM`;
    this.element<HTMLInputElement>('export-title-input').value = this.exportTitle;
    this.updateCanvasAriaLabel();
    const options = this.element<HTMLElement>('voice-filter-options'); options.replaceChildren();
    this.currentScore.tracks.forEach((track) => {
      const label = document.createElement('label'); label.className = 'voice-chip';
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = true; input.value = String(track.channel);
      input.addEventListener('change', () => { const checked = [...options.querySelectorAll<HTMLInputElement>('input:checked')].map((node) => Number(node.value)); this.currentConfig.voiceFilter = checked.length === this.currentScore.tracks.length ? null : checked; this.render(); });
      label.append(input, document.createTextNode(track.name)); options.append(label);
    });
    const audioOptions = this.element<HTMLElement>('audio-voice-options'); audioOptions.replaceChildren();
    const engine = this.voiceRouter.getDefaults().engine;
    const statusMap = this.soundfontPlayer?.getStatusMap();

    this.currentScore.tracks.forEach((track, index) => {
      const settings = this.voicePlayback.get(track.channel) ?? defaultVoiceSettings(index);
      this.voicePlayback.set(track.channel, settings);
      const row = document.createElement('div'); row.className = 'audio-voice-row';
      const name = document.createElement('span'); name.textContent = `${track.name} · ${track.instrumentName}`;

      let timbreOrGmSelect: HTMLElement;
      let badgeSpan: HTMLSpanElement | null = null;

      if (engine === 'sample') {
        const currentProgram = this.voiceRouter.resolveTrackSettings(track).program;
        const gmSelect = document.createElement('select');
        gmSelect.setAttribute('aria-label', `${track.name} instrument`);
        GM_INSTRUMENT_SLUGS.forEach((_, pIndex) => {
          const option = new Option(this.gmLabel(pIndex), String(pIndex), false, pIndex === currentProgram);
          gmSelect.add(option);
        });
        gmSelect.addEventListener('change', () => {
          this.voiceRouter.setProgram(track.channel, Number(gmSelect.value));
          if (badgeSpan) this.applyBadge(badgeSpan, undefined);
        });
        timbreOrGmSelect = gmSelect;

        badgeSpan = document.createElement('span');
        badgeSpan.className = 'patch-badge';
        this.applyBadge(badgeSpan, statusMap?.get(track.channel));
      } else {
        const timbreSelect = document.createElement('select');
        timbreSelect.setAttribute('aria-label', `${track.name} timbre`);
        ['sine', 'triangle', 'sawtooth', 'square'].forEach((value) => {
          const option = new Option(value, value, false, settings.timbre === value);
          timbreSelect.add(option);
        });
        timbreSelect.addEventListener('change', () => {
          settings.timbre = timbreSelect.value as VoicePlaybackSettings['timbre'];
          this.voiceRouter.setMix(track.channel, settings);
        });
        timbreOrGmSelect = timbreSelect;
      }

      const gain = document.createElement('input'); gain.type = 'range'; gain.min = '0'; gain.max = '1.5'; gain.step = '0.05'; gain.value = String(settings.gain); gain.setAttribute('aria-label', `${track.name} volume`);
      gain.addEventListener('input', () => {
        settings.gain = Number(gain.value);
        this.voiceRouter.setMix(track.channel, settings);
      });
      const mute = this.createAudioToggle('M', settings.muted, `${track.name} mute`, (checked) => {
        settings.muted = checked;
        this.voiceRouter.setMix(track.channel, settings);
      });
      const solo = this.createAudioToggle('S', settings.solo, `${track.name} solo`, (checked) => {
        settings.solo = checked;
        this.voiceRouter.setMix(track.channel, settings);
      });

      if (badgeSpan) {
        row.append(name, timbreOrGmSelect, badgeSpan, gain, mute, solo);
      } else {
        row.append(name, timbreOrGmSelect, gain, mute, solo);
      }
      audioOptions.append(row);
    });
  }

  private updateCanvasAriaLabel(): void {
    const canvas = this.element<HTMLCanvasElement>('visualizer-canvas');
    const title = this.exportTitle.trim() || this.currentScore.title;
    canvas.setAttribute('aria-label', `Visual score rendering: ${title}`);
  }

  private createAudioToggle(label: string, checked: boolean, ariaLabel: string, apply: (checked: boolean) => void): HTMLLabelElement {
    const wrapper = document.createElement('label'); wrapper.className = 'audio-toggle'; wrapper.textContent = label;
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = checked; input.setAttribute('aria-label', ariaLabel); input.addEventListener('change', () => apply(input.checked)); wrapper.prepend(input); return wrapper;
  }

  private async togglePlay(): Promise<void> {
    if (this.isPlaying) { this.pause(); return; }
    if (this.currentTime >= this.currentScore.duration) this.currentTime = 0;
    try {
      this.audioContext ??= new AudioContext();
      this.soundfontPlayer ??= new SoundfontPlayer({
        loader: new SoundfontPatchLoader((bytes) => this.audioContext!.decodeAudioData(bytes.slice(0))),
      });
      this.voiceRouter.syncFromVoicePlayback(this.voicePlayback);

      if (this.voiceRouter.getDefaults().engine === 'sample') {
        const badges = this.element<HTMLElement>('audio-voice-options').querySelectorAll<HTMLElement>('.patch-badge');
        badges.forEach((span) => this.applyBadge(span, 'loading'));
      }

      await this.soundfontPlayer.start(this.currentScore, this.currentTime, {
        router: this.voiceRouter,
        context: this.audioContext,
      });

      this.updateScoreUi();

      this.isPlaying = true;
      this.playbackOffset = this.currentTime;
      this.playbackStart = performance.now();
      this.element<HTMLButtonElement>('play-btn').textContent = '❚❚';
      this.updatePlaybackStatus();
      this.tick();
    } catch {
      this.setStatus('Audio preview could not start in this browser.', true);
    }
  }

  private updatePlaybackStatus(): void {
    const engine = this.voiceRouter.getDefaults().engine;
    if (engine === 'oscillator') {
      this.setStatus('Playing (oscillator synth)');
      return;
    }
    const statusMap = this.soundfontPlayer?.getStatusMap();
    if (!statusMap || statusMap.size === 0) {
      this.setStatus('Playing MIDI preview');
      return;
    }
    let loadedCount = 0;
    let fallbackCount = 0;
    statusMap.forEach((status) => {
      if (status === 'loaded') loadedCount++;
      else if (status === 'fallback') fallbackCount++;
    });

    if (fallbackCount > 0) {
      if (loadedCount === 0) {
        this.setStatus(`Playing SoundFont — ${fallbackCount} track${fallbackCount === 1 ? '' : 's'} using synth fallback`);
      } else {
        this.setStatus(`Playing SoundFont — ${loadedCount}/${statusMap.size} patches loaded (${fallbackCount} using synth fallback)`);
      }
    } else {
      this.setStatus(`Playing SoundFont — ${loadedCount}/${statusMap.size} patches loaded`);
    }
  }

  private maybeShowLibraryPrompt(): void {
    let alreadyPrompted = false;
    try { alreadyPrompted = localStorage.getItem(LIBRARY_PROMPT_FLAG) === '1'; } catch { alreadyPrompted = false; }
    if (alreadyPrompted) return;
    const dialog = this.element<HTMLDialogElement>('library-prompt');
    if (typeof dialog.showModal === 'function') dialog.showModal();
  }

  private dismissLibraryPrompt(): void {
    try { localStorage.setItem(LIBRARY_PROMPT_FLAG, '1'); } catch { /* storage unavailable */ }
    const dialog = this.element<HTMLDialogElement>('library-prompt');
    if (dialog.open) dialog.close();
  }

  private async refreshCacheStatus(): Promise<void> {
    const label = this.element<HTMLElement>('sf-cache-status');
    const status = await getCacheStatus('FluidR3_GM');
    if (!status.available) {
      label.textContent = 'Offline cache unavailable in this browser.';
      return;
    }
    label.textContent = `SoundFont cache: ${status.cached}/${status.total} FluidR3 GM instruments stored.`;
  }

  private async downloadLibrary(): Promise<void> {
    if (this.downloadAbort) return; // a download is already running
    const downloadBtn = this.element<HTMLButtonElement>('btn-download-library');
    const cancelBtn = this.element<HTMLButtonElement>('btn-cancel-download');
    const clearBtn = this.element<HTMLButtonElement>('btn-clear-cache');
    const progress = this.element<HTMLElement>('sf-progress');
    const fill = this.element<HTMLElement>('sf-progress-fill');
    const progressLabel = this.element<HTMLElement>('sf-progress-label');

    this.downloadAbort = new AbortController();
    downloadBtn.hidden = true;
    cancelBtn.hidden = false;
    clearBtn.disabled = true;
    progress.hidden = false;

    const result = await prefetchBank('FluidR3_GM', (p) => {
      const pct = Math.round((p.done / p.total) * 100);
      fill.style.width = `${pct}%`;
      progressLabel.textContent = `${p.done}/${p.total} · ${p.slug.replace(/_/g, ' ')}`;
    }, this.downloadAbort.signal);

    this.downloadAbort = null;
    downloadBtn.hidden = false;
    cancelBtn.hidden = true;
    clearBtn.disabled = false;
    progress.hidden = true;
    fill.style.width = '0%';

    if (result.aborted) this.setStatus(`Library download cancelled (${result.ok} instruments cached).`);
    else if (result.failed > 0) this.setStatus(`Library download finished — ${result.ok} cached, ${result.failed} unavailable.`, result.ok === 0);
    else this.setStatus(`Full SoundFont library downloaded (${result.ok} instruments).`);
    await this.refreshCacheStatus();
  }

  private async clearLibraryCache(): Promise<void> {
    const cleared = await clearSoundfontCache();
    this.setStatus(cleared ? 'SoundFont cache cleared.' : 'No SoundFont cache to clear.');
    await this.refreshCacheStatus();
  }

  private pause(): void {
    this.isPlaying = false;
    this.soundfontPlayer?.stop();
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
    this.element<HTMLButtonElement>('play-btn').textContent = '▶';
  }

  private tick = (): void => {
    if (!this.isPlaying) return;
    this.currentTime = Math.min(
      this.currentScore.duration,
      this.playbackOffset + (performance.now() - this.playbackStart) / 1000
    );
    const geometry = this.geometryFor(PREVIEW_SIZE);
    this.viewportController.stepAutoZoom(geometry, this.currentTime, PREVIEW_SIZE, PREVIEW_SIZE);
    this.render();
    if (this.currentTime >= this.currentScore.duration) this.pause();
    else this.animationFrameId = requestAnimationFrame(this.tick);
  };

  private updateViewportUi(): void {
    const vp = this.viewportController.getViewport();
    const zoomRange = this.element<HTMLInputElement>('viewport-zoom-range');
    const zoomOut = this.element<HTMLOutputElement>('val-viewport-zoom');
    const hudAuto = this.element<HTMLInputElement>('hud-autozoom-toggle');
    const hudAutoLabel = this.element<HTMLElement>('hud-autozoom-label');
    const panelAuto = this.element<HTMLInputElement>('viewport-autozoom-toggle');

    if (Number(zoomRange.value) !== vp.zoom) zoomRange.value = String(vp.zoom);
    zoomOut.value = `${Math.round(vp.zoom * 100)}%`;
    if (hudAuto.checked !== vp.autoZoom) hudAuto.checked = vp.autoZoom;
    if (panelAuto.checked !== vp.autoZoom) panelAuto.checked = vp.autoZoom;

    const mode = vp.autoZoomMode ?? 'musical';
    let badgeText = 'Auto';
    
    const modeMusical = this.element<HTMLButtonElement>('btn-mode-musical');
    const modeTime = this.element<HTMLButtonElement>('btn-mode-time');
    const wrapBars = this.element<HTMLElement>('wrapper-bars-range');
    const wrapSecs = this.element<HTMLElement>('wrapper-seconds-range');

    if (mode === 'musical') {
      const bars = vp.autoZoomWindowBars ?? AUTO_ZOOM_BAR_STEPS[6];
      let idx = AUTO_ZOOM_BAR_STEPS.indexOf(bars);
      if (idx === -1) idx = AUTO_ZOOM_BAR_STEPS.length - 1; // fallback to Infinity
      
      this.element<HTMLInputElement>('viewport-bars-range').value = String(idx);
      this.element<HTMLOutputElement>('val-viewport-bars').value = AUTO_ZOOM_BAR_LABELS[idx];
      badgeText = `Auto · ${AUTO_ZOOM_BAR_LABELS[idx]}`;
    } else {
      const secs = vp.autoZoomWindowSeconds ?? AUTO_ZOOM_SECOND_STEPS[3];
      let idx = AUTO_ZOOM_SECOND_STEPS.indexOf(secs);
      if (idx === -1) idx = AUTO_ZOOM_SECOND_STEPS.length - 1;
      
      const s = AUTO_ZOOM_SECOND_STEPS[idx];
      const label = s === Infinity ? 'Full track' : `${s}s`;
      this.element<HTMLInputElement>('viewport-seconds-range').value = String(idx);
      this.element<HTMLOutputElement>('val-viewport-seconds').value = label;
      badgeText = s === Infinity ? 'Auto · Full track' : `Auto · ${label}`;
    }

    if (!vp.autoZoom) badgeText = 'Auto';
    if (hudAutoLabel.textContent !== badgeText) hudAutoLabel.textContent = badgeText;

    if (modeMusical.classList.contains('is-active') !== (mode === 'musical')) {
      modeMusical.classList.toggle('is-active', mode === 'musical');
      modeMusical.setAttribute('aria-pressed', String(mode === 'musical'));
      modeTime.classList.toggle('is-active', mode === 'time');
      modeTime.setAttribute('aria-pressed', String(mode === 'time'));
      wrapBars.classList.toggle('is-hidden', mode !== 'musical');
      wrapSecs.classList.toggle('is-hidden', mode !== 'time');
    }
  }

  private render(): void {
    const geometry = this.geometryFor(PREVIEW_SIZE);
    this.canvasRenderer.render(geometry, {
      time: this.currentTime,
      showLegend: true,
      backgroundColor: this.backgroundColor(),
      title: this.exportTitle,
      viewport: this.viewportController.getViewport()
    });
    this.element<HTMLInputElement>('progress-scrubber').value = String(
      Math.round(this.currentTime / Math.max(this.currentScore.duration, 0.01) * 1000)
    );
    this.element<HTMLOutputElement>('time-display').value =
      `${formatTime(this.currentTime)} / ${formatTime(this.currentScore.duration)}`;
    this.updateViewportUi();
  }

  private getExportViewport(size: number): ViewportTransform {
    const vp = this.viewportController.getViewport();
    const scale = size / PREVIEW_SIZE;
    return { ...vp, panX: vp.panX * scale, panY: vp.panY * scale };
  }

  private downloadSvg(plotter: boolean): void {
    const geometry = this.geometryFor(EXPORT_SIZE);
    this.download(
      new Blob([buildSvg(geometry, {
        includeLegend: !plotter,
        penPlotterMode: plotter,
        backgroundColor: this.backgroundColor(),
        title: this.exportTitle,
        includePlotterTitle: false,
        viewport: this.getExportViewport(EXPORT_SIZE)
      })], { type: 'image/svg+xml' }),
      `${this.filename()}${plotter ? '-plotter' : ''}.svg`
    );
  }

  private downloadPng(): void {
    const geometry = this.geometryFor(EXPORT_SIZE);
    this.canvasRenderer.render(geometry, {
      showLegend: true,
      backgroundColor: this.backgroundColor(),
      title: this.exportTitle,
      viewport: this.getExportViewport(EXPORT_SIZE)
    });
    this.canvasRenderer.downloadPng(`${this.filename()}.png`);
    this.render();
  }

  private geometryFor(size: number) { return fitGeometryToCanvas(mapScoreToGeometry(this.currentScore, this.currentConfig, size, size), size, size); }
  private backgroundColor(): string { return this.backgroundMode === 'average' ? getAverageScoreBackground(this.currentScore, this.currentConfig) : '#000000'; }
  private download(blob: Blob, name: string): void { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
  private filename(): string { return `${this.currentScore.title.replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '').toLowerCase()}-${this.currentConfig.variation}`; }
  private setStatus(message: string, isError = false): void { const status = this.element<HTMLElement>('app-status'); status.textContent = message; status.classList.toggle('is-error', isError); }
}

function formatTime(seconds: number): string { const whole = Math.max(0, Math.floor(seconds)); return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`; }
window.addEventListener('DOMContentLoaded', () => { new AudioVisualizerApp(); });
