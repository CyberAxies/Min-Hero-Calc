/**
 * Dev-time asset importer for Min Hero: Tower of Sages.
 *
 * Copies the sprite, move icon, gem and UI artwork out of the decompiled game
 * into `public/assets/` under stable, app-friendly file names, then writes
 * `src/packs/minhero/data/assets.json` so the app can resolve every path.
 *
 * Run after `npm run data:import` (the manifest is keyed by generated ids):
 *   npm run assets:import
 *
 * The original art is © ToyChestGames and is used with permission. Do not edit
 * the files under `public/assets/` by hand; regenerate them instead.
 */

import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ASSETS = path.join(ROOT, 'minhero-towerofsages-main', 'Source Files');
const IMAGES_SOURCE = path.join(SOURCE_ASSETS, 'images_source');
const ATTACK_ICONS = path.join(SOURCE_ASSETS, 'images_sorted', 'Attack icon');
const FONT_SOURCE = path.join(SOURCE_ASSETS, 'fonts', '5_BurbinCasual.ttf');

const DATA_DIR = path.join(ROOT, 'src', 'packs', 'minhero', 'data');
const PUBLIC_ASSETS = path.join(ROOT, 'public', 'assets');
const MANIFEST_PATH = path.join(DATA_DIR, 'assets.json');

/** Minion display names whose art file does not match the name. */
const MINION_SPRITE_ALIASES = {
  Cerberus: 'Cerebus.png',
};

/** Curated UI art used by the app shell, gems and skill-tree views. */
const UI_TEXTURES = [
  ['pageBackdrop', 'menus_backgroundLarge.png'],
  ['minionIconBackground', 'menus_minionIcon_background.png'],
  ['minionIconMask', 'menus_minionIcon_mask.png'],
  ['minionPortraitStage', 'minionPedia_minionBackground.png'],
  ['minionPediaBackground', 'minionPedia_background.png'],
  ['movePanel', 'menus_movesBackground.png'],
  ['skillTreePanel', 'menus_skillTree_background.png'],
  ['skillTreeNode', 'menus_skillTree_buttonBackground.png'],
  ['skillTreeSpecialization', 'menus_skillTree_specializationBackground.png'],
  ['skillTreePoints', 'menus_skillTree_pointsBubble.png'],
  ['skillTreeOtherTree', 'menus_skillTree_otherTreeIndicator.png'],
  ['skillTreeReset', 'menus_skillTree_resetButton.png'],
  ['emptyGemSocket', 'menus_emptyGemSocket.png'],
  ['filledGemSocket', 'menus_minionInfo_filledGemSlot.png'],
  ['lockedGemSocket', 'menus_gemLockedButton.png'],
  ['gemCornerHealth', 'gemCornerRed.png'],
  ['gemCornerEnergy', 'gemCornerPurple.png'],
  ['gemCornerAttack', 'gemCornerOrange.png'],
  ['gemCornerHealing', 'gemCornerYellow.png'],
  ['gemCornerSpeed', 'gemCornerBlue.png'],
];

const GEM_TIER_COUNT = 11;

const ATTRIBUTION = `# Min Hero art

Sprites, move icons, gem shapes and UI textures in this folder are derived from
*Min Hero: Tower of Sages* © ToyChestGames and are used with permission.

Do not edit these files by hand. They are produced by \`scripts/import-assets.mjs\`
from the local, gitignored decompiled game and regenerated with:

\`\`\`powershell
npm.cmd run data:import
npm.cmd run assets:import
\`\`\`
`;

function kebab(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

async function readJson(fileName) {
  return JSON.parse(await readFile(path.join(DATA_DIR, fileName), 'utf8'));
}

async function requireFile(filePath, label) {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not a file');
    return info.size;
  } catch {
    throw new Error(`Missing ${label}: ${path.relative(ROOT, filePath)}`);
  }
}

async function copyAsset(sourceDir, sourceName, targetDir, targetName, label) {
  const source = path.join(sourceDir, sourceName);
  const size = await requireFile(source, label);
  const target = path.join(targetDir, targetName);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  return size;
}

function sortedRecord(entries) {
  return Object.fromEntries([...entries].sort(([a], [b]) => a.localeCompare(b, 'en')));
}

const minions = await readJson('minions.json');
const moves = await readJson('moves.json');

const manifest = {
  generatedFrom: 'minhero-towerofsages-main/Source Files',
  attribution: 'Min Hero: Tower of Sages © ToyChestGames. Art used with permission.',
  minions: {},
  moves: {},
  ui: {},
  stats: {
    minionSprites: 0,
    moveIcons: 0,
    uiTextures: 0,
    bytes: 0,
  },
};

const minionDir = path.join(PUBLIC_ASSETS, 'minions');
const minionEntries = [];
const spriteBytes = new Map();

for (const minion of minions) {
  const sourceName = MINION_SPRITE_ALIASES[minion.name] ?? `${minion.name}.png`;
  const targetName = `${minion.id}.png`;
  if (spriteBytes.has(sourceName)) {
    // Two minions sharing art is unexpected; catch it instead of silently
    // overwriting a sprite.
    throw new Error(
      `Sprite ${sourceName} is used by both ${spriteBytes.get(sourceName)} and ${minion.id}`,
    );
  }
  const size = await copyAsset(IMAGES_SOURCE, sourceName, minionDir, targetName, `sprite for ${minion.name}`);
  spriteBytes.set(sourceName, minion.id);
  manifest.stats.bytes += size;
  minionEntries.push([minion.id, `./assets/minions/${targetName}`]);
}

manifest.minions = sortedRecord(minionEntries);

const moveDir = path.join(PUBLIC_ASSETS, 'moves');
const moveEntries = [];
const copiedIcons = new Map();

for (const move of moves) {
  const icon = move.icon;
  if (!icon) continue;
  const stem = icon.replace(/^moveIcon_/, '');
  if (copiedIcons.has(icon)) continue;
  if (!/^[A-Za-z0-9]+$/.test(stem)) {
    throw new Error(`Unexpected move icon name "${icon}"`);
  }
  const size = await copyAsset(ATTACK_ICONS, `${stem}.png`, moveDir, `${stem}.png`, `move icon ${icon}`);
  copiedIcons.set(icon, `./assets/moves/${stem}.png`);
  manifest.stats.bytes += size;
  moveEntries.push([icon, `./assets/moves/${stem}.png`]);
}

manifest.moves = sortedRecord(moveEntries);

const uiDir = path.join(PUBLIC_ASSETS, 'ui');
const uiEntries = [];
for (const [key, sourceName] of UI_TEXTURES) {
  const targetName = `${kebab(key)}.png`;
  const size = await copyAsset(IMAGES_SOURCE, sourceName, uiDir, targetName, `UI texture ${sourceName}`);
  manifest.stats.bytes += size;
  uiEntries.push([key, `./assets/ui/${targetName}`]);
}
for (let tier = 1; tier <= GEM_TIER_COUNT; tier += 1) {
  for (const kind of ['shape', 'mask']) {
    const key = `gemTier${tier}${kind === 'shape' ? 'Shape' : 'Mask'}`;
    const sourceName = `gemTier${tier}_${kind}.png`;
    const targetName = `gem-tier-${tier}-${kind}.png`;
    const size = await copyAsset(IMAGES_SOURCE, sourceName, uiDir, targetName, `gem art ${sourceName}`);
    manifest.stats.bytes += size;
    uiEntries.push([key, `./assets/ui/${targetName}`]);
  }
}
manifest.ui = sortedRecord(uiEntries);

const fontDir = path.join(ROOT, 'src', 'assets', 'fonts');
const fontBytes = await copyAsset(
  path.dirname(FONT_SOURCE),
  path.basename(FONT_SOURCE),
  fontDir,
  'burbin-casual.ttf',
  'BurbinCasual font',
);
// The font is imported through src/styles/fonts.css, so Vite emits it with a
// hashed, base-relative URL instead of living in public/assets.
manifest.stats.bytes += fontBytes;

manifest.stats.minionSprites = minionEntries.length;
manifest.stats.moveIcons = moveEntries.length;
manifest.stats.uiTextures = uiEntries.length;

if (manifest.stats.minionSprites !== minions.length) {
  throw new Error(
    `Expected ${minions.length} minion sprites, wrote ${manifest.stats.minionSprites}`,
  );
}

const uniqueIcons = new Set(moves.map((move) => move.icon).filter(Boolean));
if (manifest.stats.moveIcons !== uniqueIcons.size) {
  throw new Error(`Expected ${uniqueIcons.size} move icons, wrote ${manifest.stats.moveIcons}`);
}

await mkdir(DATA_DIR, { recursive: true });
await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await writeFile(path.join(PUBLIC_ASSETS, 'ATTRIBUTION.md'), ATTRIBUTION, 'utf8');

const megabytes = (manifest.stats.bytes / (1024 * 1024)).toFixed(2);
console.log('Imported Min Hero assets:');
console.log(`  minion sprites: ${manifest.stats.minionSprites}`);
console.log(`  move icons: ${manifest.stats.moveIcons}`);
console.log(`  UI textures: ${manifest.stats.uiTextures} (+1 bundled font)`);
console.log(`  total size: ${megabytes} MB`);
if (manifest.stats.bytes > 6 * 1024 * 1024) {
  console.warn('  warning: assets exceed the 6 MB precache budget; consider downscaling.');
}
