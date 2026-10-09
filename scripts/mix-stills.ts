// Visual acceptance fixtures share the generated demo audio, never inferred per-play audio.
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { normalizeMix } from '../packages/core/src/index.ts';
import { load, withSetEnvelope } from '../packages/cli/src/project.ts';
import { still } from '../packages/renderer-remotion/src/index.ts';

const loaded = await load(resolve('examples/demo'));
const project = await withSetEnvelope(loaded);
const out = join(loaded.dir, 'out/mix');
await mkdir(out, { recursive: true });
for (const [name, at] of [
  ['tease', 26],
  ['shared-drop', 33.3],
  ['overlap', 78],
] as const) {
  await still(project, { projectDir: loaded.dir, out: join(out, `${name}.jpg`), at });
  await still(
    { ...project, width: 720, height: 1280 },
    { projectDir: loaded.dir, out: join(out, `${name}-portrait.jpg`), at },
  );
}
const overflow = normalizeMix(
  {
    plays: Array.from({ length: 8 }, (_, index) => ({
      id: `layer-${index}`,
      at: 0,
      title: `Layer ${index + 1}`,
    })),
    focus: [{ at: 0, plays: ['layer-7'] }],
  },
  project.mix.duration / 1_000_000,
);
await still(
  { ...project, mix: overflow, width: 720, height: 1280 },
  { projectDir: loaded.dir, out: join(out, 'overflow-portrait.jpg'), at: 33.3 },
);
console.log(`mix-stills: wrote overlap, tease, shared drop and overflow fixtures to ${out}`);
