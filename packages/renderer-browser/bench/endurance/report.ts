import { appendFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { arch, platform, release, cpus } from 'node:os';
import { spawnSync } from 'node:child_process';
import type { EnduranceConfig } from './config.ts';

export async function openReport(out: string, config: EnduranceConfig) {
  await mkdir(out, { recursive: false });
  const started = performance.now();
  const report = {
    version: 1,
    status: 'running',
    config,
    runtime: runtimeIdentity(),
    startedAt: new Date().toISOString(),
    wallSeconds: 0,
    samples: 0,
    actions: {} as Record<string, number>,
    details: {} as Record<string, unknown>,
    errors: [] as string[],
  };
  const save = async () => {
    report.wallSeconds = (performance.now() - started) / 1000;
    await writeFile(join(out, 'report.json.tmp'), JSON.stringify(report, null, 2) + '\n');
    await rename(join(out, 'report.json.tmp'), join(out, 'report.json'));
  };
  await save();
  return {
    report,
    elapsed: () => (performance.now() - started) / 1000,
    async event(kind: string, details: unknown) {
      await appendFile(
        join(out, 'samples.jsonl'),
        JSON.stringify({ kind, wallSeconds: (performance.now() - started) / 1000, details }) + '\n',
      );
      if (kind === 'sample') report.samples++;
      if (kind === 'action') {
        const action = String((details as { name: string }).name);
        report.actions[action] = (report.actions[action] ?? 0) + 1;
      }
    },
    checkpoint: save,
    async finish(status: 'passed' | 'failed' | 'cancelled', error?: unknown) {
      report.status = status;
      if (error !== undefined)
        report.errors.push(
          error instanceof Error ? (error.stack ?? error.message) : JSON.stringify(error),
        );
      await save();
    },
  };
}

export type EnduranceReport = Awaited<ReturnType<typeof openReport>>;

function runtimeIdentity() {
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  const changes = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
  return {
    node: process.version,
    platform: platform(),
    release: release(),
    arch: arch(),
    cpu: cpus()[0]?.model,
    revision: revision.status === 0 ? revision.stdout.trim() : null,
    dirty: changes.status === 0 ? changes.stdout.trim() !== '' : null,
  };
}
