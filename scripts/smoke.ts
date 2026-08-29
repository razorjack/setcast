// Renders 3 s of examples/demo and fails loudly unless the MP4 has an H.264 video track, an AAC
// audio track, and (when ffmpeg is available) visibly different frames. Run: vp run smoke
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const demo = join(root, 'examples/demo');
const audio = join(demo, 'assets/demo-set.wav');
const out = join(demo, 'out/smoke.mp4');
const range = '0:32-0:35';

/** The boxes a playable MP4 carries, and what a missing one means for the render. */
const REQUIRED_BOXES: [box: string, meaning: string][] = [
  ['ftyp', 'broken container'],
  ['moov', 'broken container'],
  ['avc1', 'broken container'],
  ['mp4a', 'no AAC audio track'],
];

ensureDemoAudio();
renderSlice();
checkContainer();
checkFramesMove();
console.log('smoke: PASS');

function ensureDemoAudio(): void {
  if (existsSync(audio)) return;
  console.log('smoke: demo audio missing, generating it');
  execFileSync(process.execPath, [join(root, 'scripts/make-demo-assets.ts')], { stdio: 'inherit' });
}

function renderSlice(): void {
  console.log(`smoke: rendering ${range} of examples/demo → out/smoke.mp4`);
  const cli = join(root, 'packages/cli/bin/setcast.js');
  const render = spawnSync(
    process.execPath,
    [cli, 'render', '--range', range, '--out', 'out/smoke.mp4'],
    { cwd: demo, stdio: 'inherit', env: { ...process.env, FORCE_COLOR: '1' } },
  );
  if (render.status !== 0) fail(`setcast render exited with ${render.status}`);
}

function checkContainer(): void {
  const size = statSync(out).size;
  if (size < 100_000) fail(`out/smoke.mp4 is only ${size} bytes; expected a real 3 s 1080p clip`);

  const bytes = readFileSync(out).toString('latin1');
  for (const [box, meaning] of REQUIRED_BOXES) {
    if (!bytes.includes(box)) fail(`MP4 is missing the "${box}" box (${meaning})`);
  }
  console.log(`smoke: container ok (${(size / 1e6).toFixed(2)} MB, h264 + aac)`);
}

/** Two frames far enough apart that anything animating at all makes them differ. */
function checkFramesMove(): void {
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    console.log('smoke: ffmpeg not found, skipping the moving-frames check');
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), 'setcast-smoke-'));
  const early = grabFrame(dir, '0.3', 'a.png');
  const late = grabFrame(dir, '2.4', 'b.png');
  if (early.equals(late)) fail('frames at 0.3 s and 2.4 s are identical; visuals are not moving');
  console.log('smoke: frames differ over time (visuals are moving)');
}

function grabFrame(dir: string, at: string, name: string): Buffer {
  const file = join(dir, name);
  execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-y',
    '-ss',
    at,
    '-i',
    out,
    '-frames:v',
    '1',
    file,
  ]);
  return readFileSync(file);
}

function fail(problem: string): never {
  console.error(`\nsmoke: FAIL – ${problem}`);
  process.exit(1);
}
