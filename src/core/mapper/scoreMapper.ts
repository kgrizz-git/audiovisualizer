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

export const DEFAULT_CONFIG: RuleConfig = {
  variation: 'lines',
  originMode: 'left_to_right',
  pitchHueMode: 'pitch_class',
  gapPolicy: 'lift_pen',
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
};

/**
 * Calculates HSL color from note pitch and rule config.
 */
export function getNoteColor(note: NoteEvent, config: RuleConfig): string {
  const hue = getMappedHue(note, config);
  return `hsl(${Math.round(hue)}, 85%, 60%)`;
}

/** Returns the hue used consistently by note and aggregate-time visualizations. */
export function getMappedHue(note: NoteEvent, config: RuleConfig): number {
  const sourceHue = config.pitchHueMode === 'pitch_class'
    ? (note.pitchClass / 12) * 360
    : (note.pitch * 7) % 360;
  return (sourceHue + note.voice * config.hueOffsetPerVoice + 360) % 360;
}

/** Returns a dark, readable background based on the circular average of mapped note hues. */
export function getAverageScoreBackground(score: Score, config: RuleConfig): string {
  const notes = score.tracks
    .filter((track) => config.voiceFilter === null || config.voiceFilter.includes(track.channel))
    .flatMap((track) => track.notes);
  if (notes.length === 0) return '#000000';
  const average = notes.reduce((sum, note) => {
    const radians = getMappedHue(note, config) * Math.PI / 180;
    return { x: sum.x + Math.cos(radians), y: sum.y + Math.sin(radians) };
  }, { x: 0, y: 0 });
  const hue = (Math.atan2(average.y, average.x) * 180 / Math.PI + 360) % 360;
  return `hsl(${Math.round(hue)}, 32%, 9%)`;
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
    };
  }

  const voicePaths: GeometryVoicePath[] = [];

  score.tracks.forEach((track) => {
    if (track.notes.length === 0) return;
    if (config.voiceFilter !== null && !config.voiceFilter.includes(track.channel)) return;

    const segments: GeometrySegment[] = [];
    const circles: GeometryCircle[] = [];

    // Calculate initial cursor based on origin mode
    let cursor: Point2D = getInitialCursor(config.originMode, targetWidth, targetHeight, track.channel);
    let headingAngle = getInitialHeading(config.originMode, track.channel);

    let prevNote: NoteEvent | null = null;

    const notes = [...track.notes]
      .sort((a, b) => a.onset - b.onset || a.id.localeCompare(b.id))
      .map((note) => quantizeNote(note, score.bpm, config));

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
      } else if (config.variation === 'vertical_tone') {
        // X = time onset, Y = pitch height (low pitch at bottom, high at top)
        const timeFraction = note.onset / (score.duration || 1);
        const x = 50 + timeFraction * (targetWidth - 100);
        const y = targetHeight - 50 - ((note.pitch - 24) / 84) * (targetHeight - 100);

        const endX = x + segmentLen;

        segments.push({
          start: { x, y },
          end: { x: endX, y },
          color,
          width: strokeWidth * 1.5,
          opacity: 0.85,
          note,
        });
      }

      prevNote = note;
    });

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
