#!/usr/bin/env node
/**
 * Generates the source art that `@capacitor/assets` turns into Android launcher
 * icons and splash screens:
 *
 *   assets/icon-only.png       1024×1024  mark on its slate tile (legacy icon)
 *   assets/icon-foreground.png 1024×1024  bare mark, inside the adaptive safe zone
 *   assets/icon-background.png 1024×1024  the slate layer behind the mark
 *   assets/splash.png          2732×2732  mark centred on the slate background
 *
 * Uses the same dependency-free painter as the PWA icons, so every icon in the
 * repo comes from one drawing routine.
 *
 * Run from the repo root:
 *   node scripts/make-mobile-icons.mjs
 *   npx @capacitor/assets generate --android
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKGROUND, drawIcon, drawMark, drawSplash, encodePng } from './icon-art.mjs';

const ICON_SIZE = 1024;
const SPLASH_SIZE = 2732;
/** Adaptive icons only show the centre ~66%, so the bare mark stays well inside. */
const FOREGROUND_SCALE = 0.62;

const outDir = fileURLToPath(new URL('../assets/', import.meta.url));
mkdirSync(outDir, { recursive: true });

function write(name, size, pixels) {
  const path = join(outDir, name);
  writeFileSync(path, encodePng(size, pixels));
  console.log(`wrote ${path}`);
}

write('icon-only.png', ICON_SIZE, drawIcon(ICON_SIZE));

const foreground = Buffer.alloc(ICON_SIZE * ICON_SIZE * 4);
const markSize = Math.trunc(ICON_SIZE * FOREGROUND_SCALE);
const markOffset = Math.trunc((ICON_SIZE - markSize) / 2);
drawMark(foreground, ICON_SIZE, markOffset, markOffset, markSize, { withBackground: false });
write('icon-foreground.png', ICON_SIZE, foreground);

const background = Buffer.alloc(ICON_SIZE * ICON_SIZE * 4);
for (let offset = 0; offset < background.length; offset += 4) {
  background[offset] = BACKGROUND[0];
  background[offset + 1] = BACKGROUND[1];
  background[offset + 2] = BACKGROUND[2];
  background[offset + 3] = 255;
}
write('icon-background.png', ICON_SIZE, background);

write('splash.png', SPLASH_SIZE, drawSplash(SPLASH_SIZE));
