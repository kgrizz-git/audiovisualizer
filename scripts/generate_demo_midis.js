/**
 * generate_demo_midis.js
 *
 * Builds small, redistributable educational MIDI style-studies for the studio
 * dropdown. Full public-domain works (Bach, Mozart, Joplin, Bowman) are bundled
 * separately from Mutopia / Wikimedia and must not be overwritten here.
 *
 * Inputs: none (procedural original studies only).
 * Outputs: .mid files under public/demo-midi/.
 * Requirements: Node 18+, @tonejs/midi.
 */
import pkg from '@tonejs/midi';
const { Midi } = pkg;
import * as fs from 'fs';
import * as path from 'path';

const outputDir = path.resolve('public/demo-midi');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function writeMidi(filename, buffer) {
  fs.writeFileSync(path.join(outputDir, filename), buffer);
}

function addNotes(track, notes, { start = 0, velocity = 0.8, gapScale = 0.9 } = {}) {
  let time = start;
  for (const note of notes) {
    const pitch = note.pitch ?? note[0];
    const dur = note.dur ?? note[1];
    const vel = note.velocity ?? velocity;
    track.addNote({
      midi: pitch,
      time,
      duration: Math.max(0.05, dur * gapScale),
      velocity: vel,
    });
    time += dur;
  }
  return time;
}

function addChordHits(track, hits) {
  for (const hit of hits) {
    for (const pitch of hit.pitches) {
      track.addNote({
        midi: pitch,
        time: hit.time,
        duration: hit.dur,
        velocity: hit.velocity ?? 0.8,
      });
    }
  }
}

/** Historical short study generator. Do not overwrite *_full.mid Mutopia assets. */
function generateBachPrelude() {
  const midi = new Midi();
  midi.header.name = 'Bach - Prelude in C Major (BWV 846)';
  midi.header.setTempo(72);

  const track1 = midi.addTrack();
  track1.name = 'Right Hand';
  const track2 = midi.addTrack();
  track2.name = 'Left Hand';

  const chords = [
    { bass: [48, 52], treble: [55, 60, 64] },
    { bass: [48, 50], treble: [57, 62, 65] },
    { bass: [47, 50], treble: [55, 62, 65] },
    { bass: [48, 52], treble: [55, 60, 64] },
    { bass: [48, 52], treble: [57, 64, 69] },
    { bass: [48, 50], treble: [54, 57, 62] },
    { bass: [47, 50], treble: [55, 62, 65] },
  ];

  let time = 0;
  chords.forEach((chord) => {
    for (let repeat = 0; repeat < 2; repeat++) {
      track2.addNote({ midi: chord.bass[0], time: time, duration: 2.0, velocity: 0.7 });
      track2.addNote({ midi: chord.bass[1], time: time + 0.25, duration: 1.75, velocity: 0.7 });

      const [t1, t2, t3] = chord.treble;
      const pattern = [t1, t2, t3, t2, t3];
      pattern.forEach((pitch, idx) => {
        track1.addNote({
          midi: pitch,
          time: time + 0.25 + idx * 0.25,
          duration: 0.22,
          velocity: 0.85,
        });
      });
      time += 1.0;
    }
  });

  return Buffer.from(midi.toArray());
}

function generateFurElise() {
  const midi = new Midi();
  midi.header.name = 'Beethoven - Für Elise';
  midi.header.setTempo(130);

  const track = midi.addTrack();
  track.name = 'Theme Melody';

  const notes = [
    { pitch: 76, dur: 0.25 }, { pitch: 75, dur: 0.25 }, { pitch: 76, dur: 0.25 },
    { pitch: 75, dur: 0.25 }, { pitch: 76, dur: 0.25 }, { pitch: 71, dur: 0.25 },
    { pitch: 74, dur: 0.25 }, { pitch: 72, dur: 0.25 }, { pitch: 69, dur: 0.75 },

    { pitch: 60, dur: 0.25 }, { pitch: 64, dur: 0.25 }, { pitch: 69, dur: 0.25 },
    { pitch: 71, dur: 0.75 },

    { pitch: 64, dur: 0.25 }, { pitch: 68, dur: 0.25 }, { pitch: 71, dur: 0.25 },
    { pitch: 72, dur: 0.75 },

    { pitch: 64, dur: 0.25 }, { pitch: 76, dur: 0.25 }, { pitch: 75, dur: 0.25 },
    { pitch: 76, dur: 0.25 }, { pitch: 75, dur: 0.25 }, { pitch: 76, dur: 0.25 },
    { pitch: 71, dur: 0.25 }, { pitch: 74, dur: 0.25 }, { pitch: 72, dur: 0.25 },
    { pitch: 69, dur: 0.75 },
  ];

  addNotes(track, notes);
  return Buffer.from(midi.toArray());
}

function generateNachtmusik() {
  const midi = new Midi();
  midi.header.name = 'Mozart - Eine kleine Nachtmusik';
  midi.header.setTempo(140);

  const track = midi.addTrack();
  track.name = 'Violin I';

  const notes = [
    { pitch: 67, dur: 0.5 }, { pitch: 60, dur: 0.25 }, { pitch: 67, dur: 0.5 }, { pitch: 60, dur: 0.25 },
    { pitch: 67, dur: 0.25 }, { pitch: 71, dur: 0.25 }, { pitch: 74, dur: 0.5 },
    { pitch: 69, dur: 0.5 }, { pitch: 62, dur: 0.25 }, { pitch: 69, dur: 0.5 }, { pitch: 62, dur: 0.25 },
    { pitch: 69, dur: 0.25 }, { pitch: 71, dur: 0.25 }, { pitch: 74, dur: 0.5 },
    { pitch: 67, dur: 0.25 }, { pitch: 67, dur: 0.25 }, { pitch: 67, dur: 0.25 }, { pitch: 71, dur: 0.25 },
    { pitch: 74, dur: 0.25 }, { pitch: 74, dur: 0.25 }, { pitch: 74, dur: 0.25 }, { pitch: 79, dur: 0.5 },
  ];

  addNotes(track, notes, { gapScale: 0.85 });
  return Buffer.from(midi.toArray());
}

/**
 * Original 12-bar blues study in C: walking bass + sparse blues melody.
 * Not a transcription of a copyrighted song.
 */
function generateBlues12Bar() {
  const midi = new Midi();
  midi.header.name = 'Style study · 12-bar blues in C';
  midi.header.setTempo(96);

  const bass = midi.addTrack();
  bass.name = 'Walking Bass';
  bass.channel = 0;
  bass.instrument.number = 32; // acoustic bass

  const lead = midi.addTrack();
  lead.name = 'Blues Lead';
  lead.channel = 1;
  lead.instrument.number = 26; // jazz guitar

  const walk = (root) => [root, root + 4, root + 7, root + 9];
  const bars = [
    ...Array(4).fill(36), // C
    ...Array(2).fill(41), // F
    ...Array(2).fill(36), // C
    43, 41, 36, 36, // G F C C
  ];

  let time = 0;
  bars.forEach((root) => {
    walk(root).forEach((pitch, idx) => {
      bass.addNote({ midi: pitch, time: time + idx * 0.5, duration: 0.45, velocity: 0.75 });
    });
    time += 2;
  });

  const melody = [
    { pitch: 60, dur: 0.5 }, { pitch: 63, dur: 0.5 }, { pitch: 64, dur: 0.75 }, { pitch: 63, dur: 0.25 },
    { pitch: 60, dur: 1 }, { pitch: 58, dur: 0.5 }, { pitch: 60, dur: 0.5 },
    { pitch: 63, dur: 0.5 }, { pitch: 65, dur: 0.5 }, { pitch: 63, dur: 1 },
    { pitch: 60, dur: 0.5 }, { pitch: 58, dur: 0.5 }, { pitch: 55, dur: 1 },
    { pitch: 58, dur: 0.5 }, { pitch: 60, dur: 0.5 }, { pitch: 63, dur: 0.5 }, { pitch: 60, dur: 0.5 },
    { pitch: 55, dur: 0.5 }, { pitch: 53, dur: 0.5 }, { pitch: 55, dur: 1 },
    { pitch: 58, dur: 0.5 }, { pitch: 55, dur: 0.5 }, { pitch: 53, dur: 0.5 }, { pitch: 55, dur: 0.5 },
    { pitch: 48, dur: 2 },
  ];
  addNotes(lead, melody, { start: 0, velocity: 0.88, gapScale: 0.88 });

  return Buffer.from(midi.toArray());
}

/**
 * Original jazz swing study: ii–V–I in C with walking bass and syncopated chords.
 */
function generateJazzSwing() {
  const midi = new Midi();
  midi.header.name = 'Style study · jazz swing ii-V-I';
  midi.header.setTempo(132);

  const bass = midi.addTrack();
  bass.name = 'Walking Bass';
  bass.channel = 0;
  bass.instrument.number = 32;

  const comp = midi.addTrack();
  comp.name = 'Comp Chords';
  comp.channel = 1;
  comp.instrument.number = 0;

  const lead = midi.addTrack();
  lead.name = 'Sax Melody';
  lead.channel = 2;
  lead.instrument.number = 65; // alto sax

  const progression = [
    { root: 50, chord: [62, 65, 69, 72] }, // Dm7
    { root: 43, chord: [59, 62, 65, 69] }, // G7
    { root: 48, chord: [60, 64, 67, 71] }, // Cmaj7
    { root: 48, chord: [60, 64, 67, 71] },
    { root: 50, chord: [62, 65, 69, 72] },
    { root: 43, chord: [59, 62, 65, 69] },
    { root: 48, chord: [60, 64, 67, 71] },
    { root: 48, chord: [60, 64, 67, 72] },
  ];

  progression.forEach((bar, barIdx) => {
    const t0 = barIdx * 2;
    const walk = [bar.root, bar.root + 4, bar.root + 7, bar.root + 5];
    walk.forEach((pitch, idx) => {
      bass.addNote({ midi: pitch, time: t0 + idx * 0.5, duration: 0.42, velocity: 0.72 });
    });
    // swing-ish chord stabs on beats 2 and 4
    addChordHits(comp, [
      { time: t0 + 0.5, dur: 0.35, pitches: bar.chord, velocity: 0.55 },
      { time: t0 + 1.5, dur: 0.35, pitches: bar.chord, velocity: 0.6 },
    ]);
  });

  const melody = [
    { pitch: 74, dur: 0.75 }, { pitch: 72, dur: 0.25 }, { pitch: 69, dur: 0.5 }, { pitch: 67, dur: 0.5 },
    { pitch: 65, dur: 0.75 }, { pitch: 67, dur: 0.25 }, { pitch: 69, dur: 1 },
    { pitch: 72, dur: 0.5 }, { pitch: 71, dur: 0.5 }, { pitch: 69, dur: 0.5 }, { pitch: 67, dur: 0.5 },
    { pitch: 64, dur: 1 }, { pitch: 67, dur: 0.5 }, { pitch: 69, dur: 0.5 },
    { pitch: 74, dur: 0.5 }, { pitch: 72, dur: 0.25 }, { pitch: 74, dur: 0.25 }, { pitch: 76, dur: 1 },
    { pitch: 72, dur: 0.5 }, { pitch: 69, dur: 0.5 }, { pitch: 67, dur: 1 },
    { pitch: 64, dur: 0.5 }, { pitch: 67, dur: 0.5 }, { pitch: 69, dur: 0.5 }, { pitch: 72, dur: 0.5 },
    { pitch: 76, dur: 2 },
  ];
  addNotes(lead, melody, { velocity: 0.9, gapScale: 0.86 });

  return Buffer.from(midi.toArray());
}

/**
 * Original funk groove: syncopated bass + clavinet-style chord stabs.
 */
function generateFunkGroove() {
  const midi = new Midi();
  midi.header.name = 'Style study · funk groove';
  midi.header.setTempo(108);

  const bass = midi.addTrack();
  bass.name = 'Funk Bass';
  bass.channel = 0;
  bass.instrument.number = 33; // fingered bass

  const keys = midi.addTrack();
  keys.name = 'Clav Stabs';
  keys.channel = 1;
  keys.instrument.number = 7; // clavinet

  // One-bar bass figure repeated
  const bassFigure = [
    { pitch: 36, dur: 0.25 }, { pitch: 36, dur: 0.25 }, { pitch: 43, dur: 0.25 },
    { pitch: 36, dur: 0.5 }, { pitch: 38, dur: 0.25 }, { pitch: 36, dur: 0.25 },
    { pitch: 43, dur: 0.25 },
  ];
  for (let bar = 0; bar < 8; bar++) {
    addNotes(bass, bassFigure, { start: bar * 2, velocity: 0.85, gapScale: 0.8 });
  }

  const stabChord = [60, 63, 67, 70]; // Cmin7
  const stabTimes = [0.5, 1.25, 2.5, 3.25, 4.5, 5.0, 6.5, 7.25, 8.5, 9.25, 10.5, 11.0, 12.5, 13.25, 14.5, 15.25];
  addChordHits(
    keys,
    stabTimes.map((time) => ({ time, dur: 0.18, pitches: stabChord, velocity: 0.78 })),
  );

  return Buffer.from(midi.toArray());
}

/**
 * Original electronic arpeggio sequence with a sustained pad bass.
 */
function generateElectronicArp() {
  const midi = new Midi();
  midi.header.name = 'Style study · electronic arpeggio';
  midi.header.setTempo(120);

  const pad = midi.addTrack();
  pad.name = 'Pad Bass';
  pad.channel = 0;
  pad.instrument.number = 89; // warm pad

  const arp = midi.addTrack();
  arp.name = 'Arpeggiator';
  arp.channel = 1;
  arp.instrument.number = 81; // saw lead

  const roots = [48, 48, 45, 43, 48, 50, 45, 43]; // C C Am G C D Am G
  roots.forEach((root, barIdx) => {
    const t0 = barIdx * 2;
    pad.addNote({ midi: root, time: t0, duration: 1.9, velocity: 0.55 });
    const pattern = [root + 12, root + 16, root + 19, root + 24, root + 19, root + 16, root + 12, root + 19];
    pattern.forEach((pitch, idx) => {
      arp.addNote({
        midi: pitch,
        time: t0 + idx * 0.25,
        duration: 0.2,
        velocity: 0.7 + (idx % 2) * 0.1,
      });
    });
  });

  return Buffer.from(midi.toArray());
}

/**
 * Original hip-hop keys loop: sparse chords over a simple sub-bass figure.
 * Melodic material only; not a sample or transcription of a commercial track.
 */
function generateHipHopKeys() {
  const midi = new Midi();
  midi.header.name = 'Style study · hip-hop keys loop';
  midi.header.setTempo(88);

  const bass = midi.addTrack();
  bass.name = 'Sub Bass';
  bass.channel = 0;
  bass.instrument.number = 38; // synth bass 1

  const keys = midi.addTrack();
  keys.name = 'Rhodes Keys';
  keys.channel = 1;
  keys.instrument.number = 4; // electric piano 1

  for (let bar = 0; bar < 8; bar++) {
    const t0 = bar * 2;
    const root = bar % 4 < 2 ? 36 : 34; // C then Bb
    bass.addNote({ midi: root, time: t0, duration: 0.9, velocity: 0.9 });
    bass.addNote({ midi: root, time: t0 + 1.25, duration: 0.55, velocity: 0.75 });
  }

  const voicings = [
    [60, 63, 67, 70], // Cm7
    [58, 62, 65, 68], // Bbmaj7-ish
  ];
  for (let bar = 0; bar < 8; bar++) {
    const chord = voicings[bar % 4 < 2 ? 0 : 1];
    const t0 = bar * 2;
    addChordHits(keys, [
      { time: t0, dur: 0.7, pitches: chord, velocity: 0.7 },
      { time: t0 + 1.0, dur: 0.35, pitches: chord, velocity: 0.55 },
      { time: t0 + 1.5, dur: 0.4, pitches: chord.slice(1), velocity: 0.6 },
    ]);
  }

  return Buffer.from(midi.toArray());
}

/**
 * Original rock riff study: power-chord rhythm guitar + driving root bass.
 * Not a transcription of a copyrighted song.
 */
function generateRockRiff() {
  const midi = new Midi();
  midi.header.name = 'Style study · rock power-chord riff';
  midi.header.setTempo(124);

  const bass = midi.addTrack();
  bass.name = 'Rock Bass';
  bass.channel = 0;
  bass.instrument.number = 33; // fingered electric bass

  const guitar = midi.addTrack();
  guitar.name = 'Power Chords';
  guitar.channel = 1;
  guitar.instrument.number = 29; // overdriven guitar

  // Eight bars: Em | Em | G | D | C | C | G | D
  const roots = [40, 40, 43, 38, 36, 36, 43, 38];
  roots.forEach((root, barIdx) => {
    const t0 = barIdx * 2;
    // eighth-note bass drive
    for (let i = 0; i < 8; i++) {
      bass.addNote({
        midi: root,
        time: t0 + i * 0.25,
        duration: 0.2,
        velocity: i % 2 === 0 ? 0.88 : 0.7,
      });
    }
    // power-chord hits: root + fifth (+ octave) on the downbeats and a late syncopation
    const chord = [root + 12, root + 19, root + 24];
    addChordHits(guitar, [
      { time: t0, dur: 0.4, pitches: chord, velocity: 0.92 },
      { time: t0 + 0.75, dur: 0.3, pitches: chord, velocity: 0.8 },
      { time: t0 + 1.25, dur: 0.55, pitches: chord, velocity: 0.88 },
    ]);
  });

  return Buffer.from(midi.toArray());
}

/**
 * Original house style study: four-on-the-floor kick pattern (pitched),
 * offbeat open-hat-ish stabs, and a repeating minor-chord stab progression.
 */
function generateHouseGroove() {
  const midi = new Midi();
  midi.header.name = 'Style study · house four-on-the-floor';
  midi.header.setTempo(124);

  const kick = midi.addTrack();
  kick.name = 'Kick Pulse';
  kick.channel = 9; // standard GM drum channel
  kick.instrument.number = 0;

  const bass = midi.addTrack();
  bass.name = 'House Bass';
  bass.channel = 0;
  bass.instrument.number = 38; // synth bass 1

  const stabs = midi.addTrack();
  stabs.name = 'Chord Stabs';
  stabs.channel = 1;
  stabs.instrument.number = 81; // saw lead / pluck-ish

  // 8 bars of four-on-the-floor (kick = GM note 36)
  for (let beat = 0; beat < 32; beat++) {
    kick.addNote({ midi: 36, time: beat * 0.5, duration: 0.2, velocity: 0.95 });
    // offbeat closed-hat feel on note 42
    kick.addNote({ midi: 42, time: beat * 0.5 + 0.25, duration: 0.12, velocity: 0.55 });
  }

  // Bass: short pumping notes under Am - F - C - G (two bars each)
  const bassRoots = [45, 45, 41, 41, 36, 36, 43, 43];
  bassRoots.forEach((root, barIdx) => {
    const t0 = barIdx * 2;
    for (let i = 0; i < 4; i++) {
      bass.addNote({
        midi: root,
        time: t0 + i * 0.5,
        duration: 0.28,
        velocity: 0.82,
      });
    }
  });

  const voicings = [
    [57, 60, 64, 67], // Am
    [53, 57, 60, 65], // F
    [48, 52, 55, 60], // C
    [55, 59, 62, 67], // G
  ];
  for (let bar = 0; bar < 8; bar++) {
    const chord = voicings[Math.floor(bar / 2) % 4];
    const t0 = bar * 2;
    // classic house offbeat stabs on the "&" of each beat
    addChordHits(stabs, [
      { time: t0 + 0.25, dur: 0.18, pitches: chord, velocity: 0.7 },
      { time: t0 + 0.75, dur: 0.18, pitches: chord, velocity: 0.68 },
      { time: t0 + 1.25, dur: 0.18, pitches: chord, velocity: 0.72 },
      { time: t0 + 1.75, dur: 0.18, pitches: chord, velocity: 0.66 },
    ]);
  }

  return Buffer.from(midi.toArray());
}

writeMidi('bach_prelude_c.mid', generateBachPrelude());
writeMidi('beethoven_fur_elise.mid', generateFurElise());
writeMidi('mozart_nachtmusik.mid', generateNachtmusik());
writeMidi('blues_12bar_style.mid', generateBlues12Bar());
writeMidi('jazz_swing_style.mid', generateJazzSwing());
writeMidi('funk_groove_style.mid', generateFunkGroove());
writeMidi('electronic_arp_style.mid', generateElectronicArp());
writeMidi('hiphop_keys_style.mid', generateHipHopKeys());
writeMidi('rock_riff_style.mid', generateRockRiff());
writeMidi('house_four_on_floor_style.mid', generateHouseGroove());

console.log('Generated educational demo MIDI style-studies in public/demo-midi/');
console.log('Note: *_full.mid public-domain works are bundled separately and left untouched.');
