export type Variation = 'lines' | 'circles' | 'vertical_tone' | 'tonal_time_lines';
export type OriginMode = 'left_to_right' | 'center_outward' | 'outside_inward';
export type PitchHueMode = 'pitch_class' | 'register_spiral';
export type GapPolicy = 'lift_pen' | 'faint_line' | 'ghost';
export type ChordLayout = 'chain' | 'polyphony';

export interface NoteEvent {
  id: string;
  pitch: number;      // MIDI note number (0 - 127)
  onset: number;      // Time in seconds
  duration: number;   // Duration in seconds
  velocity: number;   // 0 - 127
  voice: number;      // MIDI channel or track index
  pitchClass: number; // midi % 12 (0 = C, 1 = C#, ...)
}

export interface SustainEvent {
  time: number;  // seconds
  value: number; // 0-127; >= 64 = pedal down
}

export interface TrackScore {
  name: string;
  channel: number;
  program: number;
  instrumentName: string;
  notes: NoteEvent[];
  sustainEvents?: SustainEvent[];
}

export interface Score {
  title: string;
  duration: number; // Total duration in seconds
  bpm: number;
  tracks: TrackScore[];
}

export interface RuleConfig {
  variation: Variation;
  originMode: OriginMode;
  pitchHueMode: PitchHueMode;
  gapPolicy: GapPolicy;
  chordLayout: ChordLayout;
  lengthScale: number;    // pixels per second
  angleScale: number;     // degrees of path turn per octave (12 semitones)
  minSegmentLength: number;
  strokeWidthBase: number;
  strokeWidthScale: number;
  hueOffsetPerVoice: number;
  spiralBias: number;     // curvature constant for spiral submode
  intervalAngleEnabled: boolean;
  quantizeOnset: boolean; // snap onsets to the configured beat subdivision
  quantizeSubdivision: number;
  voiceFilter: number[] | null; // null means include every voice
  timeLineDensity: number; // sampled bands per output pixel row
}

export interface Point2D {
  x: number;
  y: number;
}

export interface GeometrySegment {
  start: Point2D;
  end: Point2D;
  color: string;
  width: number;
  opacity: number;
  note: NoteEvent;
  role?: 'note' | 'gap';
  dashArray?: string;
}

export interface GeometryCircle {
  center: Point2D;
  radius: number;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
  note: NoteEvent;
}

/** A full-width time slice used by the tonal time-lines variation. */
export interface GeometryBand {
  y: number;
  height: number;
  color: string;
  opacity: number;
  onset: number;
  duration: number;
  silent: boolean;
}

export interface GeometryVoicePath {
  voice: number;
  voiceName: string;
  segments: GeometrySegment[];
  circles: GeometryCircle[];
}

export type AutoZoomWindowMode = 'musical' | 'time';

export interface RenderedGeometry {
  width: number;
  height: number;
  voicePaths: GeometryVoicePath[];
  bands: GeometryBand[];
  config: RuleConfig;
  /** Score tempo used for musical window conversion (beats per minute). */
  bpm: number;
}

export interface LegendItem {
  label: string;
  color?: string;
  samplePath?: Point2D[];
  description: string;
}

export interface LegendSpec {
  title: string;
  pitchColors: { pitchName: string; hue: number; hex: string }[];
  rulesSummary: string[];
}

export interface ViewportTransform {
  zoom: number;
  panX: number;
  panY: number;
  autoZoom: boolean;
  autoZoomMode: AutoZoomWindowMode;
  /** Musical window in bars (4/4). Use Infinity for full track. */
  autoZoomWindowBars: number;
  /** Wall-clock window in seconds. Use Infinity for full track. */
  autoZoomWindowSeconds: number;
}

export const DEFAULT_VIEWPORT: Readonly<ViewportTransform> = Object.freeze({
  zoom: 1,
  panX: 0,
  panY: 0,
  autoZoom: true,
  autoZoomMode: 'musical',
  autoZoomWindowBars: 4,
  autoZoomWindowSeconds: 3,
});

export function clampZoom(zoom: number): number {
  if (Number.isNaN(zoom)) return 1;
  return Math.min(10.0, Math.max(0.25, zoom));
}

