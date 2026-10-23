import { readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { readEnduranceConfig } from './endurance/config.ts';
import { openReport } from './endurance/report.ts';
import { runLive } from './endurance/live.ts';
import { runExport } from './endurance/export.ts';

const { values } = parseArgs({
  options: {
    config: { type: 'string' },
    out: { type: 'string' },
    help: { type: 'boolean' },
  },
});
if (values.help) {
  process.stdout.write(
    'Usage: node packages/renderer-browser/bench/endurance.ts --config workload.json --out NEW_DIRECTORY\nSee docs/endurance.md for live/export workloads and report fields.\n',
  );
} else {
  if (!values.config || !values.out)
    throw new Error('Supply --config workload.json and --out NEW_DIRECTORY. Use --help for usage.');
  const config = readEnduranceConfig(JSON.parse(await readFile(values.config, 'utf8')));
  const out = resolve(values.out);
  await mkdir(dirname(out), { recursive: true });
  const report = await openReport(out, config);
  const stop = new AbortController();
  const interrupt = () => stop.abort(new Error('Endurance run interrupted by signal.'));
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    if (config.mode === 'live') await runLive(config, out, report, stop.signal);
    else await runExport(config, out, report, stop.signal);
    stop.signal.throwIfAborted();
    await report.finish('passed');
    process.stdout.write(`Endurance: PASS (${out})\n`);
  } catch (error) {
    await report.finish(stop.signal.aborted ? 'cancelled' : 'failed', error);
    process.exitCode = 1;
    process.stderr.write(`${String(error)}\nReport: ${out}/report.json\n`);
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}
