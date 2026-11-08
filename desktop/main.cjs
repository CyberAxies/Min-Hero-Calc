'use strict';

// Electron shell for the static Min Hero Calc build.
//
// The Vite output is ES modules, which Chromium refuses to load over file://
// (opaque origin + CORS). Everything is therefore served from a custom,
// privileged `app://` scheme, which also gives localStorage a stable origin that
// survives app updates.
const { app, BrowserWindow, Menu, net, protocol, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCHEME = 'app';
const ORIGIN = `${SCHEME}://minhero`;
const START_URL = `${ORIGIN}/index.html`;

// Name the profile after the product, not the npm package, so team/build data
// lives in %APPDATA%\Min Hero Calc. Must happen before Electron resolves paths.
app.setName('Min Hero Calc');
app.setPath('userData', path.join(app.getPath('appData'), 'Min Hero Calc'));

const WEB_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, 'app-dist')
  : path.join(__dirname, 'dist');

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

function resolveAsset(requestUrl) {
  let pathname;
  try {
    ({ pathname } = new URL(requestUrl));
  } catch {
    return null;
  }
  const relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const target = path.normalize(path.join(WEB_ROOT, relative));
  if (target !== WEB_ROOT && !target.startsWith(WEB_ROOT + path.sep)) return null;
  return fs.existsSync(target) && fs.statSync(target).isFile() ? target : null;
}

function registerProtocol() {
  protocol.handle(SCHEME, (request) => {
    const file = resolveAsset(request.url);
    if (!file) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 880,
    minWidth: 380,
    minHeight: 640,
    title: 'Min Hero Calc',
    backgroundColor: '#0b1220',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  // Never leave the user with an invisible window if the bundle fails to load.
  win.webContents.on('did-fail-load', () => win.show());

  // The app has no external links, but never let a stray one navigate the shell.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(ORIGIN)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) void shell.openExternal(url);
  });

  void win.loadURL(START_URL);
  return win;
}

// `--smoke` renders the app in a hidden window and asserts that it actually
// booted (DOM built, CSS applied, art loaded, localStorage writable). Used by
// the packaging scripts and CI to prove an artifact works without a screen.
async function runSmoke() {
  const win = new BrowserWindow({
    width: 1280,
    height: 880,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('timed out waiting for the app to load')), 20000);
  });

  try {
    await Promise.race([win.loadURL(START_URL), timeout]);
    const report = await win.webContents.executeJavaScript(`(async () => {
      const screen = {
        route: document.documentElement.dataset.route || null,
        viewChildren: (document.getElementById('view') || { children: [] }).children.length,
        buttons: document.querySelectorAll('button').length,
        styleSheets: document.styleSheets.length,
      };
      let storage = 'unavailable';
      try {
        localStorage.setItem('mhc:smoke', '1');
        storage = localStorage.getItem('mhc:smoke') === '1' ? 'ok' : 'mismatch';
        localStorage.removeItem('mhc:smoke');
      } catch (error) {
        storage = String(error && error.message ? error.message : error);
      }

      // Visit the roster so sprites and the data pack are exercised too.
      location.hash = '#/minions';
      for (let i = 0; i < 120 && !document.querySelector('.minion-avatar__sprite'); i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      const sprite = document.querySelector('.minion-avatar__sprite');
      const cards = document.querySelectorAll('.minion-avatar').length;
      let asset = null;
      if (sprite) {
        try {
          const response = await fetch(sprite.getAttribute('src'), { cache: 'no-store' });
          asset = {
            status: response.status,
            bytes: (await response.arrayBuffer()).byteLength,
            type: response.headers.get('content-type'),
          };
        } catch (error) {
          asset = { error: String(error && error.message ? error.message : error) };
        }
      }

      return {
        title: document.title,
        headings: document.querySelectorAll('.app-header__title').length,
        screen,
        storage,
        roster: {
          route: document.documentElement.dataset.route || null,
          cards,
          asset,
        },
      };
    })()`);

    const problems = [];
    if (report.title !== 'Min Hero Calc') problems.push(`title is "${report.title}"`);
    if (report.headings !== 1) problems.push('header did not render');
    if (report.screen.viewChildren < 1) problems.push('team view is empty');
    if (report.screen.buttons < 5) problems.push(`only ${report.screen.buttons} buttons rendered`);
    if (report.screen.styleSheets < 1) problems.push('stylesheet missing');
    if (report.screen.route !== 'team') problems.push(`start route is "${report.screen.route}"`);
    if (report.storage !== 'ok') problems.push(`localStorage ${report.storage}`);
    if (report.roster.route !== 'minions') problems.push('roster route did not render');
    if (report.roster.cards < 50) problems.push(`only ${report.roster.cards} roster avatars`);
    if (!report.roster.asset) problems.push('no sprite to probe');
    else if (report.roster.asset.status !== 200) {
      problems.push(`sprite request returned ${report.roster.asset.status ?? report.roster.asset.error}`);
    } else if (report.roster.asset.bytes < 100) {
      problems.push(`sprite is only ${report.roster.asset.bytes} bytes`);
    }

    const result = { ok: problems.length === 0, problems, report };
    const out = process.env.MHC_SMOKE_OUT;
    if (out) fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`smoke: ${result.ok ? 'ok' : 'FAILED'} ${JSON.stringify(result)}`);
    app.exit(result.ok ? 0 : 1);
  } catch (error) {
    const result = { ok: false, problems: [String(error && error.stack ? error.stack : error)] };
    const out = process.env.MHC_SMOKE_OUT;
    if (out) fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
    console.error('smoke: FAILED', error);
    app.exit(1);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.cyberaxies.minherocalc');
    registerProtocol();

    // The app is a static bundle: it never needs camera, notifications, etc.
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    );

    if (process.argv.includes('--smoke')) {
      void runSmoke();
      return;
    }

    if (app.isPackaged) Menu.setApplicationMenu(null);
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
