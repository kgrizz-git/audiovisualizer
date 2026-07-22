import pkg from '@tonejs/midi';
const { Midi } = pkg;
import * as fs from 'fs';
import * as path from 'path';

const outputDir = path.resolve('public/demo-midi');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 1. Bach - Prelude in C Major (BWV 846)
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

// 2. Beethoven - Für Elise (Theme)
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

  let time = 0;
  notes.forEach((n) => {
    track.addNote({
      midi: n.pitch,
      time: time,
      duration: n.dur * 0.9,
      velocity: 0.8,
    });
    time += n.dur;
  });

  return Buffer.from(midi.toArray());
}

// 3. Mozart - Eine kleine Nachtmusik
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

  let time = 0;
  notes.forEach((n) => {
    track.addNote({
      midi: n.pitch,
      time: time,
      duration: n.dur * 0.85,
      velocity: 0.85,
    });
    time += n.dur;
  });

  return Buffer.from(midi.toArray());
}

fs.writeFileSync(path.join(outputDir, 'bach_prelude_c.mid'), generateBachPrelude());
fs.writeFileSync(path.join(outputDir, 'beethoven_fur_elise.mid'), generateFurElise());
fs.writeFileSync(path.join(outputDir, 'mozart_nachtmusik.mid'), generateNachtmusik());

console.log('Successfully generated 3 public domain demo MIDI files in public/demo-midi/');
