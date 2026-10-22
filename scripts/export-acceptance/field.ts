import assert from 'node:assert/strict';
import { join } from 'node:path';
import { resolveVisualizerConfigs } from '../../packages/core/src/index.ts';
import { decode, pixels } from './measure.ts';
import type { AcceptanceContext } from './readiness.ts';

export async function checkField({ exporter, project, projectDir, out }: AcceptanceContext) {
  const field = {
    ...project,
    background: null,
    css: `${project.css}\n.setcast::after { display: none; }\n.setcast > .sc-field { display: block; color: #68dcc9; }`,
    visualizers: resolveVisualizerConfigs({ name: 'field', seed: 42 }),
  };
  const first = join(out, 'field.png');
  const early = join(out, 'field-early.png');
  const repeat = join(out, 'field-repeat.png');
  await exporter.still(field, { projectDir, out: first, at: 1.7 });
  await exporter.still(field, { projectDir, out: early, at: 0.4 });
  await exporter.still(field, { projectDir, out: repeat, at: 1.7 });
  assert(pixels(first).equals(pixels(repeat)), 'Field pixels depend on job order');
  assert(!pixels(first).equals(pixels(early)), 'Field did not move between timestamps');

  const single = join(out, 'field-serial.mp4');
  const chunked = join(out, 'field-parallel.mp4');
  const options = { projectDir, range: [0.4, 1.9] as [number, number], chunkSeconds: 1 };
  await exporter.render(field, { ...options, out: single, concurrency: 1 });
  await exporter.render(field, { ...options, out: chunked, concurrency: 2 });
  const hashes = (file: string) => decode(file, ['-an', '-f', 'framemd5']);
  assert(
    hashes(single).equals(hashes(chunked)),
    'Field frames changed across capture workers/chunks',
  );
  process.stdout.write(
    '  field: repeatable stills and identical decoded frames across workers/chunks\n',
  );
}
