import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { load, withWholeSet } from '../../cli/src/project.ts';
import { renderVideo } from '../src/chunks.ts';
import { currentSession, withRenderSession } from '../src/session.ts';
import { PACKAGE_ROOT } from '../src/paths.ts';
import { encodingRuntime } from '../src/encoding-runtime.ts';

const { values } = parseArgs({
  options: { project: { type: 'string', default: 'examples/demo' }, out: { type: 'string' } },
});
if (!values.out) throw new Error('Pass --out NEW_DIRECTORY to retain encoder-failure evidence.');
const out = resolve(values.out);
const loaded = await load(values.project);
const project = await withWholeSet(loaded);
await mkdir(out);
const destination = join(out, 'destination.mp4');
await writeFile(destination, 'previous export');
process.stdout.write(`Encoder failure artifacts: ${out}\n`);
process.chdir(PACKAGE_ROOT);
let failure: string | null = null;
let injected = false;
let encoderCalls = 0;
try {
  await withRenderSession(async () => {
    const resources = await currentSession().prepare(project, { projectDir: loaded.dir }, () => {});
    await renderVideo(
      {
        ...resources,
        codec: 'h264',
        audioCodec: 'aac',
        imageFormat: 'jpeg',
        jpegQuality: 95,
        crf: 18,
        x264Preset: 'medium',
        concurrency: 2,
        inputProps: project,
        outputLocation: destination,
        ffmpegOverride: ({ args, type }) => {
          if (!encodingRuntime(args, type) || ++encoderCalls !== 2) return args;
          injected = true;
          return ['-setcast-injected-encoder-failure', ...args];
        },
      },
      {
        frameRange: [0, Math.round(project.fps * 3) - 1],
        chunkSeconds: 1,
        audio: resolve(loaded.dir, project.audio),
        signal: AbortSignal.timeout(60_000),
        report: () => {},
      },
    );
  });
} catch (error) {
  failure = String(error);
}
const entries = await readdir(out);
const report = {
  injected,
  encoderCalls,
  caughtFailure: failure,
  destinationIntact: (await readFile(destination, 'utf8')) === 'previous export',
  temporaryDirectories: entries.filter((entry) => entry.startsWith('.setcast-render-')),
};
await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
assert(
  report.injected && report.caughtFailure,
  'The intended encoder failure did not reach the caller.',
);
assert(report.destinationIntact, 'Encoder failure replaced the existing output.');
assert.equal(
  report.temporaryDirectories.length,
  0,
  'Encoder failure leaked temporary directories.',
);
process.stdout.write(
  'Encoder failure: PASS (caught failure, intact destination, no temporary directories)\n',
);
