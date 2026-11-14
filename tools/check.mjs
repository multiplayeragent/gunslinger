// Syntax-checks every script the page loads, plus the tools.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = ['vendor/gunslinger-engine.js', ...readdirSync('src').filter((f) => f.endsWith('.js')).map((f) => 'src/' + f),
  ...readdirSync('src/vigil').filter((f) => f.endsWith('.js')).map((f) => 'src/vigil/' + f), ...readdirSync('tools').filter((f) => f.endsWith('.mjs')).map((f) => 'tools/' + f)];
let failed = 0;
for (const f of files) { const r = spawnSync(process.execPath, ['--check', f], { stdio: 'inherit' }); if (r.status !== 0) failed++; }
console.log(failed ? failed + ' file(s) failed' : files.length + ' files OK');
process.exit(failed ? 1 : 0);
