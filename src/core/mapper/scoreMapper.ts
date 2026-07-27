import {
  Score,
  RuleConfig,
  RenderedGeometry,
  GeometryVoicePath,
  GeometrySegment,
  GeometryCircle,
  GeometryBand,
  Point2D,
  NoteEvent,
} from '../types.js';
import { mapPolyphonicLineSegments, clusterNotesByOnset, centroid, tipPointAt } from './polyphonicLines.js';

export const DEFAULT_CONFIG: RuleConfig = {
  variation: 'lines',
  originMode: 'left_to_right',
  pitchHueMode: 'pitch_class',
  transposeSemitones: 0,
  gapPolicy: 'lift_pen',
  chordLayout: 'polyphony',
  lengthScale: 40,
  angleScale: 180,
  minSegmentLength: 10,
  strokeWidthBase: 2,
  strokeWidthScale: 4,
  hueOffsetPerVoice: 25,
  spiralBias: 0,
  intervalAngleEnabled: true,
  quantizeOnset: false,
  quantizeSubdivision: 4,
  voiceFilter: null,
  timeLineDensity: 1,
  zScale: 100,
};

/**
 * Calculates HSL color from note pitch and rule config.
 */
export function getNoteColor(note: NoteEvent, config: RuleConfig): string {
  const hue = getMappedHue(note, config);
  return `hsl(${Math.round(hue)}, 85%, 60%)`;
}

/** Stable rainbow-adjacent hues used when a voice, rather than pitch, owns its color. */
export const VOICE_PALETTE_HUES = Object.freeze([12, 196, 146, 282, 42, 326, 98, 234, 166, 8, 270, 62]);

/** Pitch used for visual placement and pitch-derived color; MIDI source data remains intact. */
export function getVisualPitch(note: NoteEvent, config: RuleConfig): number {
  return Math.min(127, Math.max(0, note.pitch + config.transposeSemitones));
}

/** Returns the hue used consistently by note and aggregate-time visualizations. */
export function getMappedHue(note: NoteEvent, config: RuleConfig): number {
  if (config.pitchHueMode === 'voice_palette') {
    return VOICE_PALETTE_HUES[Math.abs(note.voice) % VOICE_PALETTE_HUES.length];
  }
  const pitch = getVisualPitch(note, config);
  const sourceHue = config.pitchHueMode === 'pitch_class'
    ? ((pitch % 12) / 12) * 360
    : (pitch * 7) % 360;
  return (sourceHue + note.voice * config.hueOffsetPerVoice + 360) % 360;
}

/**
 * Sum of hue-unit-vectors for the visible notes, each weighted by its sounding
 * duration × velocity, mirroring the "Weight → velocity × sounding overlap"
 * coloring used by `mapTonalTimeBands`. A note that sustains for four beats
 * contributes roughly four times the weight of a grace note, and a fortissimo
 * strike contributes more than a pianissimo touch, so the resulting mean hue
 * matches the perceived average color over the course of the piece rather than
 * a one-note-one-vote centroid. Honors `config.voiceFilter` and applies
 * `quantizeNote` for parity with the tonal-time-lines path. Returns the unit
 * vector accumulator `{ x, y, totalWeight }` (totalWeight is 0 when there are
 * no visible notes).
 */
function weightedHueAccumulator(score: Score, config: RuleConfig): { x: number; y: number; totalWeight: number } {
  const notes = score.tracks
    .filter((track) => config.voiceFilter === null || config.voiceFilter.includes(track.channel))
    .flatMap((track) => track.notes.map((note) => quantizeNote(note, score.bpm, config)));
  let x = 0;
  let y = 0;
  let totalWeight = 0;
  for (const note of notes) {
    const weight = Math.max(0, note.duration) * Math.max(1, note.velocity);
    if (weight <= 0) continue;
    const radians = (getMappedHue(note, config) * Math.PI) / 180;
    x += Math.cos(radians) * weight;
    y += Math.sin(radians) * weight;
    totalWeight += weight;
  }
  return { x, y, totalWeight };
}

/** Returns a dark, readable background based on the duration×velocity-weighted mean of mapped note hues. */
export function getAverageScoreBackground(score: Score, config: RuleConfig): string {
  const { x, y, totalWeight } = weightedHueAccumulator(score, config);
  if (totalWeight === 0) return '#000000';
  const hue = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return `hsl(${Math.round(hue)}, 32%, 9%)`;
}

/** One bright mapped accent per visible track, for the dark Canvas atmosphere. */
export function getTrackAverageAccents(score: Score, config: RuleConfig): string[] {
  return score.tracks
    .filter((track) => config.voiceFilter === null || config.voiceFilter.includes(track.channel))
    .map((track) => {
      if (track.notes.length === 0) return null;
      const average = track.notes.reduce((sum, note) => {
        const radians = getMappedHue(note, config) * Math.PI / 180;
        return { x: sum.x + Math.cos(radians), y: sum.y + Math.sin(radians) };
      }, { x: 0, y: 0 });
      const hue = (Math.atan2(average.y, average.x) * 180 / Math.PI + 360) % 360;
      return `hsl(${Math.round(hue)}, 85%, 60%)`;
    })
    .filter((color): color is string => color !== null);
}

/**
 * One single merged accent for the black-background atmosphere, derived from
 * the duration×velocity-weighted circular mean of mapped note hues across all
 * visible tracks. This mirrors the "Weight → velocity × sounding overlap"
 * coloring already used by the tonal-time-lines bands, so a sustained or loudly
 * struck note carries proportionally more influence than a grace note, and the
 * accent reflects the perceived average color of the piece. Returns a bright
 * HSL string, or null when no visible notes exist.
 */
export function getDominantScoreAccent(score: Score, config: RuleConfig): string | null {
  const { x, y, totalWeight } = weightedHueAccumulator(score, config);
  if (totalWeight === 0) return null;
  const hue = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return `hsl(${Math.round(hue)}, 85%, 60%)`;
}

/**
 * Maps a Score and RuleConfig to a fully calculated RenderedGeometry object.
 */
export function mapScoreToGeometry(
  score: Score,
  config: RuleConfig = DEFAULT_CONFIG,
  targetWidth: number = 1000,
  targetHeight: number = 1000
): RenderedGeometry {
  if (config.variation === 'tonal_time_lines') {
    return {
      width: targetWidth,
      height: targetHeight,
      voicePaths: [],
      bands: mapTonalTimeBands(score, config, targetHeight),
      config,
      bpm: score.bpm,
    };
  }

    if (config.variation === 'radial_voice_paths') {
    return mapRadialVoicePaths(score, config, targetWidth, targetHeight);
  }

  const voicePaths: GeometryVoicePath[] = [];

  score.tracks.forEach((track) => {
    if (track.notes.length === 0) return;
    if (config.voiceFilter !== null && !config.voiceFilter.includes(track.channel)) return;

    const segments: GeometrySegment[] = [];
    const circles: GeometryCircle[] = [];

    // Calculate initial cursor based on origin mode
    let cursor: Point2D = config.variation === 'polar_walk'
      ? { x: targetWidth / 2, y: targetHeight / 2 }
      : getInitialCursor(config.originMode, targetWidth, targetHeight, track.channel);
    let headingAngle = getInitialHeading(config.originMode, track.channel);

    let prevNote: NoteEvent | null = null;

    const notes = [...track.notes]
      .sort((a, b) => a.onset - b.onset || a.id.localeCompare(b.id))
      .map((note) => quantizeNote(note, score.bpm, config));

    if (config.variation === 'lines' && config.chordLayout === 'polyphony') {
      const origin = getInitialCursor(config.originMode, targetWidth, targetHeight, track.channel);
      const heading = getInitialHeading(config.originMode, track.channel);
      segments.push(...mapPolyphonicLineSegments(notes, config, origin, heading));
    } else if (config.variation === 'polar_walk' && config.chordLayout === 'polyphony') {
      const origin = { x: targetWidth / 2, y: targetHeight / 2 };
      segments.push(...mapPolyphonicPolarWalkSegments(notes, config, origin));
    } else {
    notes.forEach((note) => {
      const color = getNoteColor(note, config);
      const strokeWidth = config.strokeWidthBase + (note.velocity / 127) * config.strokeWidthScale;
      const segmentLen = Math.max(config.minSegmentLength, note.duration * config.lengthScale);

      if (config.variation === 'lines') {
        addGapSegment(segments, cursor, prevNote, note, headingAngle, config);
        if (prevNote !== null) {
          cursor = advanceCursorForGap(cursor, prevNote, note, headingAngle, config);
        }
        headingAngle = applyIntervalTurn(headingAngle, prevNote, note, config);

        const rad = (headingAngle * Math.PI) / 180;
        const endPoint: Point2D = {
          x: cursor.x + Math.cos(rad) * segmentLen,
          y: cursor.y + Math.sin(rad) * segmentLen,
        };

        segments.push({
          start: { ...cursor },
          end: { ...endPoint },
          color,
          width: strokeWidth,
          opacity: 0.9,
          note,
        });

        cursor = endPoint;
      } else if (config.variation === 'circles') {
        addGapSegment(segments, cursor, prevNote, note, headingAngle, config);
        if (prevNote !== null) {
          cursor = advanceCursorForGap(cursor, prevNote, note, headingAngle, config);
        }
        // Same heading rule as lines: straight on the origin heading, or turn by interval.
        headingAngle = applyIntervalTurn(headingAngle, prevNote, note, config);
        const radius = Math.max(5, segmentLen * 0.4);
        const rad = (headingAngle * Math.PI) / 180;

        const centerPoint: Point2D = {
          x: cursor.x + Math.cos(rad) * segmentLen,
          y: cursor.y + Math.sin(rad) * segmentLen,
        };

        circles.push({
          center: centerPoint,
          radius,
          fillColor: color,
          strokeColor: '#ffffff',
          strokeWidth: 1.5,
          opacity: 0.75,
          note,
        });

        cursor = centerPoint;
      } else if (config.variation === 'polar_fan') {
        const visualPitch = getVisualPitch(note, config);
        const transposedPitchClass = visualPitch % 12;
        const angle = (transposedPitchClass * 30 * Math.PI) / 180;
        const length = Math.max(config.minSegmentLength, note.duration * config.lengthScale);
        const origin = { x: targetWidth / 2, y: targetHeight / 2 };

        segments.push({
          start: origin,
          end: {
            x: origin.x + Math.cos(angle) * length,
            y: origin.y + Math.sin(angle) * length,
          },
          color,
          width: strokeWidth,
          opacity: 0.9,
          note,
        });
      } else if (config.variation === 'polar_walk') {
        const visualPitch = getVisualPitch(note, config);
        const transposedPitchClass = visualPitch % 12;
        const angle = (transposedPitchClass * 30 * Math.PI) / 180;
        const length = Math.max(config.minSegmentLength, note.duration * config.lengthScale);

        if (prevNote !== null) {
          const gapDuration = getGapDuration(prevNote, note);
          if (gapDuration > 0) {
            const prevVisualPitch = getVisualPitch(prevNote, config);
            const prevAngle = ((prevVisualPitch % 12) * 30 * Math.PI) / 180;
            const gapLength = gapDuration * config.lengthScale;
            const gapEnd: Point2D = {
              x: cursor.x + Math.cos(prevAngle) * gapLength,
              y: cursor.y + Math.sin(prevAngle) * gapLength,
            };

            if (config.gapPolicy !== 'lift_pen') {
              const gapNote: NoteEvent = { ...prevNote, id: `${prevNote.id}-gap`, onset: prevNote.onset + prevNote.duration, duration: gapDuration };
              segments.push({
                start: { ...cursor },
                end: gapEnd,
                note: gapNote,
                role: 'gap',
                color: config.gapPolicy === 'ghost' ? '#94a3b8' : getNoteColor(prevNote, config),
                width: Math.max(1, config.strokeWidthBase * 0.75),
                opacity: config.gapPolicy === 'ghost' ? 0.18 : 0.32,
                dashArray: config.gapPolicy === 'ghost' ? '3 8' : undefined,
              });
            }
            cursor = gapEnd;
          }
        }

        const endPoint: Point2D = {
          x: cursor.x + Math.cos(angle) * length,
          y: cursor.y + Math.sin(angle) * length,
        };

        segments.push({
          start: { ...cursor },
          end: { ...endPoint },
          color,
          width: strokeWidth,
          opacity: 0.9,
          note,
        });

        cursor = endPoint;
      } else {
        throw new Error(`Unhandled variation: ${config.variation}`);
      }

      prevNote = note;
    });
    }

    voicePaths.push({
      voice: track.channel,
      voiceName: track.name,
      segments,
      circles,
    });
  });

  return {
    width: targetWidth,
    height: targetHeight,
    voicePaths,
    bands: [],
    config,
    bpm: score.bpm,
  };
}

/**
 * Samples the score from top to bottom. Each band is a time bin, colored by the
 * circular, velocity- and overlap-weighted mean of the active note hues.
 */
function mapTonalTimeBands(score: Score, config: RuleConfig, targetHeight: number): GeometryBand[] {
  const bandCount = Math.max(1, Math.round(targetHeight * config.timeLineDensity));
  const scoreDuration = Math.max(score.duration, 0.01);
  const binDuration = scoreDuration / bandCount;
  const notes = score.tracks
    .filter((track) => config.voiceFilter === null || config.voiceFilter.includes(track.channel))
    .flatMap((track) => track.notes.map((note) => quantizeNote(note, score.bpm, config)));

  return Array.from({ length: bandCount }, (_, index) => {
    const onset = index * binDuration;
    const end = onset + binDuration;
    let x = 0;
    let y = 0;
    let totalWeight = 0;

    notes.forEach((note) => {
      const overlap = Math.max(0, Math.min(end, note.onset + note.duration) - Math.max(onset, note.onset));
      if (overlap === 0) return;
      const weight = overlap * Math.max(1, note.velocity);
      const radians = getMappedHue(note, config) * Math.PI / 180;
      x += Math.cos(radians) * weight;
      y += Math.sin(radians) * weight;
      totalWeight += weight;
    });

    const silent = totalWeight === 0;
    const hue = silent ? 0 : (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    return {
      y: index * targetHeight / bandCount,
      height: targetHeight / bandCount,
      color: silent ? 'rgb(226, 232, 240)' : `hsl(${Math.round(hue)}, 85%, 60%)`,
      opacity: silent ? 0.10 : 0.92,
      onset,
      duration: binDuration,
      silent,
    };
  });
}

function quantizeNote(note: NoteEvent, bpm: number, config: RuleConfig): NoteEvent {
  if (!config.quantizeOnset || bpm <= 0 || config.quantizeSubdivision <= 0) return note;
  const gridSeconds = 60 / bpm / config.quantizeSubdivision;
  return { ...note, onset: Math.round(note.onset / gridSeconds) * gridSeconds };
}

/** General MIDI percussion families → ring stroke colors for radial_voice_paths. */
const PERCUSSION_FAMILY_COLORS: ReadonlyArray<{ pitches: readonly number[]; color: string }> = [
  { pitches: [35, 36], color: 'hsl(0, 85%, 60%)' },                   // kick/bass drum — red
  { pitches: [38, 39, 40], color: 'hsl(30, 85%, 60%)' },              // snare/clap — orange
  { pitches: [42, 44, 46], color: 'hsl(190, 85%, 60%)' },             // hi-hat — cyan
  { pitches: [49, 51, 53], color: 'hsl(55, 85%, 60%)' },              // cymbals — yellow
  { pitches: [41, 43, 45, 47, 48, 50], color: 'hsl(140, 85%, 60%)' }, // toms — green
];

/** Best-effort GM percussion family color; unknown percussion values fall back to grey. */
export function getPercussionColor(pitch: number): string {
  for (const family of PERCUSSION_FAMILY_COLORS) {
    if (family.pitches.includes(pitch)) return family.color;
  }
  return 'hsl(0, 0%, 62%)';
}

export interface RadialSpoke {
  /** Spoke direction in degrees, y-up math convention (90 = screen top, 270 = screen bottom). */
  angle: number;
  /** Number of voices sharing this spoke's base angle (drives 1/n opacity scaling). */
  voicesOnSpoke: number;
}

/**
 * Assigns each pitched voice a fixed radial spoke direction from its median pitch.
 * Voices are ranked by median pitch: the lowest register points down (270°), the
 * highest points up (90°), and intermediate registers alternate between the right
 * (270° → 90° through 0°) and left (270° → 90° through 180°) branches so the
 * vertical component rises with register on both sides. Voices sharing a median
 * pitch share a spoke and are fanned apart by ±2° steps; when more than 12 distinct
 * medians exist, neighbours are grouped into 12 spoke slots the same way. A single
 * voice (or a single shared median) points laterally right (0°). Deterministic:
 * ties in median pitch are broken by voice id.
 */
export function computeRadialVoiceAngles(
  voices: ReadonlyArray<{ voice: number; medianPitch: number }>,
): Map<number, RadialSpoke> {
  const result = new Map<number, RadialSpoke>();
  if (voices.length === 0) return result;
  const sorted = [...voices].sort((a, b) => a.medianPitch - b.medianPitch || a.voice - b.voice);
  const distinctMedians = [...new Set(sorted.map((entry) => entry.medianPitch))];
  const slotCount = Math.min(distinctMedians.length, 12);
  const slotOfMedian = new Map<number, number>();
  distinctMedians.forEach((median, k) => {
    slotOfMedian.set(median, distinctMedians.length > 12 ? Math.floor((k * slotCount) / distinctMedians.length) : k);
  });

  const slots = new Map<number, number[]>();
  sorted.forEach((entry) => {
    const slot = slotOfMedian.get(entry.medianPitch)!;
    const members = slots.get(slot);
    if (members) members.push(entry.voice);
    else slots.set(slot, [entry.voice]);
  });

  slots.forEach((members, slot) => {
    const t = slotCount === 1 ? 0.5 : slot / (slotCount - 1);
    const baseAngle = slot % 2 === 0 ? (270 + 180 * t) % 360 : (270 - 180 * t + 360) % 360;
    members.forEach((voice, j) => {
      result.set(voice, {
        angle: baseAngle + (j - (members.length - 1) / 2) * 4,
        voicesOnSpoke: members.length,
      });
    });
  });
  return result;
}

/** Median of the visual (transposed) pitches of a voice's notes. */
function medianVisualPitch(notes: NoteEvent[], config: RuleConfig): number {
  const pitches = notes.map((note) => getVisualPitch(note, config)).sort((a, b) => a - b);
  const mid = Math.floor(pitches.length / 2);
  return pitches.length % 2 === 1 ? pitches[mid] : (pitches[mid - 1] + pitches[mid]) / 2;
}

/**
 * Radial voice-path layout: every pitched voice owns a fixed spoke direction derived
 * from its register (bass down, treble up — see computeRadialVoiceAngles), and each
 * note becomes a standard GeometrySegment along that spoke: radial start/end encode
 * onset/offset as a fraction of the score duration, and a ±5°-clamped angular offset
 * (1° per semitone from the voice's median) fans chords and runs slightly apart.
 * Percussion voices (channel 10 or the track percussion flag) skip spoke assignment
 * entirely and render as stroke-only concentric GeometryCircle rings centered on the
 * canvas, radius proportional to onset time and color keyed to the GM family.
 */
export function mapRadialVoicePaths(
  score: Score,
  config: RuleConfig,
  targetWidth: number,
  targetHeight: number,
): RenderedGeometry {
  const origin: Point2D = { x: targetWidth / 2, y: targetHeight / 2 };
  const maxRadius = Math.min(targetWidth, targetHeight) * 0.45;
  const scoreDuration = Math.max(score.duration, 0.01);

  const prepared = score.tracks
    .filter((track) => track.notes.length > 0 && (config.voiceFilter === null || config.voiceFilter.includes(track.channel)))
    .map((track) => ({
      track,
      isPercussion: track.isPercussion || track.channel === 9,
      notes: [...track.notes]
        .sort((a, b) => a.onset - b.onset || a.id.localeCompare(b.id))
        .map((note) => quantizeNote(note, score.bpm, config)),
    }));

  const pitched = prepared.filter((entry) => !entry.isPercussion);
  const medians = pitched.map((entry, index) => ({ voice: index, medianPitch: medianVisualPitch(entry.notes, config) }));
  const spokes = computeRadialVoiceAngles(medians);

  const voicePaths: GeometryVoicePath[] = prepared.map((entry) => {
    const segments: GeometrySegment[] = [];
    const circles: GeometryCircle[] = [];

    if (entry.isPercussion) {
      entry.notes.forEach((note) => {
        circles.push({
          center: { ...origin },
          // Floor keeps beat-one hits (onset 0) visible as a small central ring.
          radius: Math.max(4, (note.onset / scoreDuration) * maxRadius),
          fillColor: 'none',
          strokeColor: getPercussionColor(note.pitch),
          strokeWidth: Math.max(1, config.strokeWidthBase + (note.velocity / 127) * config.strokeWidthScale),
          opacity: 0.85,
          note,
          isPercussion: true,
        });
      });
    } else {
      const pitchedIndex = pitched.indexOf(entry);
      const spoke = spokes.get(pitchedIndex)!;
      const median = medians[pitchedIndex].medianPitch;
      entry.notes.forEach((note) => {
        // 1° per semitone from the voice median, clamped to ±5° to keep the spoke coherent.
        const pitchOffset = Math.max(-5, Math.min(5, getVisualPitch(note, config) - median));
        const radians = ((spoke.angle + pitchOffset) * Math.PI) / 180;
        // Angles use the y-up convention; canvas y grows downward, hence the negated sin.
        const direction = { x: Math.cos(radians), y: -Math.sin(radians) };
        const rStart = (note.onset / scoreDuration) * maxRadius;
        const rEnd = ((note.onset + note.duration) / scoreDuration) * maxRadius;
        segments.push({
          start: { x: origin.x + direction.x * rStart, y: origin.y + direction.y * rStart },
          end: { x: origin.x + direction.x * rEnd, y: origin.y + direction.y * rEnd },
          color: getNoteColor(note, config),
          width: config.strokeWidthBase + (note.velocity / 127) * config.strokeWidthScale,
          // Dense shared spokes dim proportionally so sparse voices stay legible.
          opacity: 0.9 / spoke.voicesOnSpoke,
          note,
        });
      });
    }

    return { voice: entry.track.channel, voiceName: entry.track.name, segments, circles };
  });

  return { width: targetWidth, height: targetHeight, voicePaths, bands: [], config, bpm: score.bpm };
}

function getGapDuration(previous: NoteEvent | null, next: NoteEvent): number {
  if (!previous) return 0;
  return Math.max(0, next.onset - (previous.onset + previous.duration));
}

/**
 * Turns the path heading from the melodic interval into the arriving note.
 * `angleScale` is degrees per octave; each semitone contributes angleScale / 12.
 * When interval turns are off, heading is unchanged (straight along the origin direction).
 */
function applyIntervalTurn(heading: number, previous: NoteEvent | null, note: NoteEvent, config: RuleConfig): number {
  if (previous === null || !config.intervalAngleEnabled) return heading;
  const interval = note.pitch - previous.pitch;
  return heading + interval * (config.angleScale / 12) + config.spiralBias;
}

function advanceCursorForGap(cursor: Point2D, previous: NoteEvent, next: NoteEvent, heading: number, config: RuleConfig): Point2D {
  const gapDuration = getGapDuration(previous, next);
  if (gapDuration === 0) return cursor;
  const length = gapDuration * config.lengthScale;
  const radians = (heading * Math.PI) / 180;
  return { x: cursor.x + Math.cos(radians) * length, y: cursor.y + Math.sin(radians) * length };
}

function addGapSegment(segments: GeometrySegment[], cursor: Point2D, previous: NoteEvent | null, next: NoteEvent, heading: number, config: RuleConfig): void {
  const gapDuration = getGapDuration(previous, next);
  if (!previous || gapDuration === 0 || config.gapPolicy === 'lift_pen') return;
  const end = advanceCursorForGap(cursor, previous, next, heading, config);
  const gapNote: NoteEvent = { ...previous, id: `${previous.id}-gap`, onset: previous.onset + previous.duration, duration: gapDuration };
  segments.push({
    start: { ...cursor }, end, note: gapNote, role: 'gap',
    color: config.gapPolicy === 'ghost' ? '#94a3b8' : getNoteColor(previous, config),
    width: Math.max(1, config.strokeWidthBase * 0.75),
    opacity: config.gapPolicy === 'ghost' ? 0.18 : 0.32,
    dashArray: config.gapPolicy === 'ghost' ? '3 8' : undefined,
  });
}

function getInitialCursor(mode: string, width: number, height: number, channel: number): Point2D {
  if (mode === 'center_outward') {
    return { x: width / 2, y: height / 2 };
  } else if (mode === 'outside_inward') {
    const angle = (channel * 45) % 360;
    const rad = (angle * Math.PI) / 180;
    const r = Math.min(width, height) * 0.45;
    return {
      x: width / 2 + Math.cos(rad) * r,
      y: height / 2 + Math.sin(rad) * r,
    };
  } else {
    // left_to_right default
    const yOffset = (channel * 60) % (height * 0.6);
    return { x: 50, y: height * 0.2 + yOffset };
  }
}

function getInitialHeading(mode: string, channel: number): number {
  if (mode === 'center_outward') {
    return (channel * 60) % 360;
  } else if (mode === 'outside_inward') {
    return ((channel * 45 + 180) % 360);
  }
  return 0; // 0 degrees = right
}

export function mapPolyphonicPolarWalkSegments(
  notes: NoteEvent[],
  config: RuleConfig,
  origin: Point2D
): GeometrySegment[] {
  const segments: GeometrySegment[] = [];
  const clusters = clusterNotesByOnset(notes);
  let activeTips: {
    noteId: string;
    start: Point2D;
    end: Point2D;
    soundingUntil: number;
    note: NoteEvent;
  }[] = [];

  let cursor = { ...origin };
  let lastSoundingEnd: number | null = null;
  let lastNoteForGap: NoteEvent | null = null;

  for (const cluster of clusters) {
    const t = cluster[0].onset;

    // Drop notes that have finished sounding
    const dropped = activeTips.filter((tip) => tip.soundingUntil <= t);
    if (dropped.length > 0) {
      activeTips = activeTips.filter((tip) => tip.soundingUntil > t);
      const droppedEnd = Math.max(...dropped.map((tip) => tip.soundingUntil));
      lastSoundingEnd = lastSoundingEnd === null ? droppedEnd : Math.max(lastSoundingEnd, droppedEnd);
      if (activeTips.length === 0) {
        cursor = centroid(dropped.map((tip) => tip.end));
      }
    }

    let join: Point2D;
    if (activeTips.length === 0) {
      // Gap handling: if no active tips, check if there was a rest since the last sounding note ended
      if (lastSoundingEnd !== null && t > lastSoundingEnd && lastNoteForGap !== null) {
        const gapDuration = t - lastSoundingEnd;
        const prevVisualPitch = getVisualPitch(lastNoteForGap, config);
        const prevAngle = ((prevVisualPitch % 12) * 30 * Math.PI) / 180;
        const gapLength = gapDuration * config.lengthScale;
        const gapEnd: Point2D = {
          x: cursor.x + Math.cos(prevAngle) * gapLength,
          y: cursor.y + Math.sin(prevAngle) * gapLength,
        };

        if (config.gapPolicy !== 'lift_pen') {
          const gapNote: NoteEvent = { ...lastNoteForGap, id: `${lastNoteForGap.id}-gap`, onset: lastSoundingEnd, duration: gapDuration };
          segments.push({
            start: { ...cursor },
            end: gapEnd,
            note: gapNote,
            role: 'gap',
            color: config.gapPolicy === 'ghost' ? '#94a3b8' : getNoteColor(lastNoteForGap, config),
            width: Math.max(1, config.strokeWidthBase * 0.75),
            opacity: config.gapPolicy === 'ghost' ? 0.18 : 0.32,
            dashArray: config.gapPolicy === 'ghost' ? '3 8' : undefined,
          });
        }
        cursor = gapEnd;
      }
      join = { ...cursor };
    } else if (activeTips.length === 1) {
      const tip = activeTips[0];
      join = tipPointAt(tip.start, tip.end, tip.note.onset, tip.note.duration, t);
    } else {
      join = centroid(
        activeTips.map((tip) => tipPointAt(tip.start, tip.end, tip.note.onset, tip.note.duration, t))
      );
    }

    for (const note of cluster) {
      const visualPitch = getVisualPitch(note, config);
      const transposedPitchClass = visualPitch % 12;
      const angle = (transposedPitchClass * 30 * Math.PI) / 180;
      const length = Math.max(config.minSegmentLength, note.duration * config.lengthScale);

      const end: Point2D = {
        x: join.x + Math.cos(angle) * length,
        y: join.y + Math.sin(angle) * length,
      };

      const strokeWidth = config.strokeWidthBase + (note.velocity / 127) * config.strokeWidthScale;
      segments.push({
        start: { ...join },
        end,
        color: getNoteColor(note, config),
        width: strokeWidth,
        opacity: 0.9,
        note,
      });

      activeTips.push({
        noteId: note.id,
        start: { ...join },
        end,
        soundingUntil: note.onset + note.duration,
        note,
      });

      lastNoteForGap = note;
    }
  }

  return segments;
}

