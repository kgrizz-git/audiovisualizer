// policy:file-size allow=930 reason=browser controller intentionally owns the tightly coupled control, playback, and render lifecycle
import { generateDemoScore, parseMidiData } from '../core/midi/parser.js';
import { DEFAULT_CONFIG, getAverageScoreBackground, getDominantScoreAccent, getRadialSpokeAutoScale, mapScoreToGeometry } from '../core/mapper/scoreMapper.js';
import { fitGeometryToCanvas } from '../core/layout/fitGeometry.js';
import { CanvasRenderer } from '../renderers/canvas/canvasRenderer.js';
import { buildSvg } from '../renderers/svg/svgBuilder.js';
import { AutoZoomWindowMode, CameraPreset3D, ChordLayout, DEFAULT_VIEWPORT_3D, GapPolicy, is3DVariation, LengthBasis, OriginMode, PitchHueMode, PlaybackCue3D, RuleConfig, Score, Variation, ViewportTransform, ViewportTransform3D } from '../core/types.js';
import { map3DGeometry } from '../core/mapper/map3d.js';
import type { I3DRenderer } from '../renderers/three/I3DRenderer.js';
import { defaultVoiceSettings, VoicePlaybackSettings } from '../audio/midiPreviewPlayer.js';
import { noteSourceStopTime } from '../audio/noteEnvelope.js';
import { playbackEndTime } from '../audio/soundfont/sustainWindows.js';
import { VoiceMixController } from '../audio/voiceMixController.js';
import { SoundfontPatchLoader } from '../audio/soundfont/soundfontPatchLoader.js';
import { SoundfontPlayer } from '../audio/soundfont/soundfontPlayer.js';
import { VoiceRouter } from '../audio/soundfont/voiceRouter.js';
import { PlaybackEngine, SoundbankPreset } from '../audio/soundfont/soundfontTypes.js';
import { AUTO_ZOOM_BAR_LABELS, AUTO_ZOOM_BAR_STEPS, AUTO_ZOOM_SECOND_STEPS, ViewportController } from '../core/layout/viewportController.js';
import { ViewportGestures } from './viewportGestures.js';
import { clearLibraryCache, dismissLibraryPrompt, downloadLibrary, LibraryUIContext, maybeShowLibraryPrompt, refreshCacheStatus } from './soundfontLibraryUI.js';
import { applyBadge, buildAudioVoiceRow, VoiceRowContext } from './voiceOptionsUI.js';
import { VARIATIONS, pickRandom, randomVisualOptions } from './launchRandomizer.js';
import { getLegendContent, getRuleCaption } from '../core/legend/legendContent.js';
import { isControlApplicable, StudioControlKey } from './controlApplicability.js';
import { initializeGeometryPicker, updateGeometryPicker } from './geometryPickerUI.js';
import { ConfigHistory, saveConfig } from './configPersistence.js';
import { copyConfigLink, restoreInitialConfig, storage, syncConfigControls } from './configSessionUI.js';

const PREVIEW_SIZE = 900;
const EXPORT_SIZE = 1200;

export class AudioVisualizerApp {
  private currentScore: Score = generateDemoScore();
  private currentConfig: RuleConfig = { ...DEFAULT_CONFIG };
  private canvasRenderer: CanvasRenderer;
  private viewportController: ViewportController;
  private currentTime = this.currentScore.duration;
  private animationFrameId: number | null = null;
  private playbackStart = 0;
  private playbackOffset = 0;
  private isPlaying = false;
  private wasPlayingBeforeScrub = false;
  private audioContext: AudioContext | null = null;
  private soundfontPlayer: SoundfontPlayer | null = null;
  private voiceRouter = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
  private voicePlayback = new Map<number, VoicePlaybackSettings>();
  private voiceMixController = new VoiceMixController();
  private backgroundMode: 'black' | 'average' = 'black';
  private exportTitle: string = this.currentScore.title;
  private downloadAbort: AbortController | null = null;
  private threeRenderer: I3DRenderer | null = null;
  private viewport3d: ViewportTransform3D = { ...DEFAULT_VIEWPORT_3D };
  /** Preview-only: SVG/PNG exports still include the legend; plotter omits it. */
  private legendVisible = true;
  private configHistory = new ConfigHistory();

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
    const variationSelect = this.element<HTMLSelectElement>('variation-select');
    initializeGeometryPicker(variationSelect, this.element<HTMLElement>('geometry-picker'), (variation) => {
      variationSelect.value = variation;
      variationSelect.dispatchEvent(new Event('change'));
    });

    const demoSelect = this.element<HTMLSelectElement>('demo-midi-select');
    let initialMidiUrl = '';
    let initialMidiTitle = '';
    let randomVariation: Variation = 'lines';

    if (demoSelect.options.length > 0) {
      const demoOptions = Array.from(demoSelect.options).map((opt) => ({
        url: opt.value,
        title: opt.text,
      }));
      randomVariation = pickRandom(VARIATIONS, Math.random);
      const randomDemo = pickRandom(demoOptions, Math.random);
      initialMidiUrl = randomDemo.url;
      initialMidiTitle = randomDemo.title;

      demoSelect.value = initialMidiUrl;
    }

    const restored = restoreInitialConfig();
    if (restored) this.currentConfig = restored;
    else {
      this.currentConfig.variation = randomVariation;
      Object.assign(this.currentConfig, randomVisualOptions(Math.random));
    }
    syncConfigControls((id) => this.element(id), this.currentConfig);

    this.updateCanvasMode();
    this.updateScoreUi();
    this.render();

    if (initialMidiUrl) {
      void this.loadUrl(initialMidiUrl, initialMidiTitle);
    }
    void this.refreshCacheStatus();
    this.maybeShowLibraryPrompt();
  }

  private element<T extends HTMLElement>(id: string): T { return document.getElementById(id) as T; }

  private bindEvents(): void {
    const controlGroups = Array.from(document.querySelectorAll<HTMLDetailsElement>('.sidebar > details.control-group'));
    this.element<HTMLButtonElement>('btn-expand-sections').addEventListener('click', () => {
      controlGroups.forEach((group) => { group.open = true; });
    });
    this.element<HTMLButtonElement>('btn-collapse-sections').addEventListener('click', () => {
      controlGroups.forEach((group) => { group.open = false; });
    });

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

    this.select<Variation>('variation-select', (value) => { this.currentConfig.variation = value; this.updateCanvasMode(); });

    this.select<CameraPreset3D>('camera-preset-select', (value) => { this.viewport3d = { ...this.viewport3d, preset: value }; });
    this.range('zscale-range', 'val-zscale', (value) => { this.currentConfig.zScale = value; }, '');
    this.range('bloom-range', 'val-bloom', (value) => { this.viewport3d = { ...this.viewport3d, bloom: value }; }, '');
    this.select<PlaybackCue3D>('playback-cue-select', (value) => { this.viewport3d = { ...this.viewport3d, playbackCue: value }; });
    this.element<HTMLInputElement>('threed-autofollow-toggle').addEventListener('change', (event) => {
      this.viewport3d = { ...this.viewport3d, autoFollow: (event.target as HTMLInputElement).checked };
      this.render();
    });
    this.element<HTMLInputElement>('threed-chase-toggle').addEventListener('change', (event) => {
      this.viewport3d = { ...this.viewport3d, chaseCamera: (event.target as HTMLInputElement).checked };
      this.render();
    });
    this.element<HTMLInputElement>('threed-rotate-toggle').addEventListener('change', (event) => {
      this.viewport3d = { ...this.viewport3d, autoRotate: (event.target as HTMLInputElement).checked };
      this.render();
      if (!this.isPlaying && this.viewport3d.autoRotate && is3DVariation(this.currentConfig.variation)) {
        if (this.animationFrameId === null) {
          this.animationFrameId = requestAnimationFrame(this.tick);
        }
      }
    });
    this.select<OriginMode>('origin-select', (value) => { this.currentConfig.originMode = value; });
    this.select<PitchHueMode>('hue-mode-select', (value) => { this.currentConfig.pitchHueMode = value; });
    this.range('transpose-range', 'val-transpose', (value) => { this.currentConfig.transposeSemitones = value; }, ' st');
    this.select<'black' | 'average'>('background-select', (value) => { this.backgroundMode = value; });
    this.select<GapPolicy>('gap-policy-select', (value) => { this.currentConfig.gapPolicy = value; });
    this.select<ChordLayout>('chord-layout-select', (value) => { this.currentConfig.chordLayout = value; });
    this.element<HTMLInputElement>('interval-angle-toggle').addEventListener('change', (event) => { this.currentConfig.intervalAngleEnabled = (event.target as HTMLInputElement).checked; this.render(); });
    this.element<HTMLInputElement>('quantize-toggle').addEventListener('change', (event) => { this.currentConfig.quantizeOnset = (event.target as HTMLInputElement).checked; this.render(); });
    this.element<HTMLInputElement>('velocity-glow-toggle').addEventListener('change', (event) => { this.currentConfig.velocityGlow = (event.target as HTMLInputElement).checked; this.render(); });
    this.element<HTMLInputElement>('velocity-opacity-toggle').addEventListener('change', (event) => { this.currentConfig.velocityOpacity = (event.target as HTMLInputElement).checked; this.render(); });
    this.element<HTMLInputElement>('constant-stroke-toggle').addEventListener('change', (event) => { this.currentConfig.constantStrokeWidth = (event.target as HTMLInputElement).checked; this.render(); });
    this.element<HTMLInputElement>('ring-flash-toggle').addEventListener('change', (event) => { this.currentConfig.ringFlashes3D = (event.target as HTMLInputElement).checked; this.render(); });
    this.select<LengthBasis>('length-source-select', (value) => { this.currentConfig.lengthProportionalTo = value; });
    this.range('length-scale', 'val-length', (value) => { this.currentConfig.lengthScale = value; }, '');
    this.range('radial-spoke-scale', 'val-radial-spoke-scale', (value) => {
      this.currentConfig.radialSpokeScale = value;
    }, '', () => this.radialSpokeScaleLabel());
    this.range('angle-scale', 'val-angle', (value) => { this.currentConfig.angleScale = value; }, '', (value) => {
      const perSemitone = value / 12;
      const semitoneLabel = Number.isInteger(perSemitone) ? String(perSemitone) : perSemitone.toFixed(2).replace(/\.?0+$/, '');
      return `${value}°/oct (${semitoneLabel}°/semitone)`;
    });
    this.range('spiral-bias', 'val-spiral', (value) => { this.currentConfig.spiralBias = value; }, '°');
    this.range('stroke-base', 'val-stroke', (value) => { this.currentConfig.strokeWidthBase = value; }, 'px');
    this.range('time-line-density', 'val-density', (value) => { this.currentConfig.timeLineDensity = value; }, '×');

    const summaryDialog = this.element<HTMLDialogElement>('summary-dialog');
    this.element<HTMLButtonElement>('btn-summary').addEventListener('click', () => {
      this.updateSummaryDialog();
      if (typeof summaryDialog.showModal === 'function') summaryDialog.showModal();
    });
    this.element<HTMLButtonElement>('btn-summary-close').addEventListener('click', () => summaryDialog.close());
    summaryDialog.addEventListener('cancel', (event) => { event.preventDefault(); summaryDialog.close(); });
    summaryDialog.addEventListener('click', (event) => { if (event.target === summaryDialog) summaryDialog.close(); });
    const shortcutsDialog = this.element<HTMLDialogElement>('shortcuts-dialog');
    this.element<HTMLButtonElement>('btn-shortcuts-close').addEventListener('click', () => shortcutsDialog.close());
    shortcutsDialog.addEventListener('cancel', (event) => { event.preventDefault(); shortcutsDialog.close(); });
    shortcutsDialog.addEventListener('click', (event) => { if (event.target === shortcutsDialog) shortcutsDialog.close(); });

    this.element<HTMLSelectElement>('playback-engine-select').addEventListener('change', (event) => {
      this.voiceRouter.setDefaults({ engine: (event.target as HTMLSelectElement).value as PlaybackEngine });
      void this.applyVoiceRoutingChange();
    });
    this.element<HTMLSelectElement>('playback-bank-select').addEventListener('change', (event) => {
      this.voiceRouter.setDefaults({ soundbank: (event.target as HTMLSelectElement).value as SoundbankPreset });
      void this.applyVoiceRoutingChange();
    });

    const scrubber = this.element<HTMLInputElement>('progress-scrubber');
    scrubber.addEventListener('input', () => {
      // Pause while the user drags so the tick loop cannot fight the scrubber,
      // but remember whether playback was active so 'change' can resume it.
      if (this.isPlaying) this.wasPlayingBeforeScrub = true;
      this.pause();
      this.currentTime = this.currentScore.duration * Number(scrubber.value) / 1000;
      this.render();
    });
    scrubber.addEventListener('change', () => {
      if (!this.wasPlayingBeforeScrub) return;
      this.wasPlayingBeforeScrub = false;
      void this.startPlayback();
    });
    this.element<HTMLButtonElement>('play-btn').addEventListener('click', () => this.togglePlay());
    this.element<HTMLButtonElement>('btn-export-svg').addEventListener('click', () => this.downloadSvg(false));
    this.element<HTMLButtonElement>('btn-export-plotter').addEventListener('click', () => this.downloadSvg(true));
    this.element<HTMLButtonElement>('btn-export-png').addEventListener('click', () => this.downloadPng());
    this.element<HTMLButtonElement>('btn-export-webm').addEventListener('click', () => void this.downloadWebM3D());
    this.element<HTMLButtonElement>('btn-copy-config-link').addEventListener('click', () => void this.copyConfigLink());

    const titleInput = this.element<HTMLInputElement>('export-title-input');
    titleInput.addEventListener('input', () => { this.exportTitle = titleInput.value; this.updateCanvasAriaLabel(); this.render(); });

    // Viewport HUD framing controls
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
    this.element<HTMLButtonElement>('hud-legend-toggle').addEventListener('click', () => this.setLegendVisible(!this.legendVisible));
    const framingToggle = this.element<HTMLButtonElement>('hud-framing-toggle');
    const framingPanel = this.element<HTMLElement>('hud-framing-panel');
    framingToggle.addEventListener('click', () => {
      const expanded = framingPanel.classList.toggle('is-hidden') === false;
      framingToggle.classList.toggle('is-active', expanded);
      framingToggle.setAttribute('aria-expanded', String(expanded));
    });

    const syncAuto = (enabled: boolean) => {
      this.viewportController.setAutoZoom(enabled);
      this.render();
    };
    this.element<HTMLInputElement>('hud-autozoom-toggle').addEventListener('change', (e) => {
      syncAuto((e.target as HTMLInputElement).checked);
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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        this.applyHistory(event.shiftKey ? this.configHistory.redo() : this.configHistory.undo());
        return;
      }
      const t = event.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
      if (t instanceof HTMLElement && t.isContentEditable) return;
      if (event.key === '?') {
        if (typeof shortcutsDialog.showModal === 'function') shortcutsDialog.showModal();
        return;
      }
      if (this.handleViewportShortcut(event.key)) this.render();
    });
  }

  /** Applies zoom/reset/auto/legend shortcuts. Returns true when a shortcut matched. */
  private handleViewportShortcut(key: string): boolean {
    const centerPt = PREVIEW_SIZE / 2;
    if (key === '+' || key === '=') {
      this.viewportController.zoomAt(this.viewportController.getViewport().zoom * 1.25, centerPt, centerPt, PREVIEW_SIZE, PREVIEW_SIZE);
      return true;
    }
    if (key === '-' || key === '_') {
      this.viewportController.zoomAt(this.viewportController.getViewport().zoom / 1.25, centerPt, centerPt, PREVIEW_SIZE, PREVIEW_SIZE);
      return true;
    }
    if (key === '0' || key === 'r' || key === 'R') {
      this.viewportController.resetView();
      return true;
    }
    if (key === 'a' || key === 'A') {
      this.viewportController.setAutoZoom(!this.viewportController.getViewport().autoZoom);
      return true;
    }
    if (key === 'l' || key === 'L') {
      this.setLegendVisible(!this.legendVisible);
      return false; // setLegendVisible already re-renders
    }
    return false;
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
    this.voiceMixController.reset();
    this.voiceRouter.clearPrograms();
    this.voiceRouter.syncFromVoicePlayback(this.voicePlayback);
    this.exportTitle = score.title;
    this.viewportController.resetView();
    this.updateScoreUi();
    this.render();
    this.setStatus(message);
  }

  private applyHistory(config: RuleConfig | null): void { if (config) { this.currentConfig = config; syncConfigControls((id) => this.element(id), config); this.updateCanvasMode(); this.render(); } }

  private updateScoreUi(): void {
    this.element<HTMLElement>('score-title').textContent = this.currentScore.title;
    this.element<HTMLElement>('score-meta').textContent = `${this.currentScore.tracks.length} voice${this.currentScore.tracks.length === 1 ? '' : 's'} · ${this.currentScore.bpm} BPM`;
    this.updateGroupBadges();
    this.updateControlApplicability();
    this.element<HTMLInputElement>('export-title-input').value = this.exportTitle;
    // Keep Engine/Bank labels synchronized with the active playback route.
    const defaults = this.voiceRouter.getDefaults();
    this.element<HTMLSelectElement>('playback-engine-select').value = defaults.engine;
    this.element<HTMLSelectElement>('playback-bank-select').value = defaults.soundbank;
    this.updateCanvasAriaLabel();
    const options = this.element<HTMLElement>('voice-filter-options'); options.replaceChildren();
    this.currentScore.tracks.forEach((track) => {
      const label = document.createElement('label'); label.className = 'voice-chip';
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = true; input.value = String(track.channel);
      input.addEventListener('change', () => { const checked = [...options.querySelectorAll<HTMLInputElement>('input:checked')].map((node) => Number(node.value)); this.currentConfig.voiceFilter = checked.length === this.currentScore.tracks.length ? null : checked; this.updateControlApplicability(); this.render(); });
      label.append(input, document.createTextNode(track.name)); options.append(label);
    });
    const audioOptions = this.element<HTMLElement>('audio-voice-options'); audioOptions.replaceChildren();
    const statusMap = this.soundfontPlayer?.getStatusMap();

    const voiceContext: VoiceRowContext = {
      engine: defaults.engine,
      soundbank: defaults.soundbank,
      statusMap,
      isPercussion: (t) => t.isPercussion,
      getProgram: (track) => this.voiceRouter.resolveTrackSettings(track).program,
      onProgramChange: (channel, program) => {
        this.voiceRouter.setProgram(channel, program);
        void this.applyVoiceRoutingChange();
      },
      onTimbreChange: (channel, timbre) => {
        const settings = this.voicePlayback.get(channel);
        if (settings) {
          settings.timbre = timbre;
          this.commitVoiceMix(this.voicePlayback);
        }
      },
      onGainInput: (channel, gainValue) => {
        const settings = this.voicePlayback.get(channel);
        if (settings) {
          settings.gain = gainValue;
          this.voiceRouter.setMix(channel, settings);
        }
      },
      onMixChange: () => {
        this.commitVoiceMix(this.voicePlayback);
      },
      onMute: (channel, checked) => {
        this.commitVoiceMix(this.voiceMixController.setMuted(this.voicePlayback, channel, checked));
      },
      onSolo: (channel, checked) => {
        this.commitVoiceMix(this.voiceMixController.setSolo(this.voicePlayback, channel, checked));
      },
    };

    this.currentScore.tracks.forEach((track, index) => {
      const settings = this.voicePlayback.get(track.channel) ?? defaultVoiceSettings(index);
      this.voicePlayback.set(track.channel, settings);
      audioOptions.append(buildAudioVoiceRow(track, index, settings, voiceContext));
    });
  }

  private updateCanvasAriaLabel(): void {
    const canvas = this.element<HTMLCanvasElement>('visualizer-canvas');
    const title = this.exportTitle.trim() || this.currentScore.title;
    canvas.setAttribute('aria-label', `Visual score rendering: ${title}`);
  }

  private commitVoiceMix(voices: Map<number, VoicePlaybackSettings>): void {
    this.voicePlayback = voices;
    this.voiceRouter.syncFromVoicePlayback(voices);
    void this.applyVoiceRoutingChange();
  }

  /** Restarts an active preview so its scheduled audio always matches the visible route. */
  private async applyVoiceRoutingChange(): Promise<void> {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.pause();
    this.updateScoreUi();
    if (!wasPlaying) {
      this.setStatus('Playback routing updated. Press Play to audition it.');
      return;
    }
    await this.startPlayback();
  }

  private async togglePlay(): Promise<void> {
    if (this.isPlaying) { this.pause(); return; }
    await this.startPlayback();
  }

  private async startPlayback(): Promise<void> {
    if (this.currentTime >= this.currentScore.duration) this.currentTime = 0;
    try {
      this.audioContext ??= new AudioContext();
      this.soundfontPlayer ??= new SoundfontPlayer({
        loader: new SoundfontPatchLoader((bytes) => this.audioContext!.decodeAudioData(bytes.slice(0))),
      });
      this.voiceRouter.syncFromVoicePlayback(this.voicePlayback);

      if (this.voiceRouter.getDefaults().engine === 'sample') {
        const badges = this.element<HTMLElement>('audio-voice-options').querySelectorAll<HTMLElement>('.patch-badge');
        badges.forEach((span) => applyBadge(span, 'loading'));
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

  private get libraryUIContext(): LibraryUIContext {
    return {
      element: <T extends HTMLElement>(id: string) => this.element<T>(id),
      setStatus: (message, isError) => this.setStatus(message, isError),
      getDownloadAbort: () => this.downloadAbort,
      setDownloadAbort: (controller) => { this.downloadAbort = controller; },
    };
  }

  private maybeShowLibraryPrompt(): void {
    maybeShowLibraryPrompt(this.libraryUIContext);
  }

  private dismissLibraryPrompt(): void {
    dismissLibraryPrompt(this.libraryUIContext);
  }

  private async refreshCacheStatus(): Promise<void> {
    await refreshCacheStatus(this.libraryUIContext);
  }

  private async downloadLibrary(): Promise<void> {
    await downloadLibrary(this.libraryUIContext);
  }

  private async clearLibraryCache(): Promise<void> {
    await clearLibraryCache(this.libraryUIContext);
  }

  private pause(): void {
    this.isPlaying = false;
    this.soundfontPlayer?.stop();
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
    this.element<HTMLButtonElement>('play-btn').textContent = '▶';
  }

  private tick = (): void => {
    const is3D = is3DVariation(this.currentConfig.variation);
    const needTurntable = is3D && this.viewport3d.autoRotate;
    if (!this.isPlaying && !needTurntable) {
      this.animationFrameId = null;
      return;
    }

    if (this.isPlaying) {
      const visualDuration = this.currentScore.duration;
      const completionTime = noteSourceStopTime(playbackEndTime(this.currentScore));
      const timelineDuration = Math.max(visualDuration, completionTime);
      this.currentTime = Math.min(
        completionTime,
        this.playbackOffset + (performance.now() - this.playbackStart) / 1000
      );
      if (is3D) {
        this.threeRenderer?.stepPlayhead(Math.min(this.currentTime, visualDuration));
        this.element<HTMLInputElement>('progress-scrubber').value = String(
          Math.round(this.currentTime / Math.max(timelineDuration, 0.01) * 1000)
        );
        this.element<HTMLOutputElement>('time-display').value =
          `${formatTime(this.currentTime)} / ${formatTime(visualDuration)}`;
      } else {
        const geometry = this.geometryFor(PREVIEW_SIZE);
        this.viewportController.stepAutoZoom(geometry, Math.min(this.currentTime, visualDuration), PREVIEW_SIZE, PREVIEW_SIZE);
        this.render();
      }
      if (this.currentTime >= completionTime) {
        this.pause();
        if (needTurntable) {
          this.animationFrameId = requestAnimationFrame(this.tick);
        }
      } else {
        this.animationFrameId = requestAnimationFrame(this.tick);
      }
    } else {
      if (is3D && this.threeRenderer) {
        const visualDuration = this.currentScore.duration;
        this.threeRenderer.stepPlayhead(this.currentTime < visualDuration ? this.currentTime : null);
      }
      this.animationFrameId = requestAnimationFrame(this.tick);
    }
  };

  private updateViewportUi(): void {
    const vp = this.viewportController.getViewport();
    const hudAuto = this.element<HTMLInputElement>('hud-autozoom-toggle');
    const hudAutoLabel = this.element<HTMLElement>('hud-autozoom-label');

    if (hudAuto.checked !== vp.autoZoom) hudAuto.checked = vp.autoZoom;

    const mode = vp.autoZoomMode ?? 'musical';
    let badgeText: string;
    
    const modeMusical = this.element<HTMLButtonElement>('btn-mode-musical');
    const modeTime = this.element<HTMLButtonElement>('btn-mode-time');
    const wrapBars = this.element<HTMLElement>('wrapper-bars-range');
    const wrapSecs = this.element<HTMLElement>('wrapper-seconds-range');

    if (mode === 'musical') {
      const bars = vp.autoZoomWindowBars ?? AUTO_ZOOM_BAR_STEPS[4];
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
    this.configHistory.record(this.currentConfig);
    saveConfig(storage(), this.currentConfig);
    this.element<HTMLElement>('rule-caption').textContent = getRuleCaption(this.currentConfig);
    this.updateSummaryDialog();
    if (is3DVariation(this.currentConfig.variation)) {
      void this.render3D();
      this.element<HTMLInputElement>('progress-scrubber').value = String(
        Math.round(this.currentTime / Math.max(this.currentScore.duration, 0.01) * 1000)
      );
      this.element<HTMLOutputElement>('time-display').value =
        `${formatTime(this.currentTime)} / ${formatTime(this.currentScore.duration)}`;
      return;
    }
    const geometry = this.geometryFor(PREVIEW_SIZE);
    this.canvasRenderer.render(geometry, {
      time: this.currentTime,
      showLegend: this.legendVisible,
      backgroundColor: this.backgroundColor(),
      atmosphereColors: this.atmosphereColors(),
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

  /** Renders the modal from the same legend content used by Canvas/SVG, plus active config values. */
  private updateSummaryDialog(): void {
    const content = getLegendContent(this.currentConfig);
    this.element<HTMLElement>('summary-title').textContent = content.title;
    const lines = this.element<HTMLUListElement>('summary-lines');
    lines.replaceChildren(...content.lines.map((line) => {
      const item = document.createElement('li');
      item.textContent = line;
      return item;
    }));
    const swatches = this.element<HTMLElement>('summary-swatches');
    swatches.replaceChildren(...content.swatches.map((swatch) => {
      const item = document.createElement('span');
      item.className = 'summary-swatch';
      const dot = document.createElement('i');
      dot.style.background = swatch.color;
      item.append(dot, document.createTextNode(swatch.label));
      return item;
    }));
    const values = [
      ['Geometry', this.currentConfig.variation.replaceAll('_', ' ')],
      ['Color source', this.currentConfig.pitchHueMode.replaceAll('_', ' ')],
      ['Transpose', `${this.currentConfig.transposeSemitones >= 0 ? '+' : ''}${this.currentConfig.transposeSemitones} st`],
      ['Growth', this.currentConfig.originMode.replaceAll('_', ' ')],
      ['Rests', this.currentConfig.gapPolicy.replaceAll('_', ' ')],
      ['Chords', this.currentConfig.chordLayout],
      ['Length', `${this.currentConfig.lengthScale}px/s · ${this.currentConfig.lengthProportionalTo}`],
      ['Spoke length', this.supportsRadialSpokeScale() ? this.radialSpokeScaleLabel() : 'not used by this mode'],
      ['Turn', `${this.currentConfig.angleScale}°/oct · ${this.currentConfig.intervalAngleEnabled ? 'on' : 'off'}`],
      ['Weight', `${this.currentConfig.strokeWidthBase}px base · ${this.currentConfig.constantStrokeWidth ? 'uniform' : 'velocity'}`],
      ['Dynamics', `glow ${this.currentConfig.velocityGlow ? 'on' : 'off'} · opacity ${this.currentConfig.velocityOpacity ? 'on' : 'off'}`],
      ['Quantize', this.currentConfig.quantizeOnset ? `1/${this.currentConfig.quantizeSubdivision * 4}` : 'off'],
      ['Z / time', is3DVariation(this.currentConfig.variation) ? `${this.currentConfig.zScale}%` : '2D mode'],
    ];
    const list = this.element<HTMLDListElement>('summary-values');
    list.replaceChildren(...values.flatMap(([label, value]) => {
      const term = document.createElement('dt'); term.textContent = label;
      const description = document.createElement('dd'); description.textContent = value;
      return [term, description];
    }));
  }

  /** Shows the 3D canvas (and its controls) or the 2D canvas depending on the variation. */
  private updateCanvasMode(): void {
    const is3D = is3DVariation(this.currentConfig.variation);
    this.element<HTMLCanvasElement>('visualizer-canvas').classList.toggle('is-hidden', is3D);
    this.element<HTMLCanvasElement>('visualizer-canvas-3d').classList.toggle('is-hidden', !is3D);
    this.element<HTMLElement>('viewport-hud').classList.toggle('is-hidden', is3D);
    this.element<HTMLElement>('threed-controls').classList.toggle('is-hidden', !is3D);
    this.updateControlApplicability();
    this.updateGroupBadges();
    updateGeometryPicker(this.element<HTMLElement>('geometry-picker'), this.currentConfig.variation);
  }

  /** Keeps collapsed accordion headers informative without duplicating controls. */
  private updateGroupBadges(): void {
    const variation = this.element<HTMLSelectElement>('variation-select');
    const variationLabel = variation.selectedOptions[0]?.textContent?.trim() ?? this.currentConfig.variation.replaceAll('_', ' ');
    this.element<HTMLElement>('badge-variation').textContent = variationLabel;
    const count = this.currentScore.tracks.length;
    this.element<HTMLElement>('badge-voices').textContent = `${count} voice${count === 1 ? '' : 's'}`;
  }

  /**
   * Hides Compose/Refine controls that the active variation ignores.
   * Values stay in currentConfig so switching modes restores them.
   */
  private updateControlApplicability(): void {
    const variation = this.currentConfig.variation;
    document.querySelectorAll<HTMLElement>('[data-control]').forEach((el) => {
      const key = el.dataset.control as StudioControlKey | undefined;
      if (!key) return;
      const applicable = isControlApplicable(variation, key);
      el.classList.toggle('is-hidden', !applicable);
      if (applicable) {
        el.removeAttribute('title');
      } else {
        el.title = 'Ignored by this mode';
      }
    });
    if (isControlApplicable(variation, 'radialSpokeScale')) {
      this.element<HTMLOutputElement>('val-radial-spoke-scale').value = this.radialSpokeScaleLabel();
    }
  }

  /** Preview legend visibility; does not change SVG/PNG/plotter export policy. */
  private setLegendVisible(visible: boolean): void {
    this.legendVisible = visible;
    const btn = this.element<HTMLButtonElement>('hud-legend-toggle');
    btn.classList.toggle('is-active', visible);
    btn.setAttribute('aria-pressed', String(visible));
    this.render();
  }

  private supportsRadialSpokeScale(): boolean {
    return isControlApplicable(this.currentConfig.variation, 'radialSpokeScale');
  }

  private radialSpokeScaleLabel(): string {
    const visiblePitchedNotes = this.currentScore.tracks
      .filter((track) => !track.isPercussion && track.channel !== 9 && (this.currentConfig.voiceFilter === null || this.currentConfig.voiceFilter.includes(track.channel)))
      .flatMap((track) => track.notes);
    const autoScale = getRadialSpokeAutoScale(visiblePitchedNotes, Math.max(this.currentScore.duration, 0.01), PREVIEW_SIZE * 0.45, this.currentConfig);
    return `Auto ×${autoScale.toFixed(autoScale >= 10 ? 0 : 2)} · user ${this.currentConfig.radialSpokeScale.toFixed(2)}×`;
  }

  private async ensureThreeRenderer(): Promise<I3DRenderer> {
    if (!this.threeRenderer) {
      const { ThreeDRenderer } = await import('../renderers/three/ThreeDRenderer.js');
      const renderer = new ThreeDRenderer();
      renderer.mount(this.element<HTMLCanvasElement>('visualizer-canvas-3d'), PREVIEW_SIZE, PREVIEW_SIZE, (viewport) => {
        this.viewport3d = viewport;
        this.element<HTMLSelectElement>('camera-preset-select').value = viewport.preset;
        this.element<HTMLInputElement>('threed-autofollow-toggle').checked = viewport.autoFollow;
        this.element<HTMLInputElement>('threed-chase-toggle').checked = viewport.chaseCamera;
      });
      this.threeRenderer = renderer;
    }
    return this.threeRenderer;
  }

  private async render3D(): Promise<void> {
    try {
      const renderer = await this.ensureThreeRenderer();
      if (!is3DVariation(this.currentConfig.variation)) return; // variation changed while loading
      renderer.setGeometry(map3DGeometry(this.currentScore, this.currentConfig, PREVIEW_SIZE, PREVIEW_SIZE));
      renderer.setViewport(this.viewport3d);
      renderer.setBackground(this.backgroundColor(), this.atmosphereColors());
      renderer.stepPlayhead(this.currentTime < this.currentScore.duration ? this.currentTime : null);
      if (!this.isPlaying && this.viewport3d.autoRotate) {
        if (this.animationFrameId === null) {
          this.animationFrameId = requestAnimationFrame(this.tick);
        }
      }
    } catch (err) {
      console.error('3D rendering failed:', err);
      this.setStatus('3D rendering could not start (WebGL unavailable).', true);
      if (is3DVariation(this.currentConfig.variation)) {
        this.currentConfig.variation = 'lines';
        this.element<HTMLSelectElement>('variation-select').value = 'lines';
        this.updateCanvasMode();
        this.render();
      }
    }
  }

  private getExportViewport(size: number): ViewportTransform {
    const vp = this.viewportController.getViewport();
    const scale = size / PREVIEW_SIZE;
    return { ...vp, panX: vp.panX * scale, panY: vp.panY * scale };
  }

  private downloadSvg(plotter: boolean): void {
    if (is3DVariation(this.currentConfig.variation)) {
      this.setStatus('SVG export is not available for 3D modes yet — use PNG.', true);
      return;
    }
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
    if (is3DVariation(this.currentConfig.variation)) {
      void this.downloadPng3D();
      return;
    }
    const geometry = this.geometryFor(EXPORT_SIZE);
    this.canvasRenderer.render(geometry, {
      showLegend: true,
      backgroundColor: this.backgroundColor(),
      atmosphereColors: this.atmosphereColors(),
      title: this.exportTitle,
      viewport: this.getExportViewport(EXPORT_SIZE)
    });
    this.canvasRenderer.downloadPng(`${this.filename()}.png`);
    this.render();
  }

  private async downloadPng3D(): Promise<void> {
    const renderer = this.threeRenderer;
    if (!renderer) return;
    renderer.setBackground(this.backgroundColor(), this.atmosphereColors());
    try {
      const blob = await renderer.capturePNG();
      this.download(blob, `${this.filename()}.png`);
    } catch {
      this.setStatus('3D PNG export failed.', true);
    }
  }

  private async downloadWebM3D(): Promise<void> {
    if (!is3DVariation(this.currentConfig.variation)) {
      this.setStatus('WebM capture is available for 3D modes only.', true);
      return;
    }
    try {
      const renderer = await this.ensureThreeRenderer();
      this.setStatus('Recording a 6-second 3D capture…');
      this.download(await renderer.captureWebM(6), `${this.filename()}.webm`);
      this.setStatus('3D WebM capture saved.');
    } catch {
      this.setStatus('WebM capture is not supported in this browser.', true);
    }
  }

  private async copyConfigLink(): Promise<void> {
    const copied = await copyConfigLink(this.currentConfig);
    this.setStatus(copied ? 'Shareable look link copied. It contains no MIDI data.' : 'Shareable look link added to this page URL.');
  }

  private geometryFor(size: number) { return fitGeometryToCanvas(mapScoreToGeometry(this.currentScore, this.currentConfig, size, size), size, size); }
  private backgroundColor(): string { return this.backgroundMode === 'average' ? getAverageScoreBackground(this.currentScore, this.currentConfig) : '#000000'; }
  private atmosphereColors(): string[] | undefined {
    if (this.backgroundMode !== 'black') return undefined;
    const accent = getDominantScoreAccent(this.currentScore, this.currentConfig);
    return accent ? [accent] : undefined;
  }
  private download(blob: Blob, name: string): void { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
  private filename(): string { return `${this.currentScore.title.replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '').toLowerCase()}-${this.currentConfig.variation}`; }
  private setStatus(message: string, isError = false): void { const status = this.element<HTMLElement>('app-status'); status.textContent = message; status.classList.toggle('is-error', isError); }
}

function formatTime(seconds: number): string { const whole = Math.max(0, Math.floor(seconds)); return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`; }
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => { new AudioVisualizerApp(); });
}
