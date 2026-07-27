#!/usr/bin/env node
/**
 * Download FluidR3_GM core midi-js mp3 soundfont scripts and matching goldst loop
 * metadata into public/soundfonts/. Budget: ~20–30 MB scripts + small loop JSON.
 * Do not commit the blobs (gitignored).
 *
 * Usage:
 *   node scripts/bundle-soundfonts.mjs           # download missing
 *   node scripts/bundle-soundfonts.mjs --verify  # sha256 check only, no download
 *
 * Loop slug mapping must stay in sync with src/audio/soundfont/gmLoopSlugs.ts.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BANK = 'FluidR3_GM';
const OUT = path.join(ROOT, 'public', 'soundfonts', BANK);
const GLEITZ_CDN = `https://gleitz.github.io/midi-js-soundfonts/${BANK}`;
const GOLDST_CDN = `https://goldst.dev/midi-js-soundfonts/${BANK}`;
const MANIFEST = path.join(OUT, 'manifest.json');

const CORE_INSTRUMENT_SLUGS = [
  'acoustic_grand_piano', 'bright_acoustic_piano', 'electric_piano_1', 'harpsichord',
  'vibraphone', 'acoustic_guitar_nylon', 'acoustic_guitar_steel', 'overdriven_guitar',
  'acoustic_bass', 'electric_bass_finger',
  'violin', 'viola', 'cello', 'string_ensemble_1', 'choir_aahs',
  'trumpet', 'trombone', 'french_horn', 'alto_sax', 'tenor_sax', 'flute',
  'synth_strings_1',
];

/** Keep in sync with gmLoopSlugs.ts */
const NO_LOOP_GLEITZ_SLUGS = new Set(['electric_grand_piano', 'slap_bass_2']);
const GLEITZ_TO_GOLDST_LOOP_SLUG = {
  acoustic_grand_piano: 'yamaha_grand_piano',
  bright_acoustic_piano: 'bright_yamaha_grand',
  drawbar_organ: 'drawbarorgan',
  electric_piano_1: 'rhodes_ep',
  honkytonk_piano: 'honky_tonk',
  accordion: 'accordian',
  tango_accordion: 'bandoneon',
  acoustic_guitar_nylon: 'nylon_string_guitar',
  acoustic_guitar_steel: 'steel_string_guitar',
  electric_guitar_jazz: 'jazz_guitar',
  electric_guitar_clean: 'clean_guitar',
  electric_guitar_muted: 'palm_muted_guitar',
  overdriven_guitar: 'overdrive_guitar',
  electric_bass_finger: 'fingered_bass',
  electric_bass_pick: 'picked_bass',
  slap_bass_1: 'slap_bass',
  tremolo_strings: 'tremolo',
  pizzicato_strings: 'pizzicato_section',
  orchestral_harp: 'harp',
  string_ensemble_1: 'strings',
  string_ensemble_2: 'slow_strings',
  choir_aahs: 'ahh_choir',
  voice_oohs: 'ohh_voices',
  synth_choir: 'synth_voice',
  french_horn: 'french_horns',
  lead_1_square: 'square_lead',
  lead_2_sawtooth: 'saw_wave',
  lead_3_calliope: 'calliope_lead',
  lead_4_chiff: 'chiffer_lead',
  lead_5_charang: 'charang',
  lead_6_voice: 'space_voice',
  lead_7_fifths: 'fifth_sawtooth_wave',
  lead_8_bass__lead: 'bass_&_lead',
  pad_1_new_age: 'fantasia',
  pad_2_warm: 'warm_pad',
  pad_3_polysynth: 'polysynth',
  pad_4_choir: 'solo_vox',
  pad_5_bowed: 'bowed_glass',
  pad_6_metallic: 'metal_pad',
  pad_7_halo: 'halo_pad',
  pad_8_sweep: 'sweep_pad',
  fx_1_rain: 'ice_rain',
  fx_2_soundtrack: 'soundtrack',
  fx_3_crystal: 'crystal',
  fx_4_atmosphere: 'atmosphere',
  fx_5_brightness: 'brightness',
  fx_6_goblins: 'goblin',
  fx_7_echoes: 'echo_drops',
  fx_8_scifi: 'star_theme',
  shanai: 'shenai',
  tinkle_bell: 'tinker_bell',
  seashore: 'sea_shore',
  telephone_ring: 'telephone',
  gunshot: 'gun_shot',
  guitar_fret_noise: 'fret_noise',
  blown_bottle: 'bottle_chiff',
};

function goldstLoopSlug(gleitzSlug) {
  if (NO_LOOP_GLEITZ_SLUGS.has(gleitzSlug)) return null;
  return GLEITZ_TO_GOLDST_LOOP_SLUG[gleitzSlug] ?? gleitzSlug;
}

const verifyOnly = process.argv.includes('--verify');

async function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function ensureFile({ slug, file, url, dest, manifestFiles, kind }) {
  if (verifyOnly) {
    const buf = await readFile(dest);
    const entry = (manifestFiles || []).find((f) => f.slug === slug && f.kind === kind);
    if (!entry) throw new Error(`Missing manifest entry for ${slug} (${kind})`);
    const hash = await sha256(buf);
    if (hash !== entry.sha256) throw new Error(`Hash mismatch: ${slug} (${kind})`);
    if (buf.byteLength !== entry.bytes) throw new Error(`Size mismatch: ${slug} (${kind})`);
    console.log('ok', slug, kind);
    return entry;
  }

  let buf;
  try {
    await access(dest);
    buf = await readFile(dest);
    console.log('exists', slug, kind);
  } catch {
    console.log('download', url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    buf = Buffer.from(await res.arrayBuffer());
    await writeFile(dest, buf);
  }
  return { slug, kind, file, url, sha256: await sha256(buf), bytes: buf.byteLength };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  let manifest = { bank: BANK, files: [] };
  try {
    manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  } catch { /* new */ }

  const files = [];
  for (const slug of CORE_INSTRUMENT_SLUGS) {
    const scriptName = `${slug}-mp3.js`;
    const scriptDest = path.join(OUT, scriptName);
    files.push(await ensureFile({
      slug,
      kind: 'script',
      file: scriptName,
      url: `${GLEITZ_CDN}/${scriptName}`,
      dest: scriptDest,
      manifestFiles: manifest.files,
    }));

    const loopSlug = goldstLoopSlug(slug);
    if (!loopSlug) {
      console.log('skip loop', slug, '(no goldst metadata)');
      continue;
    }
    const loopName = `${loopSlug}-loop.json`;
    const loopDest = path.join(OUT, loopName);
    files.push(await ensureFile({
      slug: loopSlug,
      kind: 'loop',
      gleitzSlug: slug,
      file: loopName,
      url: `${GOLDST_CDN}/${loopName}`,
      dest: loopDest,
      manifestFiles: manifest.files,
    }));
  }

  const PERCUSSION_OUT = path.join(OUT, 'percussion');
  await mkdir(PERCUSSION_OUT, { recursive: true });
  const drumFile = 'percussion/Standard-mp3.js';
  const drumDest = path.join(OUT, 'percussion', 'Standard-mp3.js');
  files.push(await ensureFile({
    slug: 'drumkit-standard',
    kind: 'percussion',
    file: drumFile,
    url: 'https://raw.githubusercontent.com/henrikvilhelmberglund/midi-js-compat-soundfonts/gh-pages/GM-soundfonts/FluidR3_GM/drumkits/Standard-mp3.js',
    dest: drumDest,
    manifestFiles: manifest.files,
  }));

  if (!verifyOnly) {
    await writeFile(MANIFEST, JSON.stringify({ bank: BANK, files }, null, 2));
    console.log('wrote', MANIFEST);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
