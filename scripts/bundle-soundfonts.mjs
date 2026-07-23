#!/usr/bin/env node
/**
 * Download FluidR3_GM core midi-js mp3 soundfont scripts into public/soundfonts/.
 * Budget: ~20–30 MB. Do not commit the .js blobs (gitignored).
 *
 * Usage:
 *   node scripts/bundle-soundfonts.mjs           # download missing
 *   node scripts/bundle-soundfonts.mjs --verify  # sha256 check only, no download
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BANK = 'FluidR3_GM';
const OUT = path.join(ROOT, 'public', 'soundfonts', BANK);
const CDN = `https://gleitz.github.io/midi-js-soundfonts/${BANK}`;
const MANIFEST = path.join(OUT, 'manifest.json');

const CORE_INSTRUMENT_SLUGS = [
  'acoustic_grand_piano', 'bright_acoustic_piano', 'electric_piano_1', 'harpsichord',
  'vibraphone', 'acoustic_guitar_nylon', 'acoustic_guitar_steel', 'overdriven_guitar',
  'acoustic_bass', 'electric_bass_finger',
  'violin', 'viola', 'cello', 'string_ensemble_1', 'choir_aahs',
  'trumpet', 'trombone', 'french_horn', 'alto_sax', 'tenor_sax', 'flute',
  'synth_strings_1',
];

const verifyOnly = process.argv.includes('--verify');

async function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function main() {
  await mkdir(OUT, { recursive: true });
  let manifest = { bank: BANK, files: [] };
  try {
    manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  } catch { /* new */ }

  const files = [];
  for (const slug of CORE_INSTRUMENT_SLUGS) {
    const name = `${slug}-mp3.js`;
    const dest = path.join(OUT, name);
    const url = `${CDN}/${name}`;

    if (verifyOnly) {
      const buf = await readFile(dest);
      const entry = (manifest.files || []).find((f) => f.slug === slug);
      if (!entry) throw new Error(`Missing manifest entry for ${slug}`);
      const hash = await sha256(buf);
      if (hash !== entry.sha256) throw new Error(`Hash mismatch: ${slug}`);
      if (buf.byteLength !== entry.bytes) throw new Error(`Size mismatch: ${slug}`);
      console.log('ok', slug);
      files.push(entry);
      continue;
    }

    let buf;
    try {
      await access(dest);
      buf = await readFile(dest);
      console.log('exists', slug);
    } catch {
      console.log('download', url);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      buf = Buffer.from(await res.arrayBuffer());
      await writeFile(dest, buf);
    }
    files.push({ slug, file: name, url, sha256: await sha256(buf), bytes: buf.byteLength });
  }

  if (!verifyOnly) {
    await writeFile(MANIFEST, JSON.stringify({ bank: BANK, files }, null, 2));
    console.log('wrote', MANIFEST);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
