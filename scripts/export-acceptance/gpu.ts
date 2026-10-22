import assert from 'node:assert/strict';
import { join } from 'node:path';
import { resolveVisualizerConfigs } from '../../packages/core/src/index.ts';
import { decode, pixels } from './measure.ts';
import type { AcceptanceContext } from './readiness.ts';

const GPU_VISUALIZERS = ['field', 'tunnel', 'constellation'];

export async function checkGpuVisualizers(context: AcceptanceContext) {
  for (const name of GPU_VISUALIZERS) await checkGpuVisualizer(context, name);
}

async function checkGpuVisualizer(
  { exporter, project, projectDir, out }: AcceptanceContext,
  name: string,
) {
  const scene = {
    ...project,
    background: null,
    css: `${project.css}\n.setcast::after { display: none; }\n.setcast > .sc-${name} { display: block; color: #68dcc9; }`,
    visualizers: resolveVisualizerConfigs({ name, seed: 42 }),
  };
  const first = join(out, `${name}.png`);
  const early = join(out, `${name}-early.png`);
  const repeat = join(out, `${name}-repeat.png`);
  await exporter.still(scene, { projectDir, out: first, at: 1.7 });
  await exporter.still(scene, { projectDir, out: early, at: 0.4 });
  await exporter.still(scene, { projectDir, out: repeat, at: 1.7 });
  assert(pixels(first).equals(pixels(repeat)), `${name} pixels depend on job order`);
  assert(!pixels(first).equals(pixels(early)), `${name} did not move between timestamps`);

  const single = join(out, `${name}-serial.mp4`);
  const chunked = join(out, `${name}-parallel.mp4`);
  const options = { projectDir, range: [0.4, 1.9] as [number, number], chunkSeconds: 1 };
  await exporter.render(scene, { ...options, out: single, concurrency: 1 });
  await exporter.render(scene, { ...options, out: chunked, concurrency: 2 });
  const hashes = (file: string) => decode(file, ['-an', '-f', 'framemd5']);
  assert(
    hashes(single).equals(hashes(chunked)),
    `${name} frames changed across capture workers/chunks`,
  );
  process.stdout.write(
    `  ${name}: repeatable stills and identical decoded frames across workers/chunks\n`,
  );
}
