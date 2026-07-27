import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { applyBadge, buildAudioVoiceRow, gmLabel, soundbankLabel, VoiceRowContext } from '../src/ui/voiceOptionsUI.js';
import { TrackScore } from '../src/core/types.js';
import { VoicePlaybackSettings } from '../src/audio/midiPreviewPlayer.js';

class MockElement {
  tagName: string;
  className = '';
  textContent = '';
  type = '';
  checked = false;
  value = '';
  min = '';
  max = '';
  step = '';
  attributes: Record<string, string> = {};
  children: (MockElement | MockTextNode)[] = [];
  listeners: Record<string, ((...args: any[]) => void)[]> = {};

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }

  getAttribute(name: string) {
    return this.attributes[name] ?? null;
  }

  addEventListener(event: string, fn: (...args: any[]) => void) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(fn);
  }

  dispatchEvent(event: { type: string }) {
    const list = this.listeners[event.type] || [];
    list.forEach((fn) => fn());
  }

  append(...nodes: (MockElement | MockTextNode | string)[]) {
    nodes.forEach((n) => {
      if (typeof n === 'string') {
        this.children.push(new MockTextNode(n));
      } else {
        this.children.push(n);
      }
    });
  }

  prepend(...nodes: (MockElement | MockTextNode | string)[]) {
    nodes.reverse().forEach((n) => {
      if (typeof n === 'string') {
        this.children.unshift(new MockTextNode(n));
      } else {
        this.children.unshift(n);
      }
    });
  }

  add(option: MockElement) {
    this.children.push(option);
    if ((option as any).selected) {
      this.value = option.value;
    }
  }

  querySelector<T = MockElement>(selector: string): T | null {
    return (this.querySelectorAll<T>(selector)[0] as T) ?? null;
  }

  querySelectorAll<T = MockElement>(selector: string): T[] {
    const res: MockElement[] = [];
    const walk = (el: MockElement) => {
      for (const child of el.children) {
        if (child instanceof MockElement) {
          if (selector.startsWith('.') && child.className.split(' ').includes(selector.slice(1))) {
            res.push(child);
          } else if (selector === 'select' && child.tagName === 'SELECT') {
            res.push(child);
          } else if (selector.startsWith('input[')) {
            const attrMatch = selector.match(/input\[(.*?)="(.*?)"\]/);
            if (attrMatch && child.tagName === 'INPUT') {
              const [, attr, val] = attrMatch;
              if (attr === 'type' && child.type === val) res.push(child);
            }
          }
          walk(child);
        }
      }
    };
    walk(this);
    return res as T[];
  }
}

class MockTextNode {
  text: string;
  constructor(text: string) {
    this.text = text;
  }
}

class MockOption extends MockElement {
  selected: boolean;
  constructor(text: string, value: string, _defaultSelected?: boolean, selected?: boolean) {
    super('option');
    this.textContent = text;
    this.value = value;
    this.selected = !!selected;
  }
}

describe('voiceOptionsUI', () => {
  const dummyTrack: TrackScore = {
    name: 'Piano Track',
    channel: 1,
    program: 0,
    instrumentName: 'Acoustic Grand Piano',
    isPercussion: false,
    notes: [],
  };

  const dummySettings: VoicePlaybackSettings = {
    timbre: 'sine',
    gain: 1.0,
    muted: false,
    solo: false,
  };

  let origDocument: any;
  let origOption: any;

  beforeEach(() => {
    origDocument = (globalThis as any).document;
    origOption = (globalThis as any).Option;

    (globalThis as any).document = {
      createElement: (tag: string) => new MockElement(tag),
      createTextNode: (text: string) => new MockTextNode(text),
    };
    (globalThis as any).Option = MockOption;
  });

  afterEach(() => {
    (globalThis as any).document = origDocument;
    (globalThis as any).Option = origOption;
  });

  it('formats gmLabel correctly', () => {
    expect(gmLabel(0)).toBe('0 · Acoustic Grand Piano');
    expect(gmLabel(24)).toBe('24 · Acoustic Guitar Nylon');
  });

  it('formats soundbankLabel correctly', () => {
    expect(soundbankLabel('FluidR3_GM')).toBe('FluidR3 GM');
    expect(soundbankLabel('MusyngKite')).toBe('MusyngKite');
    expect(soundbankLabel('FatBoy')).toBe('FatBoy');
  });

  it('applies patch status badges correctly', () => {
    const span = new MockElement('span');
    applyBadge(span as any, 'loading');
    expect(span.textContent).toBe('⏳ Loading sample…');

    applyBadge(span as any, 'loaded');
    expect(span.textContent).toBe('✓ Sample loaded');

    applyBadge(span as any, 'fallback');
    expect(span.textContent).toBe('⚡ Synth Fallback');

    applyBadge(span as any, 'drumkit');
    expect(span.textContent).toBe('🥁 Drum Kit');

    applyBadge(span as any, 'drumkit-missing');
    expect(span.textContent).toBe('❌ Drum Kit Missing');

    applyBadge(span as any, undefined);
    expect(span.textContent).toBe('—');
  });

  it('builds voice row for sample engine with GM dropdown and badge', () => {
    const context: VoiceRowContext = {
      engine: 'sample',
      soundbank: 'FluidR3_GM',
      statusMap: new Map([[1, 'loaded']]),
      getProgram: () => 0,
      onProgramChange: vi.fn(),
      onTimbreChange: vi.fn(),
      onGainInput: vi.fn(),
      onMixChange: vi.fn(),
      onMute: vi.fn(),
      onSolo: vi.fn(),
    };

    const row = buildAudioVoiceRow(dummyTrack, 0, dummySettings, context) as unknown as MockElement;
    expect(row.className).toBe('audio-voice-row');

    const sourceLabel = row.querySelector('.voice-source-label');
    expect(sourceLabel?.textContent).toBe('Piano Track · MIDI: Acoustic Grand Piano');

    const routeLabel = row.querySelector('.voice-effective-route');
    expect(routeLabel?.textContent).toBe('Playback: 0 · Acoustic Grand Piano · FluidR3 GM');

    const gmSelect = row.querySelector<MockElement>('select');
    expect(gmSelect).not.toBeNull();
    expect(gmSelect?.getAttribute('aria-label')).toBe('Piano Track playback instrument');

    if (gmSelect) {
      gmSelect.value = '5';
      gmSelect.dispatchEvent({ type: 'change' });
      expect(context.onProgramChange).toHaveBeenCalledWith(1, 5);
    }

    const badge = row.querySelector('.patch-badge');
    expect(badge?.textContent).toBe('✓ Sample loaded');

    const gainInput = row.querySelector<MockElement>('input[type="range"]');
    expect(gainInput?.value).toBe('1');
    if (gainInput) {
      gainInput.value = '0.8';
      gainInput.dispatchEvent({ type: 'input' });
      expect(context.onGainInput).toHaveBeenCalledWith(1, 0.8);

      gainInput.dispatchEvent({ type: 'change' });
      expect(context.onMixChange).toHaveBeenCalledWith(1, expect.objectContaining({ gain: 0.8 }));
    }

    const checkboxes = row.querySelectorAll<MockElement>('input[type="checkbox"]');
    expect(checkboxes.length).toBe(2);

    // Mute toggle
    checkboxes[0].checked = true;
    checkboxes[0].dispatchEvent({ type: 'change' });
    expect(context.onMute).toHaveBeenCalledWith(1, true);

    // Solo toggle
    checkboxes[1].checked = true;
    checkboxes[1].dispatchEvent({ type: 'change' });
    expect(context.onSolo).toHaveBeenCalledWith(1, true);
  });

  it('builds voice row for synth engine with timbre dropdown and no badge', () => {
    const context: VoiceRowContext = {
      engine: 'oscillator',
      soundbank: 'FluidR3_GM',
      onProgramChange: vi.fn(),
      onTimbreChange: vi.fn(),
      onMixChange: vi.fn(),
      onMute: vi.fn(),
      onSolo: vi.fn(),
    };

    const row = buildAudioVoiceRow(dummyTrack, 0, { ...dummySettings, timbre: 'sawtooth' }, context) as unknown as MockElement;

    const routeLabel = row.querySelector('.voice-effective-route');
    expect(routeLabel?.textContent).toBe('Playback: sawtooth oscillator');

    const timbreSelect = row.querySelector<MockElement>('select');
    expect(timbreSelect?.value).toBe('sawtooth');
    expect(timbreSelect?.getAttribute('aria-label')).toBe('Piano Track timbre');

    if (timbreSelect) {
      timbreSelect.value = 'square';
      timbreSelect.dispatchEvent({ type: 'change' });
      expect(context.onTimbreChange).toHaveBeenCalledWith(1, 'square');
    }

    const badge = row.querySelector('.patch-badge');
    expect(badge).toBeNull();
  });

  it('builds voice row for percussion track with no select dropdown, read-only drum label, and drumkit badge', () => {
    const drumTrack: TrackScore = {
      name: 'Drums',
      channel: 10,
      program: 0,
      instrumentName: 'Standard Drum Kit',
      isPercussion: true,
      notes: [],
    };

    const context: VoiceRowContext = {
      engine: 'sample',
      soundbank: 'FluidR3_GM',
      statusMap: new Map([[10, 'drumkit']]),
      isPercussion: (t) => t.isPercussion,
      onProgramChange: vi.fn(),
      onTimbreChange: vi.fn(),
      onGainInput: vi.fn(),
      onMixChange: vi.fn(),
      onMute: vi.fn(),
      onSolo: vi.fn(),
    };

    const row = buildAudioVoiceRow(drumTrack, 0, dummySettings, context) as unknown as MockElement;

    const routeLabel = row.querySelector('.voice-effective-route');
    expect(routeLabel?.textContent).toBe('Playback: Drum kit · FluidR3 Standard');

    const select = row.querySelector('select');
    expect(select).toBeNull();

    const badge = row.querySelector('.patch-badge');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('🥁 Drum Kit');

    const gainInput = row.querySelector<MockElement>('input[type="range"]');
    expect(gainInput).not.toBeNull();

    const checkboxes = row.querySelectorAll<MockElement>('input[type="checkbox"]');
    expect(checkboxes.length).toBe(2);

    checkboxes[0].checked = true;
    checkboxes[0].dispatchEvent({ type: 'change' });
    expect(context.onMute).toHaveBeenCalledWith(10, true);

    checkboxes[1].checked = true;
    checkboxes[1].dispatchEvent({ type: 'change' });
    expect(context.onSolo).toHaveBeenCalledWith(10, true);
  });
});

