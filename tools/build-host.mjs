// Makes dist/: the game as it is hosted. Every local script becomes one app.js (in the order index.html loads
// them, with the real key from mp.config.local.js), the stylesheets are inlined, and the scanned textures are
// re-encoded as WebP, which is most of the saving. node tools/build-host.mjs   (needs `sharp` for the textures;
// without it they are copied as they are and the build is about four times the size)
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), out = join(root, 'dist');
let sharp = null;
try { sharp = createRequire(import.meta.url)('sharp'); } catch { console.warn('sharp not found: textures are copied, not compressed'); }

rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
let html = readFileSync(join(root, 'index.html'), 'utf8');

// one script for everything of ours; the engine stays its own file, the SDK stays on its CDN
const parts = [];
html = html.replace(/<script src="([^"]+)"><\/script>\r?\n?/g, (tag, src) => {
  if (/^https?:/.test(src) || src.startsWith('vendor/')) return tag;
  const file = join(root, src);
  if (!existsSync(file)) { console.warn('skipped (missing): ' + src); return ''; }
  parts.push(`// ---- ${src}\n` + readFileSync(file, 'utf8'));
  return '';
});
let app = parts.join('\n;\n');
if (/pk_REPLACE_ME/.test(app) && !/pk_live_/.test(app)) console.warn('no real key (mp.config.local.js): the hosted build would be single-player only');
html = html.replace('<script src="vendor/gunslinger-engine.js"></script>', '<script src="app.js"></script><script src="vendor/gunslinger-engine.js"></script>');
html = html.replace(/<link rel="stylesheet" href="(src\/[^"]+)">/g, (tag, href) => `<style>${readFileSync(join(root, href), 'utf8')}</style>`);

// textures: WebP in place of JPEG and PNG, normals kept a little finer than colour
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const jobs = [];
for (const file of walk(join(root, 'assets'))) {
  const rel = relative(root, file).replace(/\\/g, '/'), dest = join(out, rel);
  mkdirSync(dirname(dest), { recursive: true });
  if (sharp && /\.(jpe?g|png)$/i.test(rel)) {
    const to = dest.replace(/\.(jpe?g|png)$/i, '.webp');
    jobs.push(sharp(file).webp({ quality: /nor\./.test(rel) ? 84 : 76, effort: 5 }).toFile(to));
    app = app.split(rel.split('/').pop()).join(rel.split('/').pop().replace(/\.(jpe?g|png)$/i, '.webp'));
  } else copyFileSync(file, dest);
}
await Promise.all(jobs);

mkdirSync(join(out, 'vendor'), { recursive: true });
copyFileSync(join(root, 'vendor/gunslinger-engine.js'), join(out, 'vendor/gunslinger-engine.js'));
writeFileSync(join(out, 'app.js'), app);
writeFileSync(join(out, 'index.html'), html);

const files = walk(out).map((f) => ({ path: relative(out, f).replace(/\\/g, '/'), size: statSync(f).size }));
writeFileSync(join(out, 'files.json'), JSON.stringify(files.filter((f) => f.path !== 'files.json'), null, 1));
const total = files.reduce((n, f) => n + f.size, 0);
console.log(`${files.length - 1} files, ${(total / 1048576).toFixed(1)} MB in dist/`);
