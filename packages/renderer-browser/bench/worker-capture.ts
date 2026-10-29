import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createFixture, fixtureProject } from '../../../scripts/export-acceptance/fixture.ts';
import { prepareFrame, withCapturePages, withRenderSession } from '../src/export/session.ts';
import { pipeline } from '../src/export/pipeline.ts';

const { values } = parseArgs({
  options: {
    out: { type: 'string' },
    theme: { type: 'string', default: 'passe-partout' },
    portrait: { type: 'boolean' },
    png: { type: 'boolean' },
    repaint: { type: 'boolean' },
  },
});
if (!values.out) throw new Error('Pass --out NEW_DIRECTORY for captured-frame investigation.');
const root = resolve(values.out);
await mkdir(root);
await createFixture(root);
const loaded = await fixtureProject(root, values.theme);
const project = {
  ...loaded,
  width: values.portrait ? 1080 : 1920,
  height: values.portrait ? 1920 : 1080,
};
const reports: Record<string, string[]> = {};
await withRenderSession(async () => {
  for (const [name, workers] of [
    ['one-a', 1],
    ['one-b', 1],
    ['four', 4],
  ] as const) {
    const hashes: string[] = [];
    const directory = join(root, name);
    await mkdir(directory);
    await withCapturePages(project, { projectDir: root }, workers, (pages) =>
      pipeline({
        range: [30, 74],
        workers,
        capture: async (worker, frame) => {
          const page = pages[worker]!;
          await prepareFrame(page, frame);
          if (values.repaint)
            await page.evaluate(() => {
              const display = document.body.style.display;
              document.body.style.display = 'none';
              void document.body.offsetHeight;
              document.body.style.display = display;
              void document.body.offsetHeight;
            });
          return page.screenshot(values.png ? { type: 'png' } : { type: 'jpeg', quality: 95 });
        },
        write: async (image, frame) => {
          hashes.push(createHash('sha256').update(image).digest('hex'));
          await writeFile(join(directory, `${frame}.${values.png ? 'png' : 'jpg'}`), image);
        },
        cancel: () => Promise.allSettled(pages.map((page) => page.close())),
      }),
    );
    reports[name] = hashes;
    await writeFile(join(root, 'report.json'), JSON.stringify(reports, null, 2));
  }
});
for (const name of ['one-b', 'four']) {
  const changed = reports[name]!.flatMap((hash, index) =>
    hash === reports['one-a']![index] ? [] : [index + 30],
  );
  process.stdout.write(`${name}: changed absolute frames ${JSON.stringify(changed)}\n`);
}
