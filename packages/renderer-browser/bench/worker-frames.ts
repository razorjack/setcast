import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { themes } from '../../themes/src/index.ts';
import { createFixture, fixtureProject } from '../../../scripts/export-acceptance/fixture.ts';
import { render, withRenderSession } from '../src/export/index.ts';

const { values } = parseArgs({ options: { out: { type: 'string' } } });
if (!values.out) throw new Error('Pass --out NEW_DIRECTORY for worker pixel comparisons.');
const root = resolve(values.out);
await mkdir(root);
await createFixture(root);
const reports: {
  theme: string;
  width: number;
  height: number;
  hashes: string[];
  equal: boolean;
}[] = [];

await withRenderSession(async () => {
  for (const theme of Object.keys(themes)) {
    const project = await fixtureProject(root, theme);
    for (const [width, height] of [
      [1920, 1080],
      [1080, 1920],
    ] as const) {
      const hashes: string[] = [];
      for (const concurrency of [1, 4]) {
        const out = join(root, `${theme}-${width}-${concurrency}.mp4`);
        const result = await render(
          { ...project, width, height },
          {
            projectDir: root,
            out,
            range: [1, 2.5],
            concurrency,
          },
        );
        assert.equal(result.frames, 45);
        hashes.push(
          execFileSync(
            'ffmpeg',
            [
              '-v',
              'error',
              '-xerror',
              '-i',
              out,
              '-map',
              '0:v',
              '-f',
              'hash',
              '-hash',
              'sha256',
              '-',
            ],
            { encoding: 'utf8' },
          ).trim(),
        );
      }
      const equal = hashes[0] === hashes[1];
      reports.push({ theme, width, height, hashes, equal });
      await writeFile(join(root, 'report.json'), JSON.stringify(reports, null, 2));
      process.stdout.write(`${theme} ${width}x${height}: ${equal ? 'identical' : 'DIFFERENT'}\n`);
    }
  }
});
assert(
  reports.every((report) => report.equal),
  'Worker count changed decoded theme pixels; inspect retained outputs.',
);
process.stdout.write(
  'Worker frames: PASS (16 themes, both orientations, all 45 frames per comparison)\n',
);
