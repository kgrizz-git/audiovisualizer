import { readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
import { parseMidiData } from '../core/midi/parser.js';
import { DEFAULT_CONFIG, mapScoreToGeometry } from '../core/mapper/scoreMapper.js';
import { fitGeometryToCanvas } from '../core/layout/fitGeometry.js';
import { buildSvg } from '../renderers/svg/svgBuilder.js';
import { OriginMode, PitchHueMode, RuleConfig, Variation } from '../core/types.js';

interface CliOptions {
  input: string;
  output: string;
  width: number;
  height: number;
  config: RuleConfig;
  includeLegend: boolean;
  plotter: boolean;
  backgroundColor: string;
  title?: string;
  includePlotterTitle: boolean;
  manifest?: string;
}

const HELP = `AudioVisualizer MIDI → SVG / PNG

Usage:
  npm run render -- --input song.mid --output artwork.svg [options]

Options:
  --mode <lines|circles|vertical_tone|tonal_time_lines>
  --width <pixels> --height <pixels>    Output dimensions (default: 1200 × 1200)
  --density <0.5-2>                     Time-line bands per output row (default: 1)
  --hue <pitch_class|register_spiral|voice_palette> Color rule
  --transpose <-24..24>                 Visual semitone transpose (default: 0)
  --origin <left_to_right|center_outward|outside_inward>
  --voices <0,1,...>                    Include only MIDI channels
  --background <CSS color>               SVG background (default: #000000)
  --title <text>                        Override title in output (default: MIDI filename)
  --include-plotter-title               Include title in plotter mode (stroke-only)
  --output <file.svg|file.png>           Output format follows this extension
  --legend                               Include an explanatory SVG legend
  --plotter                              Stroke-only SVG; no background or legend
  --manifest <file.json>                 Write normalized score + render configuration
  --help                                 Show this help
`;

export function parseCli(argv: string[]): CliOptions | null {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const valueOptions = new Set(['input', 'output', 'mode', 'width', 'height', 'density', 'hue', 'origin', 'voices', 'background', 'manifest', 'title', 'transpose']);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (['legend', 'plotter', 'help', 'include-plotter-title'].includes(key)) { flags.add(key); continue; }
    if (!valueOptions.has(key)) throw new Error(`Unknown option: --${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    values.set(key, value);
    index += 1;
  }
  if (flags.has('help')) return null;

  const input = values.get('input');
  if (!input) throw new Error('--input is required.');
  const output = values.get('output') ?? input.replace(/\.(mid|midi)$/i, '') + '.svg';
  if (!/\.(svg|png)$/i.test(output)) throw new Error('--output must end in .svg or .png.');
  const mode = enumValue(values.get('mode') ?? DEFAULT_CONFIG.variation, ['lines', 'circles', 'vertical_tone', 'tonal_time_lines'], '--mode');
  const hue = enumValue(values.get('hue') ?? DEFAULT_CONFIG.pitchHueMode, ['pitch_class', 'register_spiral', 'voice_palette'], '--hue');
  const origin = enumValue(values.get('origin') ?? DEFAULT_CONFIG.originMode, ['left_to_right', 'center_outward', 'outside_inward'], '--origin');
  const width = positiveNumber(values.get('width') ?? '1200', '--width');
  const height = positiveNumber(values.get('height') ?? '1200', '--height');
  const density = numberInRange(values.get('density') ?? '1', '--density', 0.25, 4);
  const transpose = integerInRange(values.get('transpose') ?? '0', '--transpose', -24, 24);
  const voiceFilter = values.has('voices') ? values.get('voices')!.split(',').map((voice) => Number(voice.trim())) : null;
  if (voiceFilter?.some((voice) => !Number.isInteger(voice) || voice < 0 || voice > 15)) throw new Error('--voices must be comma-separated MIDI channels (0–15).');

  return {
    input, output, width, height, includeLegend: flags.has('legend'), plotter: flags.has('plotter'),
    backgroundColor: values.get('background') ?? '#000000', manifest: values.get('manifest'),
    title: values.get('title'), includePlotterTitle: flags.has('include-plotter-title'),
    config: { ...DEFAULT_CONFIG, variation: mode as Variation, pitchHueMode: hue as PitchHueMode, transposeSemitones: transpose, originMode: origin as OriginMode, voiceFilter, timeLineDensity: density },
  };
}

async function main(): Promise<void> {
  let options: CliOptions | null;
  try { options = parseCli(process.argv.slice(2)); }
  catch (error) { console.error(`Error: ${(error as Error).message}\n\n${HELP}`); process.exitCode = 1; return; }
  if (!options) { console.log(HELP); return; }

  try {
    const bytes = new Uint8Array(await readFile(options.input));
    const score = parseMidiData(bytes.buffer as ArrayBuffer, options.input);
    const resolvedTitle = options.title ?? score.title;
    const mapped = mapScoreToGeometry(score, options.config, options.width, options.height);
    const geometry = fitGeometryToCanvas(mapped, options.width, options.height);
    const svg = buildSvg(geometry, { includeLegend: options.includeLegend, penPlotterMode: options.plotter, backgroundColor: options.backgroundColor, title: resolvedTitle, includePlotterTitle: options.includePlotterTitle });
    const output = options.output.toLowerCase().endsWith('.png') ? new Resvg(svg).render().asPng() : svg;
    await writeFile(options.output, output);
    if (options.manifest) await writeFile(options.manifest, JSON.stringify({ score, config: options.config, output: { width: options.width, height: options.height, backgroundColor: options.backgroundColor, plotter: options.plotter, title: resolvedTitle } }, null, 2) + '\n');
    console.log(`Wrote ${options.output}${options.manifest ? ` and ${options.manifest}` : ''}`);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

function enumValue(value: string, allowed: string[], option: string): string {
  if (!allowed.includes(value)) throw new Error(`${option} must be one of: ${allowed.join(', ')}.`);
  return value;
}

function positiveNumber(value: string, option: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${option} must be a positive number.`);
  return number;
}

function numberInRange(value: string, option: string, minimum: number, maximum: number): number {
  const number = positiveNumber(value, option);
  if (number < minimum || number > maximum) throw new Error(`${option} must be between ${minimum} and ${maximum}.`);
  return number;
}

function integerInRange(value: string, option: string, minimum: number, maximum: number): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error(`${option} must be an integer between ${minimum} and ${maximum}.`);
  return number;
}

void main();
