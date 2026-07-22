import { parseMidiData, generateDemoScore } from '../core/midi/parser.js';
import { mapScoreToGeometry, DEFAULT_CONFIG } from '../core/mapper/scoreMapper.js';
import { CanvasRenderer } from '../renderers/canvas/canvasRenderer.js';
import { buildSvg } from '../renderers/svg/svgBuilder.js';
import { Score, RuleConfig, Variation, OriginMode, PitchHueMode } from '../core/types.js';

class AudioVisualizerApp {
  private currentScore: Score;
  private currentConfig: RuleConfig;
  private canvasRenderer: CanvasRenderer;
  private isPlaying: boolean = false;
  private animationFrameId: number | null = null;
  private animationProgress: number = 1.0;

  constructor() {
    this.currentScore = generateDemoScore();
    this.currentConfig = { ...DEFAULT_CONFIG };

    const canvas = document.getElementById('visualizer-canvas') as HTMLCanvasElement;
    this.canvasRenderer = new CanvasRenderer(canvas);

    this.bindEvents();
    this.render();
  }

  private bindEvents(): void {
    // Demo MIDI Preset Selector
    const demoSelect = document.getElementById('demo-midi-select') as HTMLSelectElement;
    demoSelect.addEventListener('change', async (e) => {
      const val = (e.target as HTMLSelectElement).value;
      if (val === 'synthetic') {
        this.currentScore = generateDemoScore();
        this.animationProgress = 1.0;
        this.render();
      } else {
        try {
          const res = await fetch(val);
          const buffer = await res.arrayBuffer();
          const title = demoSelect.options[demoSelect.selectedIndex].text;
          this.currentScore = parseMidiData(buffer, title);
          this.animationProgress = 1.0;
          this.render();
        } catch (err) {
          console.error('Failed to load demo MIDI file:', err);
        }
      }
    });

    // MIDI File Upload
    const fileInput = document.getElementById('midi-file-input') as HTMLInputElement;
    const fileLabel = document.getElementById('file-label') as HTMLLabelElement;

    fileInput.addEventListener('change', async (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files[0]) {
        const file = target.files[0];
        fileLabel.innerText = `🎵 ${file.name}`;
        const buffer = await file.arrayBuffer();
        this.currentScore = parseMidiData(buffer, file.name);
        this.animationProgress = 1.0;
        this.render();
      }
    });

    // Preset Controls
    const variationSelect = document.getElementById('variation-select') as HTMLSelectElement;
    variationSelect.addEventListener('change', (e) => {
      this.currentConfig.variation = (e.target as HTMLSelectElement).value as Variation;
      this.render();
    });

    const originSelect = document.getElementById('origin-select') as HTMLSelectElement;
    originSelect.addEventListener('change', (e) => {
      this.currentConfig.originMode = (e.target as HTMLSelectElement).value as OriginMode;
      this.render();
    });

    const hueModeSelect = document.getElementById('hue-mode-select') as HTMLSelectElement;
    hueModeSelect.addEventListener('change', (e) => {
      this.currentConfig.pitchHueMode = (e.target as HTMLSelectElement).value as PitchHueMode;
      this.render();
    });

    // Sliders
    const lengthInput = document.getElementById('length-scale') as HTMLInputElement;
    const lengthVal = document.getElementById('val-length') as HTMLElement;
    lengthInput.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      this.currentConfig.lengthScale = val;
      lengthVal.innerText = val.toString();
      this.render();
    });

    const angleInput = document.getElementById('angle-scale') as HTMLInputElement;
    const angleVal = document.getElementById('val-angle') as HTMLElement;
    angleInput.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      this.currentConfig.angleScale = val;
      angleVal.innerText = val.toString();
      this.render();
    });

    const strokeInput = document.getElementById('stroke-base') as HTMLInputElement;
    const strokeVal = document.getElementById('val-stroke') as HTMLElement;
    strokeInput.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      this.currentConfig.strokeWidthBase = val;
      strokeVal.innerText = val.toString();
      this.render();
    });

    // Scrubber
    const scrubber = document.getElementById('progress-scrubber') as HTMLInputElement;
    scrubber.addEventListener('input', (e) => {
      this.isPlaying = false;
      this.animationProgress = parseFloat((e.target as HTMLInputElement).value) / 100;
      this.render();
    });

    // Play/Pause
    const playBtn = document.getElementById('play-btn') as HTMLButtonElement;
    playBtn.addEventListener('click', () => {
      this.togglePlay(playBtn, scrubber);
    });

    // SVG Export
    const exportSvgBtn = document.getElementById('btn-export-svg') as HTMLButtonElement;
    exportSvgBtn.addEventListener('click', () => {
      this.downloadSvg(false);
    });

    const exportPlotterBtn = document.getElementById('btn-export-plotter') as HTMLButtonElement;
    exportPlotterBtn.addEventListener('click', () => {
      this.downloadSvg(true);
    });
  }

  private togglePlay(btn: HTMLButtonElement, scrubber: HTMLInputElement): void {
    this.isPlaying = !this.isPlaying;
    btn.innerText = this.isPlaying ? '⏸' : '▶';

    if (this.isPlaying) {
      if (this.animationProgress >= 1.0) {
        this.animationProgress = 0;
      }
      this.animateLoop(scrubber);
    } else if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  private animateLoop(scrubber: HTMLInputElement): void {
    if (!this.isPlaying) return;

    this.animationProgress += 0.005;
    if (this.animationProgress >= 1.0) {
      this.animationProgress = 1.0;
      this.isPlaying = false;
      const btn = document.getElementById('play-btn') as HTMLButtonElement;
      if (btn) btn.innerText = '▶';
    }

    scrubber.value = (this.animationProgress * 100).toString();
    this.render();

    if (this.isPlaying) {
      this.animationFrameId = requestAnimationFrame(() => this.animateLoop(scrubber));
    }
  }

  private render(): void {
    const geometry = mapScoreToGeometry(this.currentScore, this.currentConfig, 800, 800);
    this.canvasRenderer.render(geometry, {
      progress: this.animationProgress,
      showLegend: true,
    });
  }

  private downloadSvg(isPlotter: boolean): void {
    const geometry = mapScoreToGeometry(this.currentScore, this.currentConfig, 1000, 1000);
    const svgString = buildSvg(geometry, {
      includeLegend: !isPlotter,
      penPlotterMode: isPlotter,
    });

    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filename = `${this.currentScore.title.replace(/\s+/g, '_')}_${this.currentConfig.variation}${isPlotter ? '_plotter' : ''}.svg`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
  new AudioVisualizerApp();
});
