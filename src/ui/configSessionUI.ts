import { RuleConfig } from '../core/types.js';
import { decodeConfig, encodeConfig, loadSavedConfig, restoreConfig } from './configPersistence.js';

type ElementById = (id: string) => HTMLElement;

export function restoreInitialConfig(): RuleConfig | null {
  const hash = globalThis.window?.location?.hash;
  const fromHash = hash?.match(/^#config=(.+)$/)?.[1];
  const persisted = fromHash ? decodeConfig(fromHash) : null;
  return persisted ? restoreConfig(persisted) : loadSavedConfig(storage());
}

export function storage(): Storage | undefined {
  try { return globalThis.window?.localStorage; } catch { return undefined; }
}

export function syncConfigControls(element: ElementById, c: RuleConfig): void {
  const selects: Array<[string, string]> = [['variation-select', c.variation], ['origin-select', c.originMode], ['hue-mode-select', c.pitchHueMode], ['gap-policy-select', c.gapPolicy], ['chord-layout-select', c.chordLayout], ['length-source-select', c.lengthProportionalTo]];
  selects.forEach(([id, value]) => { (element(id) as HTMLSelectElement).value = value; });
  const ranges: Array<[string, number]> = [['zscale-range', c.zScale], ['transpose-range', c.transposeSemitones], ['length-scale', c.lengthScale], ['radial-spoke-scale', c.radialSpokeScale], ['angle-scale', c.angleScale], ['spiral-bias', c.spiralBias], ['stroke-base', c.strokeWidthBase], ['time-line-density', c.timeLineDensity]];
  ranges.forEach(([id, value]) => { (element(id) as HTMLInputElement).value = String(value); });
  const toggles: Array<[string, boolean]> = [['interval-angle-toggle', c.intervalAngleEnabled], ['quantize-toggle', c.quantizeOnset], ['velocity-glow-toggle', c.velocityGlow], ['velocity-opacity-toggle', c.velocityOpacity], ['constant-stroke-toggle', c.constantStrokeWidth], ['ring-flash-toggle', c.ringFlashes3D]];
  toggles.forEach(([id, value]) => { (element(id) as HTMLInputElement).checked = value; });
}

export function configShareUrl(config: RuleConfig): URL {
  const url = new URL(globalThis.window.location.href);
  url.hash = `config=${encodeConfig(config)}`;
  return url;
}

export async function copyConfigLink(config: RuleConfig): Promise<boolean> {
  const url = configShareUrl(config);
  try {
    await globalThis.navigator.clipboard.writeText(url.toString());
    return true;
  } catch {
    globalThis.window.location.hash = url.hash;
    return false;
  }
}
