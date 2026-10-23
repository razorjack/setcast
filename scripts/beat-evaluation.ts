import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { cpus, platform, arch } from 'node:os';
import { parseEvaluation } from './beat-evaluation/config.ts';
import { EVALUATION_RATE } from './beat-evaluation/onsets.ts';
import { evaluate } from './beat-evaluation/run.ts';

const { values } = parseArgs({ options: { config: { type: 'string' }, out: { type: 'string' } } });
if (!values.config || !values.out)
  throw new Error(
    'Usage: node scripts/beat-evaluation.ts --config corpus.json --out new-directory',
  );
const config = parseEvaluation(JSON.parse(await readFile(values.config, 'utf8')));
const out = resolve(values.out);
const stop = new AbortController();
process.once('SIGINT', () => stop.abort(new Error('Interrupted by SIGINT')));
process.once('SIGTERM', () => stop.abort(new Error('Interrupted by SIGTERM')));
await mkdir(out, { recursive: false });
const report = {
  version: 1,
  status: 'running',
  startedAt: new Date().toISOString(),
  config,
  sampleRate: EVALUATION_RATE,
  runtime: {
    node: process.version,
    platform: platform(),
    arch: arch(),
    cpu: cpus()[0]?.model,
    revision: git(['rev-parse', 'HEAD']),
    dirty: Boolean(git(['status', '--porcelain'])),
    ffmpeg: spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).stdout?.split('\n')[0] ?? null,
  },
  sources: [] as { file: string; size: number; sha256: string }[],
  policy: {
    warmupSeconds: 10,
    tempoTolerance: 0.015,
    phaseToleranceBeats: 0.1,
    observationSeconds: 0.5,
  },
  results: [] as Awaited<ReturnType<typeof evaluate>>[],
  error: null as string | null,
};
try {
  await save();
  report.sources = await fingerprints();
  for (const entry of config.cases) {
    report.results.push(
      await evaluate(entry, config.methods, join(out, 'observations.jsonl'), stop.signal),
    );
    await save();
    process.stdout.write(`${entry.id}: ${JSON.stringify(report.results.at(-1)!.methods)}\n`);
  }
  report.status = 'complete';
} catch (error) {
  report.status = stop.signal.aborted ? 'cancelled' : 'failed';
  report.error = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Beat evaluation ${report.status}: ${report.error}\n`);
  process.exitCode = stop.signal.aborted ? 130 : 1;
} finally {
  await save();
}

async function save() {
  await writeFile(join(out, 'report.json.tmp'), JSON.stringify(report, null, 2) + '\n');
  await rename(join(out, 'report.json.tmp'), join(out, 'report.json'));
}
function git(args: string[]) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

async function fingerprints() {
  const files = new Set(
    config.cases.flatMap((entry) => ('file' in entry.source ? [resolve(entry.source.file)] : [])),
  );
  const sources = [];
  for (const file of files) {
    stop.signal.throwIfAborted();
    const hash = createHash('sha256');
    const before = await stat(file);
    for await (const chunk of createReadStream(file, { signal: stop.signal })) hash.update(chunk);
    const after = await stat(file);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
      throw new Error(`Audio changed while hashing: ${file}`);
    sources.push({ file, size: after.size, sha256: hash.digest('hex') });
  }
  return sources;
}
