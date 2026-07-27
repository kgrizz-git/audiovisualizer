export type Variation =
  | 'lines'
  | 'circles'
  | 'vertical_tone'
  | 'tonal_time_lines'
  | 'polar_fan'
  | 'polar_walk'
  | '3d_lines'
  | '3d_note_halos'
  | '3d_note_spheres'
  | '3d_piano_roll'
  | '3d_polar_fan'
  | '3d_polar_walk';

/** True when the variation is rendered by the Three.js 3D renderer rather than Canvas/SVG. */
export function is3DVariation(variation: Variation): boolean {
  return (
    variation === '3d_lines' ||
    variation === '3d_note_halos' ||
    variation === '3d_note_spheres' ||
    variation === '3d_piano_roll' ||
    variation === '3d_polar_fan' ||
    variation === '3d_polar_walk'
  );
}
export type OriginMode = 'left_to_right' | 'center_outward' | 'outside_inward';
export type PitchHueMode = 'pitch_class' | 'register_spiral' | 'voice_palette';
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
  /** True when track is assigned to MIDI channel 10 (0-indexed channel 9). */
  isPercussion: boolean;
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
  /** Visual-only semitone shift, applied to pitch position and pitch-derived color. */
  transposeSemitones: number;
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
  zScale: number; // 3D time-depth factor: total Z depth ≈ canvas width × zScale / 100
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

/** A line segment in 3D space (X/Y from the interval path, Z from musical time). */
export interface GeometrySegment3D {
  startX: number;
  startY: number;
  startZ: number;
  endX: number;
  endY: number;
  endZ: number;
  color: string;
  width: number;
  opacity: number;
  note: NoteEvent;
  role?: 'note' | 'gap';
  dashArray?: string;
}

/** A flat disc (note halo) floating at a Z depth given by its onset time. */
export interface GeometryDisc3D {
  cx: number;
  cy: number;
  cz: number;
  radius: number;
  /** Half the note's Z extent (duration × zScale / 2); the renderer extrudes the disc
   *  along Z by `czExtent` in each direction so notes read as solid from the side. */
  czExtent: number;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
  note: NoteEvent;
}

/** An axis-aligned box (piano-roll slab note). Center + size in world-ish coordinates. */
export interface GeometryBox3D {
  cx: number;
  cy: number;
  cz: number;
  sx: number;
  sy: number;
  sz: number;
  color: string;
  opacity: number;
  note: NoteEvent;
}

/**
 * Geometry for the Three.js 3D visualization family. For 3d_lines/3d_note_halos the X/Y
 * coordinates come from the existing 2D interval/path algorithms; for 3d_piano_roll they
 * are a pitch × voice grid. Z is always musical time (seconds × zScale). Consumers
 * discriminate against RenderedGeometry with the `kind` field. `3d_note_spheres` reuses the
 * same disc geometry as `3d_note_halos`; the renderer draws instanced spheres from it.
 */
export interface RenderedGeometry3D {
  kind: '3d';
  width: number;
  height: number;
  /** Total depth of the score along Z (world units). */
  depth: number;
  /** Effective seconds → world-unit scale actually applied (for playhead placement). */
  zScale: number;
  segments: GeometrySegment3D[]; // populated for 3d_lines
  discs: GeometryDisc3D[];       // populated for 3d_note_halos and 3d_note_spheres
  boxes: GeometryBox3D[];        // populated for 3d_piano_roll
  config: RuleConfig;
  bpm: number;
}

export type AnyRenderedGeometry = RenderedGeometry | RenderedGeometry3D;

/** Narrows AnyRenderedGeometry to the 3D variant. */
export function isRenderedGeometry3D(geometry: AnyRenderedGeometry): geometry is RenderedGeometry3D {
  return (geometry as RenderedGeometry3D).kind === '3d';
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

export type CameraPreset3D = '3d_time_up' | '3d_isometric' | '3d_front' | '3d_side' | '3d_birds_eye' | '3d_free';
export type PlaybackCue3D = 'now_plane' | 'reveal';

/**
 * Orbit angles (degrees) for each fixed camera preset. `3d_time_up` orients the
 * world so the Z (time) axis renders vertically (time advances upward in the
 * view); the renderer pairs it with `camera.up` along world Z.
 */
export const CAMERA_PRESETS_3D: Readonly<Partial<Record<CameraPreset3D, { azimuth: number; elevation: number }>>> = Object.freeze({
  '3d_time_up': { azimuth: 0, elevation: 0 },
  '3d_isometric': { azimuth: 45, elevation: 30 },
  '3d_front': { azimuth: 0, elevation: 0 },
  '3d_side': { azimuth: 90, elevation: 0 },
  '3d_birds_eye': { azimuth: 45, elevation: 80 },
});

export const CAMERA_PRESET_LABELS_3D: Readonly<Record<CameraPreset3D, string>> = Object.freeze({
  '3d_time_up': 'Time up',
  '3d_isometric': 'Isometric',
  '3d_front': 'Front',
  '3d_side': 'Side',
  '3d_birds_eye': "Bird's eye",
  '3d_free': 'Free orbit',
});

export interface ViewportTransform3D {
  preset: CameraPreset3D;
  bloom: number; // 0 = off, ~1.5 = neon
  /** Orthographic zoom. 1 frames the full score; higher values move closer. */
  zoom: number;
  /** Camera orbit in degrees, retained so an adjusted view is reproducible. */
  azimuth: number;
  elevation: number;
  /** Camera target offset in world coordinates. */
  panX: number;
  panY: number;
  autoFollow: boolean;
  chaseCamera: boolean;
  autoRotate: boolean;
  /** Playback visualization: a sweeping plane or a cumulative reveal through depth. */
  playbackCue: PlaybackCue3D;
}

export const DEFAULT_VIEWPORT_3D: Readonly<ViewportTransform3D> = Object.freeze({
  preset: '3d_time_up',
  bloom: 1.4,
  zoom: 1,
  azimuth: 0,
  elevation: 0,
  panX: 0,
  panY: 0,
  autoFollow: false,
  chaseCamera: false,
  autoRotate: false,
  playbackCue: 'reveal',
});
