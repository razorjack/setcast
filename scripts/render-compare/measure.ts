import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cpus, loadavg } from 'node:os';
import { stat } from 'node:fs/promises';

const execute = promisify(execFile);
const cpuTimes = () =>
  cpus().reduce(
    (sum, cpu) => ({
      idle: sum.idle + cpu.times.idle,
      total: sum.total + Object.values(cpu.times).reduce((total, time) => total + time, 0),
    }),
    { idle: 0, total: 0 },
  );

export function measureLoad() {
  let previous = cpuTimes();
  const initialLoadAverage = loadavg();
  let count = 0,
    sum = 0,
    max = 0,
    nodeRssPeak = process.memoryUsage().rss;
  const sample = () => {
    const next = cpuTimes();
    const elapsed = next.total - previous.total;
    if (elapsed > 0) {
      const busy = 1 - (next.idle - previous.idle) / elapsed;
      count++;
      sum += busy;
      max = Math.max(max, busy);
    }
    previous = next;
    nodeRssPeak = Math.max(nodeRssPeak, process.memoryUsage().rss);
  };
  const timer = setInterval(sample, 1000);
  return {
    stop() {
      clearInterval(timer);
      return {
        samples: count,
        meanSystemBusy: count ? sum / count : null,
        maxSystemBusy: count ? max : null,
        initialLoadAverage,
        finalLoadAverage: loadavg(),
        nodeRssPeak,
        scope: 'System CPU includes renderer and other jobs; RSS is Node only, not process tree.',
      };
    },
  };
}

type Stream = {
  codec_type: string;
  codec_name: string;
  width?: number;
  height?: number;
  nb_read_frames?: string;
  avg_frame_rate?: string;
};

export async function verifyVideo(
  file: string,
  expected: { width: number; height: number; fps: number; frames: number },
  signal: AbortSignal,
) {
  const started = performance.now();
  const probe = await execute(
    'ffprobe',
    ['-v', 'error', '-count_frames', '-show_streams', '-of', 'json', file],
    { maxBuffer: 1024 * 1024, signal },
  );
  const streams: Stream[] = JSON.parse(probe.stdout).streams;
  const video = streams.find((stream) => stream.codec_type === 'video');
  const audio = streams.find((stream) => stream.codec_type === 'audio');
  const [numerator, denominator] = (video?.avg_frame_rate ?? '').split('/').map(Number);
  if (
    video?.codec_name !== 'h264' ||
    audio?.codec_name !== 'aac' ||
    video.width !== expected.width ||
    video.height !== expected.height ||
    Number(video.nb_read_frames) !== expected.frames ||
    numerator! / denominator! !== expected.fps
  )
    throw new Error(
      `Decoded stream validation failed for ${file}. Keep the output and inspect its streams.`,
    );
  const decoded = await execute(
    'ffmpeg',
    ['-v', 'error', '-xerror', '-i', file, '-map', '0:v:0', '-f', 'hash', '-hash', 'sha256', '-'],
    { maxBuffer: 1024 * 1024, signal },
  );
  return {
    frames: expected.frames,
    bytes: (await stat(file)).size,
    decodedVideoHash: decoded.stdout.trim(),
    seconds: (performance.now() - started) / 1000,
    scope:
      'Full video decode and stream metadata; no pixel equivalence or audio alignment assertion.',
  };
}

export function summarize(runs: { renderer: string; wallSeconds: number }[]) {
  return Object.fromEntries(
    ['browser', 'remotion'].map((renderer) => {
      const seconds = runs
        .filter((run) => run.renderer === renderer)
        .map((run) => run.wallSeconds)
        .sort((a, b) => a - b);
      const middle = Math.floor(seconds.length / 2);
      const median =
        seconds.length % 2 ? seconds[middle] : (seconds[middle - 1]! + seconds[middle]!) / 2;
      return [
        renderer,
        {
          runs: seconds.length,
          medianSeconds: median,
          minSeconds: seconds[0],
          maxSeconds: seconds.at(-1),
        },
      ];
    }),
  );
}
