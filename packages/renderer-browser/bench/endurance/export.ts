import { join, resolve } from 'node:path';
import {
  loadProject,
  probeAudio,
  readsWholeSet,
  readWholeSet,
  type LoadedProject,
} from '@setcast/core/node';
import { themes } from '../../../themes/src/index.ts';
import { render, type BrowserMetric } from '../../src/export/index.ts';
import type { EnduranceConfig } from './config.ts';
import type { EnduranceReport } from './report.ts';
import { verifyExport } from './verify.ts';
import { exportSettings, toSeconds, type RenderRuntime } from '@setcast/core';
import { sampleProcessMemory } from './process-memory.ts';
import { sampleOutputStorage } from './output-storage.ts';

export async function runExport(
  config: EnduranceConfig,
  out: string,
  report: EnduranceReport,
  control: { signal: AbortSignal; existingVideo?: string },
) {
  const { signal, existingVideo } = control;
  const loaded = await loadProject(resolve(config.project), {
    themes,
    probeDuration: (audio, root) => probeAudio({ audio }, root),
  });
  const end = config.at + config.seconds;
  if (end > toSeconds(loaded.project.mix.duration))
    throw new Error(
      `Endurance range ${config.at}–${end}s exceeds ${config.project}. Use a longer master or reduce seconds; endurance runs do not clamp ranges.`,
    );
  if (existingVideo) {
    report.report.details.existingVideo = existingVideo;
    await verifyExport(
      existingVideo,
      { project: loaded.project, dir: loaded.dir },
      { config, report },
      signal,
    );
    return;
  }
  await exportProject(loaded, config, report, { out, signal });
}

async function exportProject(
  loaded: LoadedProject,
  config: EnduranceConfig,
  report: EnduranceReport,
  control: { out: string; signal: AbortSignal },
) {
  const { out, signal } = control;
  const project = readsWholeSet(loaded.project)
    ? await readWholeSet(loaded.project, loaded.dir)
    : loaded.project;
  const metrics = exportMetrics();
  const file = join(out, 'export.mp4');
  const stop = new AbortController();
  const runtime: RenderRuntime[] = [];
  const settings = { ...exportSettings(loaded.config.output), concurrency: config.concurrency };
  report.report.details = { ...report.report.details, settings, runtime };
  const started = performance.now();
  const rendering = render(project, {
    ...settings,
    projectDir: loaded.dir,
    out: file,
    range: [config.at, config.at + config.seconds],
    onMetrics: metrics.measured,
    onRuntime: (event) => runtime.push(event),
    signal: AbortSignal.any([signal, stop.signal]),
  });
  const result = await sampleExport(rendering, { report, metrics, config, stop, out });
  report.report.details = {
    ...report.report.details,
    result,
    stats: metrics.stats,
    width: project.width,
    height: project.height,
    fps: project.fps,
    frames: metrics.frames(),
    renderWallSeconds: (performance.now() - started) / 1000,
    finalStorage: await sampleOutputStorage(out),
  };
  await verifyExport(file, { project, dir: loaded.dir }, { config, report }, signal);
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

interface ExportSamplingOptions {
  report: EnduranceReport;
  metrics: ReturnType<typeof exportMetrics>;
  config: EnduranceConfig;
  stop: AbortController;
  out: string;
}

async function sampleExport<T>(rendering: Promise<T>, options: ExportSamplingOptions) {
  const { config, stop } = options;
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
      await sampleExportResources(options);
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

async function sampleExportResources({ out, report, metrics }: ExportSamplingOptions) {
  const storage = await sampleOutputStorage(out);
  await report.event('sample', {
    frames: metrics.frames(),
    nodeRssBytes: process.memoryUsage().rss,
    processes: sampleProcessMemory(),
    storage,
    stats: metrics.stats,
  });
  await report.checkpoint();
  if (storage.freeBytes < 2 * 1024 ** 3)
    throw new Error(
      'Endurance export stopped because filesystem free space fell below 2 GiB. Free space before retrying.',
    );
}
