import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ResolvedProject } from '@setcast/core';
import { pipeline } from '../src/export/pipeline.ts';
import { prepareFrame, withCapturePages } from '../src/export/session.ts';

export function pixelDifference(reference: Uint8Array, actual: Uint8Array) {
  assert.equal(actual.length, reference.length);
  assert.equal(reference.length % 3, 0);
  let maximum = 0;
  let squares = 0;
  let changedPixels = 0;
  for (let pixel = 0; pixel < reference.length; pixel += 3) {
    let changed = false;
    for (let channel = 0; channel < 3; channel++) {
      const difference = Math.abs(reference[pixel + channel]! - actual[pixel + channel]!);
      maximum = Math.max(maximum, difference);
      squares += difference ** 2;
      changed ||= difference !== 0;
    }
    if (changed) changedPixels++;
  }
  const pixels = reference.length / 3;
  return {
    maximum,
    rms: Math.sqrt(squares / reference.length),
    changedPixels,
    pixels,
    qualified: maximum <= 1 && changedPixels <= Math.ceil(pixels * 0.00001),
  };
}

/** Check source rounding separately from lossy inter-frame prediction. Retain every PNG. */
export async function qualifySourcePixels(
  project: ResolvedProject,
  projectDir: string,
  root: string,
  workers: readonly number[],
) {
  const range = [30, 74] as const;
  const groups: [string, number][] = [
    ['one-a', 1],
    ['one-b', 1],
    ...workers.slice(1).map((count): [string, number] => [`${count}-workers`, count]),
  ];
  for (const [name, count] of groups) {
    const directory = join(root, name);
    await mkdir(directory, { recursive: true });
    await withCapturePages(project, { projectDir }, count, (pages) =>
      pipeline({
        range: [...range],
        workers: count,
        capture: async (worker, frame) => {
          const page = pages[worker]!;
          await prepareFrame(page, frame);
          return page.screenshot({ type: 'png' });
        },
        write: (bytes, frame) => writeFile(join(directory, `${frame}.png`), bytes),
        cancel: () => Promise.allSettled(pages.map((page) => page.close())),
      }),
    );
  }
  const reports = [];
  for (const [name] of groups.slice(1)) {
    for (let frame = range[0]; frame <= range[1]; frame++) {
      const reference = join(root, 'one-a', `${frame}.png`);
      const actual = join(root, name, `${frame}.png`);
      const identical = (await readFile(reference)).equals(await readFile(actual));
      const difference = identical
        ? {
            maximum: 0,
            rms: 0,
            changedPixels: 0,
            pixels: project.width * project.height,
            qualified: true,
          }
        : pixelDifference(decode(reference), decode(actual));
      reports.push({ name, frame, ...difference });
    }
  }
  await writeFile(join(root, 'report.json'), JSON.stringify(reports, null, 2));
  return { qualified: reports.every((report) => report.qualified), reports };
}

function decode(file: string) {
  return execFileSync(
    'ffmpeg',
    ['-v', 'error', '-xerror', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    { maxBuffer: 32 * 1024 ** 2 },
  );
}
