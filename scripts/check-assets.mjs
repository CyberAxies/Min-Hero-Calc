/**
 * Verifies that every path in `src/packs/minhero/data/assets.json` exists under
 * `public/`. Runs without the decompiled source, so it also works in CI and on
 * a fresh clone.
 *
 * Run with: npm run assets:check
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(ROOT, 'src', 'packs', 'minhero', 'data', 'assets.json');
const PUBLIC_DIR = path.join(ROOT, 'public');

const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
const groups = [
  ['minions', manifest.minions],
  ['moves', manifest.moves],
  ['ui', manifest.ui],
];

const failures = [];
const seen = new Set();
let bytes = 0;

for (const [group, entries] of groups) {
  for (const [key, relative] of Object.entries(entries)) {
    if (typeof relative !== 'string' || !relative.startsWith('./')) {
      failures.push(`${group}.${key}: expected a ./ relative path, got ${String(relative)}`);
      continue;
    }
    if (seen.has(relative)) failures.push(`${group}.${key}: duplicate path ${relative}`);
    seen.add(relative);
    const absolute = path.join(PUBLIC_DIR, relative.slice(2));
    try {
      const info = await stat(absolute);
      if (!info.isFile()) failures.push(`${group}.${key}: ${relative} is not a file`);
      else if (info.size === 0) failures.push(`${group}.${key}: ${relative} is empty`);
      else bytes += info.size;
    } catch {
      failures.push(`${group}.${key}: missing ${relative}`);
    }
  }
}

// Nothing in public/assets should be orphaned from the manifest.
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const assetRoot = path.join(PUBLIC_DIR, 'assets');
let orphans = [];
try {
  for (const file of await walk(assetRoot)) {
    if (file.endsWith('ATTRIBUTION.md')) continue;
    const relative = `./${path.relative(PUBLIC_DIR, file).split(path.sep).join('/')}`;
    if (!seen.has(relative)) orphans.push(relative);
  }
} catch {
  failures.push('public/assets is missing; run npm run assets:import');
}

if (orphans.length > 0) {
  console.warn(`Warning: ${orphans.length} file(s) in public/assets are not in the manifest:`);
  for (const orphan of orphans.slice(0, 10)) console.warn(`  - ${orphan}`);
  if (orphans.length > 10) console.warn(`  …and ${orphans.length - 10} more`);
}

if (failures.length > 0) {
  console.error(`Asset check failed (${failures.length} problem(s)):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

const megabytes = (bytes / (1024 * 1024)).toFixed(2);
console.log('Asset check passed:');
console.log(`  ${seen.size} files, ${megabytes} MB`);
