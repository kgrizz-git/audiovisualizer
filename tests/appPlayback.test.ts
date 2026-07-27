import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

class MockAudioContext {
  state = 'suspended';
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  decodeAudioData = vi.fn(async () => ({}));
  createGain = vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { value: 1 },
  }));
  destination = {};
  currentTime = 0;
}

class MockOption {
  text: string;
  value: string;
  defaultSelected: boolean;
  selected: boolean;
  constructor(text = '', value = '', defaultSelected = false, selected = false) {
    this.text = text;
    this.value = value;
    this.defaultSelected = defaultSelected;
    this.selected = selected;
  }
}

function setupMockDom() {
  const elements = new Map<string, any>();

  const createMockElement = (id: string) => {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    const el = {
      id,
      value: id === 'variation-select' ? 'lines' : id === 'progress-scrubber' ? '1000' : '0',
      textContent: '',
      innerText: '',
      checked: false,
      options: [],
      selectedOptions: [{ text: 'Demo' }],
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
        toggle: vi.fn(),
        contains: vi.fn(() => false),
      },
      addEventListener: vi.fn((evt: string, fn: (...args: unknown[]) => void) => {
        listeners[evt] = listeners[evt] || [];
        listeners[evt].push(fn);
      }),
      removeEventListener: vi.fn(),
      setAttribute: vi.fn(),
      getAttribute: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      querySelector: vi.fn(() => null),
      replaceChildren: vi.fn(),
      append: vi.fn(),
      prepend: vi.fn(),
      add: vi.fn(),
      getContext: vi.fn(() => ({
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        fill: vi.fn(),
        arc: vi.fn(),
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        fillText: vi.fn(),
        measureText: vi.fn(() => ({ width: 10 })),
        createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
        createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
        setLineDash: vi.fn(),
        roundRect: vi.fn(),
        setTransform: vi.fn(),
      })),
      style: {},
      click: vi.fn(() => {
        (listeners['click'] || []).forEach((fn) => fn({}));
      }),
      _listeners: listeners,
    };
    return el;
  };

  vi.stubGlobal('document', {
    getElementById: (id: string) => {
      if (!elements.has(id)) {
        elements.set(id, createMockElement(id));
      }
      return elements.get(id);
    },
    createElement: (tag: string) => createMockElement(tag),
    createTextNode: (text: string) => ({ textContent: text }),
  });

  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    requestAnimationFrame: vi.fn(() => 1),
    cancelAnimationFrame: vi.fn(),
  });

  vi.stubGlobal('AudioContext', MockAudioContext);
  vi.stubGlobal('Option', MockOption);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
}

setupMockDom();

const { AudioVisualizerApp } = await import('../src/ui/app.js');
const { SoundfontPlayer } = await import('../src/audio/soundfont/soundfontPlayer.js');

describe('AudioVisualizerApp playback first-press behavior', () => {
  let playerStartSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    setupMockDom();
    playerStartSpy = vi.spyOn(SoundfontPlayer.prototype, 'start').mockImplementation(async () => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('resets currentTime from duration to 0 on first play press', async () => {
    const app = new AudioVisualizerApp() as any;

    // Initially, app.currentTime starts equal to app.currentScore.duration
    expect(app.currentTime).toBe(app.currentScore.duration);
    expect(app.currentTime).toBeGreaterThan(0);

    // Call startPlayback (or togglePlay) for the first time
    await app.togglePlay();

    // Verify SoundfontPlayer.start was called with offset 0 and playbackOffset was set to 0
    expect(playerStartSpy).toHaveBeenCalledTimes(1);
    expect(playerStartSpy).toHaveBeenCalledWith(app.currentScore, 0, expect.anything());
    expect(app.playbackOffset).toBe(0);
  });

  it('resets currentTime to 0 when starting playback at the end of the track', async () => {
    const app = new AudioVisualizerApp() as any;

    // Manually set currentTime to the score duration (track end)
    app.currentTime = app.currentScore.duration;

    await app.startPlayback();

    expect(playerStartSpy).toHaveBeenCalledWith(app.currentScore, 0, expect.anything());
    expect(app.playbackOffset).toBe(0);
  });

  it('preserves currentTime when starting playback in mid-track', async () => {
    const app = new AudioVisualizerApp() as any;
    const midTime = app.currentScore.duration / 2;

    // Set currentTime to mid-track
    app.currentTime = midTime;

    await app.startPlayback();

    expect(playerStartSpy).toHaveBeenCalledWith(app.currentScore, midTime, expect.anything());
    expect(app.playbackOffset).toBe(midTime);
  });
});

describe('AudioVisualizerApp scrub-resume behavior', () => {
  let playerStartSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    setupMockDom();
    playerStartSpy = vi.spyOn(SoundfontPlayer.prototype, 'start').mockImplementation(async () => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const fire = (el: any, evt: string) => (el._listeners[evt] || []).forEach((fn: (...args: unknown[]) => void) => fn({}));

  it('pauses on scrub input during playback and resumes on change at the new position', async () => {
    const app = new AudioVisualizerApp() as any;
    const scrubber = (globalThis as any).document.getElementById('progress-scrubber');

    await app.togglePlay();
    expect(app.isPlaying).toBe(true);

    // Dragging the scrubber (input) pauses playback and seeks the playhead.
    scrubber.value = '500';
    fire(scrubber, 'input');
    expect(app.isPlaying).toBe(false);
    expect(app.wasPlayingBeforeScrub).toBe(true);
    expect(app.currentTime).toBeCloseTo(app.currentScore.duration / 2, 5);

    // Releasing the scrubber (change) resumes playback from the seek position.
    const seekTime = app.currentTime;
    fire(scrubber, 'change');
    await flush();
    expect(app.isPlaying).toBe(true);
    expect(app.wasPlayingBeforeScrub).toBe(false);
    expect(playerStartSpy).toHaveBeenLastCalledWith(app.currentScore, seekTime, expect.anything());
  });

  it('does not auto-start playback when scrubbing while paused', async () => {
    const app = new AudioVisualizerApp() as any;
    const scrubber = (globalThis as any).document.getElementById('progress-scrubber');

    scrubber.value = '250';
    fire(scrubber, 'input');
    fire(scrubber, 'change');
    await flush();

    expect(playerStartSpy).not.toHaveBeenCalled();
    expect(app.isPlaying).toBe(false);
    expect(app.currentTime).toBeCloseTo(app.currentScore.duration * 0.25, 5);
  });
});
