// Copies the built web app into the Electron package.
// Electron cannot load ES modules over file://, so main.cjs serves this folder
// through a custom `app://` protocol instead.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = resolve(desktopDir, '..');
const distDir = join(rootDir, 'dist');

function fail(message) {
  console.error(`prepare-app: ${message}`);
  process.exit(1);
}

if (!existsSync(join(distDir, 'index.html'))) {
  fail('dist/index.html is missing — run `npm run build` at the repo root first.');
}

const assetCount = existsSync(join(distDir, 'assets'))
  ? readdirSync(join(distDir, 'assets')).length
  : 0;
if (assetCount === 0) {
  fail('dist/assets is empty — run `npm run build` at the repo root first.');
}

rmSync(join(desktopDir, 'dist'), { recursive: true, force: true });
cpSync(distDir, join(desktopDir, 'dist'), { recursive: true });

// Keep the Electron package version identical to the web app, so the artifact
// filenames match the release tag.
const rootPackage = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const packagePath = join(desktopDir, 'package.json');
const desktopPackage = JSON.parse(readFileSync(packagePath, 'utf8'));
if (desktopPackage.version !== rootPackage.version) {
  desktopPackage.version = rootPackage.version;
  writeFileSync(packagePath, `${JSON.stringify(desktopPackage, null, 2)}\n`);
}

const iconSource = join(rootDir, 'public', 'icons', 'icon-512.png');
if (!existsSync(iconSource)) fail('public/icons/icon-512.png is missing — run `npm run icons`.');
mkdirSync(join(desktopDir, 'build'), { recursive: true });
cpSync(iconSource, join(desktopDir, 'build', 'icon.png'));

console.log(
  `prepare-app: copied ${assetCount} built assets to desktop/dist (v${rootPackage.version}).`,
);
