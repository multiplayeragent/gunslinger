// The desktop shell: Electron's main process. tools/build-desktop.mjs packages this file, preload.cjs and the
// hosted build (in ./game) into dist-desktop/. The game is served from app://gunslinger/, a fixed secure origin,
// so localStorage (settings, the saved night, the Multiplayer Agent player) stays with the app between launches.
//
//   Gunslinger.exe                 the game, in a 1600x900 window; F11 or Alt+Enter is fullscreen (remembered)
//   Gunslinger.exe --fullscreen    start fullscreen;  --windowed  start in a window;  --dev  devtools (F12)
//
// A scripted run, for checking a build (its own profile, "Gunslinger-test", never the player's):
//   Gunslinger.exe --gs-test="?map=vigil&shot=1&noaudio=1&noboards=1" --gs-out=<dir> --gs-wait=20 [--gs-eval=<file>]
// loads the page with that query, waits that many seconds, writes shot.png and state.json into the directory and
// quits. --gs-eval names a file holding one JavaScript expression (it may be async); its value is `eval` in
// state.json. --gs-shell also presses F11 and Alt+Enter, asks for the page's own fullscreen and for the mouse, and
// records what happened as `shell`. Scripted runs are muted and must carry noboards=1: leaderboard entries cannot
// be deleted. From a terminal inside an Electron app (VS Code), clear ELECTRON_RUN_AS_NODE first.
'use strict';
const { app, BrowserWindow, Menu, protocol, session, shell, screen, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const GAME = path.join(__dirname, 'game');
const ORIGIN = 'app://gunslinger';
const arg = (name) => { const a = process.argv.find((x) => x.startsWith('--' + name + '=')); return a ? a.slice(name.length + 3) : null; };
const flag = (name) => process.argv.includes('--' + name);
const meta = (() => { try { return require('./package.json'); } catch { return {}; } })();
const test = arg('gs-test');
const dev = flag('dev');

app.setName('Gunslinger');
if (test !== null) app.setPath('userData', arg('gs-profile') ? path.resolve(arg('gs-profile')) : path.join(app.getPath('appData'), 'Gunslinger-test'));

// the discrete GPU where there are two, WebGL 2 whatever the blocklist says, and sound without a first click
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.wasm': 'application/wasm',
};

// app://gunslinger/<path> is a file under ./game and nothing else
async function serve(request) {
  let url, rel;
  try { url = new URL(request.url); rel = decodeURIComponent(url.pathname); } catch { return new Response('bad request', { status: 400 }); }
  if (url.host !== 'gunslinger' || rel.includes('\0')) return new Response('not found', { status: 404 });
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(GAME, rel));
  if (!file.startsWith(GAME + path.sep)) return new Response('forbidden', { status: 403 });
  let data;
  try { data = await fs.promises.readFile(file); } catch { return new Response('not found', { status: 404 }); }
  const headers = { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache', 'accept-ranges': 'bytes' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
  if (range && (range[1] || range[2])) {
    const size = data.length;
    const from = range[1] ? +range[1] : Math.max(0, size - +range[2]);
    const to = range[1] && range[2] ? Math.min(size - 1, +range[2]) : size - 1;
    if (from > to || from >= size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    headers['content-range'] = `bytes ${from}-${to}/${size}`;
    return new Response(data.subarray(from, to + 1), { status: 206, headers });
  }
  return new Response(data, { status: 200, headers });
}

// whether the window was fullscreen when it was last closed
const windowFile = () => path.join(app.getPath('userData'), 'window.json');
const readWindow = () => { try { return JSON.parse(fs.readFileSync(windowFile(), 'utf8')) || {}; } catch { return {}; } };
const writeWindow = (doc) => { try { fs.writeFileSync(windowFile(), JSON.stringify(doc)); } catch { /* a read-only profile: start windowed next time */ } };

function createWindow() {
  const area = screen.getPrimaryDisplay().workAreaSize;
  const fullscreen = test !== null ? false : flag('fullscreen') ? true : flag('windowed') ? false : !!readWindow().fullscreen;
  const win = new BrowserWindow({
    width: Math.min(1600, area.width), height: Math.min(900, area.height), useContentSize: true, minWidth: 800, minHeight: 450,
    title: 'Gunslinger', backgroundColor: '#000000', autoHideMenuBar: true, fullscreen, show: false,
    icon: fs.existsSync(path.join(__dirname, 'icon.ico')) ? path.join(__dirname, 'icon.ico') : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: false, spellcheck: false, devTools: dev,
      additionalArguments: ['--gs-share=' + ((meta.gunslinger && meta.gunslinger.share) || ''), '--gs-version=' + (meta.version || '')],
    },
  });
  win.removeMenu();
  win.once('ready-to-show', () => win.show());
  win.on('page-title-updated', (e) => e.preventDefault());                       // the page's title is the browser tab's
  win.on('close', () => { if (test === null) writeWindow({ fullscreen: win.isFullScreen() }); });

  const wc = win.webContents;
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || input.isAutoRepeat) return;
    if (input.key === 'F11' || (input.key === 'Enter' && input.alt)) { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
    else if (dev && input.key === 'F12') { e.preventDefault(); wc.toggleDevTools(); }
  });
  // nothing but the game is shown in this window: any other address goes to the system browser
  wc.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  wc.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN + '/')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });
  wc.on('render-process-gone', (e, details) => { console.error('[gunslinger] renderer gone: ' + details.reason); if (test !== null) app.exit(3); });

  win.loadURL(ORIGIN + '/index.html' + (test ? (test.startsWith('?') ? test : '?' + test) : ''));
  if (dev) wc.openDevTools({ mode: 'detach' });
  if (test !== null) { wc.setAudioMuted(true); runTest(win).catch((err) => { console.error(err); app.exit(2); }); }   // a scripted run is silent
  return win;
}

// ---------------------------------------------------------------- a scripted run
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SNAPSHOT = (expr) => `(async () => {
  const G = window.__G, r = { origin: location.origin, href: location.href };
  r.ready = !!window.__ready; r.frames = window.__frames || 0; r.fatal = window.__fatal || null; r.errors = (window.__errors || []).slice(0, 20);
  try { r.stats = window.__stats ? window.__stats() : null; } catch (e) { r.stats = String(e); }
  r.state = G && G.game ? G.game.state : null;
  try {
    const gl = document.createElement('canvas').getContext('webgl2'), ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    r.webgl2 = !!gl; r.renderer = gl ? gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : null;
  } catch (e) { r.renderer = String(e); }
  r.gamepadApi = typeof navigator.getGamepads === 'function';
  try { r.pads = [...navigator.getGamepads()].filter(Boolean).map((p) => p.id); } catch (e) { r.pads = String(e); }
  r.secure = window.isSecureContext; r.sdk = !!window.MP;
  r.online = !!(window.GunslingerOnline && window.GunslingerOnline.available());
  r.desktop = window.GS_DESKTOP ? { share: window.GS_DESKTOP.share, version: window.GS_DESKTOP.version } : null;
  r.audio = G && G.audio && G.audio.ctx ? G.audio.ctx.state : null;
  r.size = [innerWidth, innerHeight, devicePixelRatio];
  r.runs = +(localStorage.getItem('gunslinger.desktop.test') || 0); localStorage.setItem('gunslinger.desktop.test', String(r.runs + 1));
  r.localStorageKeys = localStorage.length;
  try { r.eval = ${expr ? `await (${expr})` : 'null'}; } catch (e) { r.eval = 'threw: ' + (e && e.stack || e); }
  return r;
})()`;

async function runTest(win) {
  const out = path.resolve(arg('gs-out') || path.join(app.getPath('temp'), 'gunslinger-test'));
  const wait = Math.max(1, +arg('gs-wait') || 20), started = Date.now();
  const expr = arg('gs-eval') ? fs.readFileSync(path.resolve(arg('gs-eval')), 'utf8').trim().replace(/;+$/, '') : '';
  fs.mkdirSync(out, { recursive: true });
  let bootMs = null;
  while (Date.now() - started < wait * 1000) {
    await sleep(100);
    if (bootMs === null && await win.webContents.executeJavaScript('!!window.__ready').catch(() => false)) bootMs = Date.now() - started;
  }
  const state = await win.webContents.executeJavaScript(SNAPSHOT(expr), true);
  state.bootMs = bootMs; state.fullscreen = win.isFullScreen(); state.userData = app.getPath('userData');
  if (flag('gs-shell')) state.shell = await shellCheck(win);
  state.gpu = await app.getGPUInfo('basic').then((i) => (i.gpuDevice || []).map((d) => ({ vendor: d.vendorId, device: d.deviceId, active: !!d.active }))).catch(() => null);
  fs.writeFileSync(path.join(out, 'shot.png'), (await win.webContents.capturePage()).toPNG());
  fs.writeFileSync(path.join(out, 'state.json'), JSON.stringify(state, null, 1));
  app.quit();
}

// the shell's own behaviour, by sending it the keys: F11, Alt+Enter, the page's fullscreen call, the mouse capture
async function shellCheck(win) {
  const wc = win.webContents, r = {};
  const key = async (keyCode, modifiers = []) => {
    wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await sleep(1500); return win.isFullScreen();
  };
  r.f11 = [await key('F11'), await key('F11')];
  r.altEnter = [await key('Enter', ['alt']), await key('Enter', ['alt'])];
  r.pageFullscreen = await wc.executeJavaScript('document.documentElement.requestFullscreen().then(() => !!document.fullscreenElement, (e) => String(e))', true);
  await sleep(1200); r.windowDuringPageFullscreen = win.isFullScreen();
  await wc.executeJavaScript('document.exitFullscreen().then(() => 1, () => 0)', true); await sleep(1200); r.windowAfterPageFullscreen = win.isFullScreen();
  r.pointerLock = await wc.executeJavaScript(`(async () => {
    const c = document.querySelector('canvas'); try { await c.requestPointerLock(); } catch (e) { return String(e); }
    await new Promise((done) => setTimeout(done, 300)); const on = document.pointerLockElement === c; document.exitPointerLock(); return on;
  })()`, true);
  return r;
}

// ---------------------------------------------------------------- the app
ipcMain.on('gs-quit', () => app.quit());
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    protocol.handle('app', serve);
    // what the game asks for and nothing more: the mouse, fullscreen, and copying an invite link
    const allowed = new Set(['pointerLock', 'fullscreen', 'keyboardLock', 'clipboard-sanitized-write']);
    session.defaultSession.setPermissionRequestHandler((wc, permission, done) => done(allowed.has(permission)));
    createWindow();
  });
}
