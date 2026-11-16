// Makes the Churchyard's music files from seamless loops cut elsewhere (one WAV per cue, PCM, any sample rate).
//
//   node tools/music/build.mjs prep=<loop.wav> wave=<loop.wav> surge=<loop.wav> boss=<loop.wav>
//
// A cue named here is rebuilt; the others keep the files and loop points they have. Needs ffmpeg on the PATH
// (or FFMPEG=<path>).
//
// The game loops a cue inside its decoded buffer, between two points, instead of looping the file end to end:
// an MP3 decoder adds silence of its own at both ends, and a loop that crosses it clicks. So each file is the
// loop with half a second of itself before it (the end of the loop) and after it (its beginning), and the loop
// points sit that far inside. Whatever a decoder shifts or pads, what plays across the seam is the loop itself.
// 32 kHz at 112 kbit/s keeps the four files near 3.5 MB; the game decodes them at that rate, which is also a
// third less memory than the mixer's own.
import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(root, 'assets', 'music');
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const PAD = 0.5, RATE = 32000, BITRATE = '112k';
// gain: what the game multiplies a cue by on its way into the engine's music path (bus gain 0.73). The loops are
// at -18 LUFS; these put the organ near -24 dB RMS at the master chain's input and the fights near -20, with
// the Music slider at full.
const CUES = {
  prep: { file: 'vigil-prep.mp3', title: 'The Vigil', gain: 0.97 },
  wave: { file: 'vigil-wave.mp3', title: 'The Dead Walk', gain: 1.59 },
  surge: { file: 'vigil-surge.mp3', title: 'Horde', gain: 1.81 },
  boss: { file: 'vigil-boss.mp3', title: 'Abomination', gain: 1.91 },
};

// length of a PCM WAV in seconds, from its header
function wavSeconds(path) {
  const fd = openSync(path, 'r'), head = Buffer.alloc(Math.min(statSync(path).size, 1 << 16));
  readSync(fd, head, 0, head.length, 0); closeSync(fd);
  if (head.toString('ascii', 0, 4) !== 'RIFF' || head.toString('ascii', 8, 12) !== 'WAVE') throw new Error(path + ': not a WAV file');
  let at = 12, byteRate = 0;
  while (at + 8 <= head.length) {
    const id = head.toString('ascii', at, at + 4), size = head.readUInt32LE(at + 4);
    if (id === 'fmt ') byteRate = head.readUInt32LE(at + 16);
    if (id === 'data') { if (!byteRate) break; return Math.min(size, statSync(path).size - at - 8) / byteRate; }
    at += 8 + size + (size & 1);
  }
  throw new Error(path + ': no data chunk in the first 64 KB');
}

const manifestPath = join(out, 'vigil.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const args = process.argv.slice(2).map((a) => a.split('='));
if (!args.length || args.some(([id, file]) => !CUES[id] || !file)) {
  console.error('usage: node tools/music/build.mjs prep=<loop.wav> wave=<loop.wav> surge=<loop.wav> boss=<loop.wav>');
  process.exit(1);
}
mkdirSync(out, { recursive: true });
for (const [id, file] of args) {
  const src = resolve(file), len = wavSeconds(src), cue = CUES[id], to = join(out, cue.file);
  if (len < 4 * PAD) throw new Error(`${file}: ${len.toFixed(2)} s is too short to loop`);
  const graph = `[0:a]asplit=3[a][b][c];[a]atrim=start=${(len - PAD).toFixed(6)},asetpts=PTS-STARTPTS[pre];[c]atrim=end=${PAD},asetpts=PTS-STARTPTS[post];[pre][b][post]concat=n=3:v=0:a=1,aresample=${RATE}[o]`;
  execFileSync(FFMPEG, ['-y', '-v', 'error', '-i', src, '-filter_complex', graph, '-map', '[o]', '-c:a', 'libmp3lame', '-b:a', BITRATE, '-map_metadata', '-1', to], { stdio: 'inherit' });
  manifest[id] = { file: cue.file, title: cue.title, start: PAD, end: +(PAD + len).toFixed(4), gain: cue.gain };
  console.log(`${id}: ${cue.file}, loop ${len.toFixed(2)} s, ${(statSync(to).size / 1024).toFixed(0)} KB`);
}
const ordered = {};
for (const id of Object.keys(CUES)) if (manifest[id]) ordered[id] = manifest[id];
writeFileSync(manifestPath, JSON.stringify(ordered, null, 1) + '\n');
console.log('assets/music/vigil.json: ' + Object.keys(ordered).join(', '));
