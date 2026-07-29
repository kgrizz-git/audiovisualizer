import { DEFAULT_CONFIG } from '../core/mapper/scoreMapper.js';
import { RuleConfig, Variation } from '../core/types.js';

const SESSION_KEY = 'audio-visualizer:studio-config:v1';
const VARIATIONS: readonly Variation[] = [
  'lines', 'circles', 'vertical_tone', 'tonal_time_lines', 'polar_fan', 'polar_walk',
  'radial_voice_paths', 'radial_pitch_spokes', '3d_lines', '3d_note_halos',
  '3d_note_spheres', '3d_piano_roll', '3d_polar_fan', '3d_polar_walk',
  '3d_radial_voice_paths', '3d_voice_towers',
];

export type PersistedConfig = Omit<RuleConfig, 'voiceFilter'>;

function persistentConfig(config: RuleConfig): PersistedConfig {
  const { voiceFilter: _voiceFilter, ...persisted } = config;
  return persisted;
}

export function encodeConfig(config: RuleConfig): string {
  return encodeURIComponent(JSON.stringify(persistentConfig(config)));
}

export function decodeConfig(encoded: string): PersistedConfig | null {
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(encoded));
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as Record<string, unknown>;
    const defaults = persistentConfig(DEFAULT_CONFIG) as Record<string, unknown>;
    for (const [key, defaultValue] of Object.entries(defaults)) {
      if (typeof candidate[key] !== typeof defaultValue) return null;
    }
    if (!VARIATIONS.includes(candidate.variation as Variation)) return null;
    return candidate as PersistedConfig;
  } catch {
    return null;
  }
}

export function restoreConfig(persisted: PersistedConfig): RuleConfig {
  return { ...DEFAULT_CONFIG, ...persisted, voiceFilter: null };
}

export function loadSavedConfig(storage: Storage | undefined): RuleConfig | null {
  if (!storage) return null;
  const value = storage.getItem(SESSION_KEY);
  const decoded = value ? decodeConfig(value) : null;
  return decoded ? restoreConfig(decoded) : null;
}

export function saveConfig(storage: Storage | undefined, config: RuleConfig): void {
  storage?.setItem(SESSION_KEY, encodeConfig(config));
}

export class ConfigHistory {
  private snapshots: RuleConfig[] = [];
  private currentIndex = -1;

  constructor(private readonly limit = 40) {}

  reset(config: RuleConfig): void {
    this.snapshots = [cloneConfig(config)];
    this.currentIndex = 0;
  }

  record(config: RuleConfig): void {
    const next = cloneConfig(config);
    if (sameConfig(this.snapshots[this.currentIndex], next)) return;
    this.snapshots.splice(this.currentIndex + 1);
    this.snapshots.push(next);
    if (this.snapshots.length > this.limit) this.snapshots.shift();
    this.currentIndex = this.snapshots.length - 1;
  }

  undo(): RuleConfig | null {
    if (this.currentIndex <= 0) return null;
    this.currentIndex--;
    return cloneConfig(this.snapshots[this.currentIndex]);
  }

  redo(): RuleConfig | null {
    if (this.currentIndex >= this.snapshots.length - 1) return null;
    this.currentIndex++;
    return cloneConfig(this.snapshots[this.currentIndex]);
  }
}

function cloneConfig(config: RuleConfig): RuleConfig {
  return { ...config, voiceFilter: config.voiceFilter ? [...config.voiceFilter] : null };
}

function sameConfig(a: RuleConfig | undefined, b: RuleConfig): boolean {
  return Boolean(a) && JSON.stringify(a) === JSON.stringify(b);
}
