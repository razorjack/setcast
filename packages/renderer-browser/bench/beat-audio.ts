import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { LiveAudio } from '../src/live/audio.ts';
import { CaptureBeatTracker } from '../src/live/capture-beat-tracker.ts';

const file = process.argv[2];
if (!file) throw new Error('Usage: node bench/beat-audio.ts <audio> [minimum BPM] [maximum BPM]');
const decoded = spawnSync(
  'ffmpeg',
  ['-v', 'error', '-i', file, '-t', '120', '-f', 'f32le', '-ac', '1', '-ar', '8000', 'pipe:1'],
  { maxBuffer: 8 * 1024 * 1024 },
);
if (decoded.status !== 0) throw new Error(decoded.stderr.toString());
const pcm = new Float32Array(
  decoded.stdout.buffer.slice(
    decoded.stdout.byteOffset,
    decoded.stdout.byteOffset + decoded.stdout.byteLength,
  ),
);
const audio = new LiveAudio(8000);
const tracker = new CaptureBeatTracker();
tracker.configure({ min: Number(process.argv[3] ?? 90), max: Number(process.argv[4] ?? 180) });
const observations = [];
const started = performance.now();
for (let start = 0; start < pcm.length; start += 800) {
  const packet = pcm.subarray(start, start + 800);
  audio.append(start, packet, packet);
  tracker.update(audio);
  if (start % 8000 === 0)
    observations.push({
      at: audio.capturedTime,
      state: tracker.state,
      ...tracker.estimate,
      reason: tracker.reason,
    });
}
process.stdout.write(
  JSON.stringify(
    { seconds: pcm.length / 8000, analysisMs: performance.now() - started, observations },
    null,
    2,
  ) + '\n',
);
