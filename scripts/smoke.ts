// Renders 3 s of examples/demo and fails loudly unless the MP4 has an H.264 video track, an AAC
// audio track, and (with optional ffprobe/ffmpeg) the expected frame count and duration,
// non-silent decoded audio, and visibly different frames. Run: vp run smoke
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const demo = join(root, 'examples/demo');
const audio = join(demo, 'assets/demo-set.wav');
const out = join(demo, 'out/smoke.mp4');
const range = '0:32-0:35';
const expectedSeconds = 3;
const expectedFps = 30;

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
checkTracks();
checkDecodedAudio();
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
  console.log(`smoke: MP4 container markers ok (${(size / 1e6).toFixed(2)} MB)`);
}

interface ProbedStream {
  codec_type: string;
  codec_name: string;
  duration?: string;
  avg_frame_rate?: string;
  nb_read_frames?: string;
}

function checkTracks(): void {
  if (!hasTool('ffprobe')) {
    console.log('smoke: ffprobe not found, skipping codec, duration and frame-count checks');
    return;
  }
  const probe = JSON.parse(
    execFileSync(
      'ffprobe',
      ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', out],
      { encoding: 'utf8' },
    ),
  ) as { streams: ProbedStream[]; format: { duration: string } };
  const video = probe.streams.find((stream) => stream.codec_type === 'video');
  const audio = probe.streams.find((stream) => stream.codec_type === 'audio');
  if (video?.codec_name !== 'h264') fail(`expected H.264 video, received ${video?.codec_name}`);
  if (audio?.codec_name !== 'aac') fail(`expected AAC audio, received ${audio?.codec_name}`);
  const frames = Number(video.nb_read_frames);
  if (frames !== expectedSeconds * expectedFps) {
    fail(`expected ${expectedSeconds * expectedFps} decoded video frames, received ${frames}`);
  }
  const [numerator, denominator] = (video.avg_frame_rate ?? '').split('/').map(Number);
  if (numerator! / denominator! !== expectedFps) {
    fail(`expected ${expectedFps} fps, received ${video.avg_frame_rate}`);
  }
  checkDuration('video', video.duration);
  // The AAC track can retain encoder padding beyond the final video frame.
  checkDuration('audio', audio.duration, 0.1);
  checkDuration('container', probe.format.duration, 0.1);
  console.log(`smoke: ffprobe confirms h264 + aac, ${frames} frames, ${expectedSeconds} s`);
}

function checkDuration(
  track: string,
  encoded: string | undefined,
  tolerance = 1 / expectedFps,
): void {
  const seconds = Number(encoded);
  if (!Number.isFinite(seconds) || Math.abs(seconds - expectedSeconds) > tolerance) {
    fail(`expected ${track} duration ${expectedSeconds} s (±${tolerance} s), received ${encoded}`);
  }
}

function checkDecodedAudio(): void {
  if (!hasTool('ffmpeg')) {
    console.log('smoke: ffmpeg not found, skipping decoded-audio check');
    return;
  }
  const sampleRate = 48000;
  const pcm = execFileSync('ffmpeg', [
    '-v',
    'error',
    '-i',
    out,
    '-map',
    '0:a:0',
    '-ac',
    '1',
    '-ar',
    String(sampleRate),
    '-f',
    'f32le',
    'pipe:1',
  ]);
  const samples = pcm.length / 4;
  const seconds = samples / sampleRate;
  if (seconds < expectedSeconds - 1 / expectedFps || seconds > expectedSeconds + 0.1) {
    fail(`expected about ${expectedSeconds} s of decoded audio, received ${seconds} s`);
  }
  let power = 0;
  for (let offset = 0; offset < pcm.length; offset += 4) power += pcm.readFloatLE(offset) ** 2;
  const rms = Math.sqrt(power / samples);
  if (!Number.isFinite(rms) || rms <= 0.001) {
    fail(`decoded audio is silent or invalid (RMS ${rms})`);
  }
  console.log(`smoke: decoded audio is non-silent (RMS ${rms.toFixed(4)})`);
}

function hasTool(name: string): boolean {
  return spawnSync(name, ['-version'], { stdio: 'ignore' }).status === 0;
}

/** Two frames far enough apart that anything animating at all makes them differ. */
function checkFramesMove(): void {
  if (!hasTool('ffmpeg')) {
    console.log('smoke: ffmpeg not found, skipping the moving-frames check');
    return;
  }

  const early = grabFrame('0.3');
  const late = grabFrame('2.4');
  if (early.equals(late)) fail('frames at 0.3 s and 2.4 s are identical; visuals are not moving');
  console.log('smoke: frames differ over time (visuals are moving)');
}

function grabFrame(at: string): Buffer {
  const args = ['-loglevel', 'error', '-ss', at, '-i', out, '-frames:v', '1'];
  return execFileSync('ffmpeg', [...args, '-f', 'image2pipe', '-c:v', 'png', '-'], {
    maxBuffer: 32 * 1024 * 1024,
  });
}

function fail(problem: string): never {
  console.error(`\nsmoke: FAIL – ${problem}`);
  process.exit(1);
}
