import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { load, withWholeSet } from '../../../cli/src/project.ts';
import { render, type BrowserMetric } from '../../src/export/index.ts';
import type { EnduranceConfig } from './config.ts';
import type { EnduranceReport } from './report.ts';

export async function runExport(
  config: EnduranceConfig,
  out: string,
  report: EnduranceReport,
  signal: AbortSignal,
) {
  const loaded = await load(config.project);
  const project = await withWholeSet(loaded);
  const end = config.at + config.seconds;
  if (end > project.mix.duration / 1_000_000)
    throw new Error(
      `Endurance range ${config.at}–${end}s exceeds ${config.project}. Use a longer master or reduce seconds; endurance runs do not clamp ranges.`,
    );
  const metrics = exportMetrics();
  const file = join(out, 'export.mp4');
  const stop = new AbortController();
  const rendering = render(project, {
    projectDir: loaded.dir,
    out: file,
    range: [config.at, end],
    concurrency: config.concurrency,
    onMetrics: metrics.measured,
    signal: AbortSignal.any([signal, stop.signal]),
  });
  const result = await sampleExport(rendering, { report, metrics, config, stop });
  report.report.details = {
    ...report.report.details,
    result,
    stats: metrics.stats,
    width: project.width,
    height: project.height,
    fps: project.fps,
    frames: metrics.frames(),
  };
  verifyVideo(file, result.frames, project.fps);
}

function exportMetrics() {
  const stats: Record<string, { count: number; sum: number; max: number }> = {};
  let frames = 0;
  const measured = (metric: BrowserMetric) => {
    if (metric.kind !== 'frame') {
      add(stats, metric.kind, metric.milliseconds);
      return;
    }
    frames++;
    for (const key of [
      'audioMs',
      'resolveMs',
      'commitMs',
      'readinessMs',
      'captureMs',
      'bytes',
    ] as const)
      add(stats, key, metric[key]);
  };
  return { stats, measured, frames: () => frames };
}

async function sampleExport<T>(
  rendering: Promise<T>,
  options: {
    report: EnduranceReport;
    metrics: ReturnType<typeof exportMetrics>;
    config: EnduranceConfig;
    stop: AbortController;
  },
) {
  const { report, metrics, config, stop } = options;
  let finished = false;
  // Attach a rejection handler before sampling so an early failure is never unhandled.
  const settled = rendering
    .then(
      (result) => ({ result }),
      (error: unknown) => ({ error }),
    )
    .finally(() => {
      finished = true;
    });
  try {
    while (!finished) {
      await report.event('sample', {
        frames: metrics.frames(),
        nodeRssBytes: process.memoryUsage().rss,
        stats: metrics.stats,
      });
      await report.checkpoint();
      await Promise.race([settled, delay(config.sampleSeconds * 1000)]);
    }
    const outcome = await settled;
    if ('error' in outcome) throw outcome.error;
    return outcome.result;
  } finally {
    stop.abort();
    await settled;
  }
}

function add(
  stats: Record<string, { count: number; sum: number; max: number }>,
  name: string,
  amount: number,
) {
  const stat = (stats[name] ??= { count: 0, sum: 0, max: 0 });
  stat.count++;
  stat.sum += amount;
  stat.max = Math.max(stat.max, amount);
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    timer.unref();
  });
}

function verifyVideo(file: string, frames: number, fps: number) {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', file], {
    encoding: 'utf8',
  });
  if (probe.error) throw probe.error;
  assert.equal(probe.status, 0, probe.stderr);
  const streams = JSON.parse(probe.stdout).streams as {
    codec_type: string;
    nb_frames: string;
    duration: string;
  }[];
  const video = streams.find((stream) => stream.codec_type === 'video');
  assert.equal(Number(video?.nb_frames), frames, 'Export frame count differs from planned range');
  assert(
    Math.abs(Number(video?.duration) - frames / fps) < 1 / fps,
    'Export duration differs from planned range',
  );
  assert(
    streams.some((stream) => stream.codec_type === 'audio'),
    'Export has no master audio stream',
  );
}
