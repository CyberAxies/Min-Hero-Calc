#!/usr/bin/env node
/**
 * Generates the PWA icons (`public/icons/icon-{192,512}.png`).
 *
 * The artwork lives in `scripts/icon-art.mjs` so the packaged app icons
 * (`scripts/make-mobile-icons.mjs`) reuse exactly the same mark.
 *
 * Run from the repo root:  node scripts/make-icons.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drawIcon, encodePng } from './icon-art.mjs';

const SIZES = [192, 512];

const outDir = fileURLToPath(new URL('../public/icons/', import.meta.url));
mkdirSync(outDir, { recursive: true });

for (const size of SIZES) {
  const path = join(outDir, `icon-${size}.png`);
  writeFileSync(path, encodePng(size, drawIcon(size)));
  console.log(`wrote ${path}`);
}
