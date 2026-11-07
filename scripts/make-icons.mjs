#!/usr/bin/env node
/**
 * Generates the PWA icons (`public/icons/icon-{192,512}.png`).
 *
 * Deliberately dependency-free and cross-platform: the shapes are rasterised by
 * hand into an RGBA buffer and encoded as PNG with Node's built-in zlib. That
 * used to be a PowerShell + System.Drawing script, which no Linux CI (Cloudflare
 * Pages, GitHub Actions) can run — `npm run build` must work everywhere because
 * `prebuild` calls this.
 *
 * The mark is the app's own: slate background, bold "MH" wordmark, and three
 * bars in the Fire / Water / Grass colours used across the type chips.
 *
 * Run from the repo root:  node scripts/make-icons.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const SIZES = [192, 512];

const BACKGROUND = [0x0b, 0x12, 0x20];
const FOREGROUND = [0xe8, 0xec, 0xf3];
const BARS = [
  [0xf0, 0x80, 0x30],
  [0x68, 0x90, 0xf0],
  [0x78, 0xc8, 0x50],
];

// Layout as fractions of the icon size. The wordmark is sized like a bold
// 0.30em font: about 0.21 of the icon tall, with stems a sixth of that.
const CAP_HEIGHT = 0.21;
const LETTER_WIDTH = 0.19;
const LETTER_GAP = 0.04;
const TEXT_CENTER_Y = 0.29;

// Both are in cap-height units, which keeps the letters in proportion.
const LETTER_WIDTH_CAP = LETTER_WIDTH / CAP_HEIGHT;
const STEM_CAP = 0.165;
const GAP_CAP = LETTER_GAP / CAP_HEIGHT;
const M_VALLEY = 0.88;
const H_CROSSBAR = 0.5;

/**
 * Letterforms as thick strokes in cap-height units (x right, y down), drawn as
 * butt-capped quads. A bold sans "M" is two stems joined by a V; an "H" is two
 * stems joined by a bar.
 */
const GLYPHS = {
  M: (() => {
    const left = STEM_CAP / 2;
    const right = LETTER_WIDTH_CAP - STEM_CAP / 2;
    const middle = LETTER_WIDTH_CAP / 2;
    return [
      [left, 0, left, 1],
      [right, 0, right, 1],
      [left, STEM_CAP * 0.7, middle, M_VALLEY],
      [right, STEM_CAP * 0.7, middle, M_VALLEY],
    ];
  })(),
  H: (() => {
    const left = STEM_CAP / 2;
    const right = LETTER_WIDTH_CAP - STEM_CAP / 2;
    return [
      [left, 0, left, 1],
      [right, 0, right, 1],
      [left, H_CROSSBAR, right, H_CROSSBAR],
    ];
  })(),
};

// ---------------------------------------------------------------- PNG output

let crcTable = null;

function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let crc = -1;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ painting

function fillRect(pixels, size, x, y, width, height, [r, g, b]) {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(size, Math.round(x + width));
  const y1 = Math.min(size, Math.round(y + height));
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      const offset = (py * size + px) * 4;
      pixels[offset] = r;
      pixels[offset + 1] = g;
      pixels[offset + 2] = b;
      pixels[offset + 3] = 255;
    }
  }
}

/** Builds the butt-capped quad for a stroke of the given width. */
function strokeQuad([x1, y1], [x2, y2], width) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const nx = (-dy / length) * (width / 2);
  const ny = (dx / length) * (width / 2);
  return [
    [x1 + nx, y1 + ny],
    [x2 + nx, y2 + ny],
    [x2 - nx, y2 - ny],
    [x1 - nx, y1 - ny],
  ];
}

/**
 * Scanline-fills a closed polygon with 3 vertical samples per pixel row, which
 * gives clean antialiased edges at both icon sizes without a rasteriser.
 */
const SUBSAMPLES = 3;

function fillPolygon(pixels, size, points, color) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of points) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const top = Math.max(0, Math.floor(minY));
  const bottom = Math.min(size, Math.ceil(maxY));
  const coverage = new Float32Array(size);

  for (let py = top; py < bottom; py += 1) {
    coverage.fill(0);
    let touched = false;

    for (let sample = 0; sample < SUBSAMPLES; sample += 1) {
      const scanY = py + (sample + 0.5) / SUBSAMPLES;
      const crossings = [];
      for (let i = 0; i < points.length; i += 1) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % points.length];
        if (y1 === y2) continue;
        const lower = Math.min(y1, y2);
        const upper = Math.max(y1, y2);
        if (scanY < lower || scanY >= upper) continue;
        crossings.push(x1 + ((scanY - y1) / (y2 - y1)) * (x2 - x1));
      }
      if (crossings.length < 2) continue;
      crossings.sort((a, b) => a - b);

      for (let i = 0; i + 1 < crossings.length; i += 2) {
        const from = Math.max(0, crossings[i]);
        const to = Math.min(size, crossings[i + 1]);
        for (let px = Math.floor(from); px < Math.ceil(to); px += 1) {
          const span = Math.min(to, px + 1) - Math.max(from, px);
          if (span > 0) {
            coverage[px] += span / SUBSAMPLES;
            touched = true;
          }
        }
      }
    }

    if (!touched) continue;
    for (let px = 0; px < size; px += 1) {
      const alpha = Math.min(1, coverage[px]);
      if (alpha === 0) continue;
      const offset = (py * size + px) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const base = pixels[offset + channel];
        pixels[offset + channel] = Math.round(base + (color[channel] - base) * alpha);
      }
      pixels[offset + 3] = 255;
    }
  }
}

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  fillRect(pixels, size, 0, 0, size, size, BACKGROUND);

  const capHeight = CAP_HEIGHT * size;
  const totalWidth = (LETTER_WIDTH_CAP * 2 + GAP_CAP) * capHeight;
  const originX = (size - totalWidth) / 2;
  const originY = TEXT_CENTER_Y * size - capHeight / 2;

  ['M', 'H'].forEach((letter, index) => {
    const offsetX = originX + index * (LETTER_WIDTH_CAP + GAP_CAP) * capHeight;
    const toPixels = ([x, y]) => [offsetX + x * capHeight, originY + y * capHeight];
    for (const [ax, ay, bx, by] of GLYPHS[letter]) {
      fillPolygon(
        pixels,
        size,
        strokeQuad(toPixels([ax, ay]), toPixels([bx, by]), STEM_CAP * capHeight),
        FOREGROUND,
      );
    }
  });

  // Type-colour bars, matching the original design.
  const barHeight = Math.trunc(size * 0.085);
  const gapY = Math.trunc(size * 0.055);
  const margin = Math.trunc(size * 0.16);
  const barWidth = size - 2 * margin;
  const startY = Math.trunc(size * 0.6);

  BARS.forEach((color, index) => {
    fillRect(pixels, size, margin, startY + index * (barHeight + gapY), barWidth, barHeight, color);
  });

  return pixels;
}

// ---------------------------------------------------------------------- main

const outDir = fileURLToPath(new URL('../public/icons/', import.meta.url));
mkdirSync(outDir, { recursive: true });

for (const size of SIZES) {
  const path = join(outDir, `icon-${size}.png`);
  writeFileSync(path, encodePng(size, drawIcon(size)));
  console.log(`wrote ${path}`);
}
