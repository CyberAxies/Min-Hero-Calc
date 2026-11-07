#!/usr/bin/env node
/**
 * Builds the Android release APK and copies it to `release/`.
 *
 * Needs a JDK (`JAVA_HOME`) and the Android SDK (`ANDROID_HOME`, or `sdk.dir`
 * in `android/local.properties`). Release signing comes from
 * `android/key.properties` or the `ANDROID_KEYSTORE*` environment variables;
 * without them Gradle emits an unsigned APK.
 *
 * Run from the repo root:  npm run android:apk
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = join(rootDir, 'android');
const gradle = process.platform === 'win32' ? 'gradlew.bat' : 'gradlew';
const GRADLE_ARGS = ['assembleRelease', '--console=plain'];

function fail(message) {
  console.error(`android: ${message}`);
  process.exit(1);
}

if (!existsSync(join(androidDir, gradle))) {
  fail('android/gradlew is missing — run `npx cap add android` first.');
}

const env = { ...process.env };

if (!env.JAVA_HOME) {
  fail(
    'JAVA_HOME is not set. Install a JDK 21 (Capacitor 8 needs 17+) and point JAVA_HOME at it.',
  );
}

if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT) {
  const localProperties = join(androidDir, 'local.properties');
  const sdkDir = existsSync(localProperties)
    ? /^sdk\.dir=(.+)$/m.exec(readFileSync(localProperties, 'utf8'))?.[1]?.trim()
    : undefined;
  if (!sdkDir) {
    fail('ANDROID_HOME is not set and android/local.properties has no sdk.dir.');
  }
  env.ANDROID_HOME = sdkDir;
  env.ANDROID_SDK_ROOT = sdkDir;
}

console.log('android: running gradlew assembleRelease');
// `shell: true` would concatenate arguments (and warns about it), so on Windows
// the batch file is handed to cmd.exe. On POSIX the script is run through `sh`
// because the executable bit does not survive a Windows checkout reliably.
const spawnArgs =
  process.platform === 'win32'
    ? { command: process.env.ComSpec ?? 'cmd.exe', args: ['/c', gradle, ...GRADLE_ARGS] }
    : { command: 'sh', args: [gradle, ...GRADLE_ARGS] };
const build = spawnSync(spawnArgs.command, spawnArgs.args, {
  cwd: androidDir,
  env,
  stdio: 'inherit',
});

if (build.error) fail(`could not start gradle: ${build.error.message}`);
if (build.status !== 0) fail(`gradle exited with ${build.status}`);

const version = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')).version;
const apkName = `MinHeroCalc-${version}.apk`;

const candidates = [
  join(androidDir, 'app/build/outputs/apk/release/app-release.apk'),
  join(androidDir, 'app/build/outputs/apk/release/app-release-unsigned.apk'),
];
const built = candidates.find((path) => existsSync(path));
if (!built) fail('gradle produced no APK in android/app/build/outputs/apk/release.');

const outDir = join(rootDir, 'release');
mkdirSync(outDir, { recursive: true });
const target = join(outDir, apkName);
copyFileSync(built, target);
console.log(`android: wrote ${target} (${(statSync(target).size / 1024 / 1024).toFixed(1)} MB)`);

if (built.endsWith('-unsigned.apk')) {
  console.warn(
    'android: WARNING — the APK is unsigned and will not install. Add android/key.properties or ANDROID_KEYSTORE* env vars.',
  );
}
