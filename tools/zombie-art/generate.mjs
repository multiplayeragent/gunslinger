// Step 2 of the body textures: sends jobs to the image tool of a signed-in Codex CLI and saves what comes back.
// node generate.mjs jobs.json [how many at once]   with jobs.json from: node prompts.cjs <mannequin dir> <art dir> <stage>
// A job: { out, prompt, size: "1024x1536", inputs: [the picture to paint over, references...] }
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { writeFile, mkdir, copyFile, readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

function codexPath() {
  const bin = join(process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? '', 'AppData', 'Local'), 'OpenAI', 'Codex', 'bin');
  const found = existsSync(bin)
    ? readdirSync(bin).map((d) => join(bin, d, 'codex.exe')).filter((f) => existsSync(f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    : [];
  return found[0] ?? 'codex';
}

async function one({ out, prompt, size = '1024x1024', inputs = [] }) {
  out = resolve(out);
  inputs = inputs.map((f) => resolve(f));
  const work = `${out}.codex`;
  await mkdir(work, { recursive: true });
  const schema = { type: 'object', additionalProperties: false, properties: { path: { type: 'string' }, note: { type: 'string' } }, required: ['path', 'note'] };
  await writeFile(join(work, 'schema.json'), JSON.stringify(schema));
  const [w, h] = size.split('x');
  const full = [
    `Generate ONE actual PNG with the built-in image_gen tool, ${inputs.length > 1 ? 'editing the first attached image and using the others as references' : inputs.length ? 'editing the attached image' : 'from this description alone'}. No other agents, no code, no file edits, exactly one image.`,
    prompt,
    `${Number(w) > Number(h) ? 'Landscape' : Number(w) < Number(h) ? 'Portrait' : 'Square'} canvas, ${w}x${h}.`,
    'Return the real generated file path. If image generation is unavailable return an empty path and explain in note.',
  ].join(' ');
  const args = ['exec', '--skip-git-repo-check', '--ephemeral', '--sandbox', 'workspace-write', '--json', '--output-schema', join(work, 'schema.json'), '-o', join(work, 'result.json'), '-c', 'model_reasoning_effort="low"', ...(inputs.length ? ['--image', inputs.join(',')] : []), '--disable', 'multi_agent', '-'];
  const code = await new Promise((res, rej) => {
    const child = spawn(codexPath(), args, { cwd: work, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', (d) => (log += d));
    child.stderr.on('data', (d) => (log += d));
    const timer = setTimeout(() => child.kill(), 900_000);
    child.on('error', rej);
    child.on('close', async (c) => { clearTimeout(timer); await writeFile(join(work, 'codex.log'), log).catch(() => {}); res(c); });
    child.stdin.end(full);
  });
  let result = {};
  try { result = JSON.parse(await readFile(join(work, 'result.json'), 'utf8')); } catch {}
  if (code !== 0 || !result.path || !existsSync(result.path)) throw new Error(`exit ${code}: ${(result.note || 'no image returned').slice(0, 300)} (log ${join(work, 'codex.log')})`);
  await mkdir(dirname(out), { recursive: true });
  await copyFile(result.path, out);
  await rm(work, { recursive: true, force: true });
  return out;
}

const jobs = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const conc = Number(process.argv[3] || 3);
let next = 0, failed = 0;
await Promise.all(Array.from({ length: Math.min(conc, jobs.length) }, async () => {
  while (next < jobs.length) {
    const job = jobs[next++];
    if (existsSync(resolve(job.out)) && !job.force) { console.log('skip (exists)', job.out); continue; }
    const t = Date.now();
    try { await one(job); console.log('ok', job.out, Math.round((Date.now() - t) / 1000) + 's'); }
    catch (e) { failed++; console.log('FAIL', job.out, e.message); }
  }
}));
process.exit(failed ? 1 : 0);
