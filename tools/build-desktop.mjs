// Makes dist-desktop/: the game as a Windows desktop app. The hosted build (tools/build-host.mjs, with the real
// key from mp.config.local.js) is wrapped in Electron (tools/desktop/main.cjs) and packaged as
//   dist-desktop/Gunslinger-win32-x64/Gunslinger.exe   and   dist-desktop/Gunslinger-win-x64.zip
// dist-desktop/ is gitignored and must stay out of the repository: it carries the key and the music.
//
// Needs two packages the repo does not declare, installed anywhere outside it, and found through NODE_PATH:
//   mkdir ../gs-tools && cd ../gs-tools && npm init -y && npm i sharp @electron/packager
//   NODE_PATH=../gs-tools/node_modules node tools/build-desktop.mjs          (bash)
//   $env:NODE_PATH = '..\gs-tools\node_modules'; node tools/build-desktop.mjs  (PowerShell)
// The first run downloads Electron itself (about 130 MB, cached by the packager). Without `sharp` the textures
// are copied uncompressed, as in the hosted build.
//
//   --share <url>     the hosted address a co-op invite should carry (or GS_SHARE_URL); see tools/desktop/preload.cjs
//   --electron <v>    another Electron version;   --no-zip   skip the archive;   --keep-locales   keep every language pack
//
// Checking a build without playing it (see the header of tools/desktop/main.cjs for the flags):
//   dist-desktop/Gunslinger-win32-x64/Gunslinger.exe --gs-test="?map=vigil&shot=1&noaudio=1&noboards=1" --gs-out=<dir> --gs-wait=20
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const ELECTRON = '45.3.2';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), shell = join(root, 'tools', 'desktop');
const outRoot = join(root, 'dist-desktop'), stage = join(outRoot, '.stage'), appDir = join(stage, 'app');
const opt = (name) => (process.argv.includes('--' + name) ? process.argv[process.argv.indexOf('--' + name) + 1] : null);
const has = (name) => process.argv.includes('--' + name);

let packager;
try { ({ packager } = await import(pathToFileURL(createRequire(import.meta.url).resolve('@electron/packager')).href)); }
catch { console.error('@electron/packager not found: install it outside the repo and set NODE_PATH (see the top of this file)'); process.exit(1); }

// 1. the game, exactly as it is hosted
rmSync(stage, { recursive: true, force: true }); mkdirSync(appDir, { recursive: true });
const host = spawnSync(process.execPath, [join(root, 'tools', 'build-host.mjs'), '--out', join(appDir, 'game')], { stdio: 'inherit' });
if (host.status !== 0) { console.error('the hosted build failed'); process.exit(1); }
rmSync(join(appDir, 'game', 'files.json'), { force: true });                     // the publisher's list, not the game's
if (!/pk_live_/.test(readFileSync(join(appDir, 'game', 'app.js'), 'utf8'))) console.warn('no real key (mp.config.local.js): this desktop build is single-player only');

// 2. the shell round it
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const share = opt('share') || process.env.GS_SHARE_URL || '';
for (const f of ['main.cjs', 'preload.cjs', 'icon.ico']) if (existsSync(join(shell, f))) copyFileSync(join(shell, f), join(appDir, f));
writeFileSync(join(appDir, 'package.json'), JSON.stringify({
  name: 'gunslinger', productName: 'Gunslinger', version: pkg.version || '0.1.0', description: pkg.description || 'Gunslinger',
  private: true, main: 'main.cjs', gunslinger: { share },
}, null, 1));

// 3. Electron
const [folder] = await packager({
  dir: appDir, out: outRoot, name: 'Gunslinger', platform: 'win32', arch: 'x64', electronVersion: opt('electron') || ELECTRON,
  overwrite: true, asar: false, prune: false, icon: existsSync(join(shell, 'icon.ico')) ? join(shell, 'icon.ico') : undefined,
  appVersion: pkg.version || '0.1.0', win32metadata: { ProductName: 'Gunslinger', FileDescription: 'Gunslinger', CompanyName: 'Gunslinger' },
});
if (!has('keep-locales')) for (const f of readdirSync(join(folder, 'locales'))) if (f !== 'en-US.pak') rmSync(join(folder, 'locales', f));
rmSync(stage, { recursive: true, force: true });

// 4. one archive of it (Windows ships bsdtar, which writes .zip; elsewhere `zip` if there is one)
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
const size = walk(folder).reduce((n, f) => n + statSync(f).size, 0);
console.log(`${folder}: ${mb(size)}`);
if (!has('no-zip')) {
  const zip = join(outRoot, 'Gunslinger-win-x64.zip'), name = folder.split(/[\\/]/).pop();
  rmSync(zip, { force: true });
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : null;
  const done = tar && existsSync(tar)
    ? spawnSync(tar, ['-a', '-c', '-f', zip, '-C', outRoot, name], { stdio: 'inherit' })
    : spawnSync('zip', ['-r', '-q', zip, name], { cwd: outRoot, stdio: 'inherit' });
  if (done.status === 0 && existsSync(zip)) console.log(`${zip}: ${mb(statSync(zip).size)}`);
  else console.warn('no archive written: neither bsdtar nor zip would make one');
}
