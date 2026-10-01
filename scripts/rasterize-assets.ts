import { spawnSync } from 'node:child_process';
import { copyFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets: [source: string, width: number, height: number][] = [
  ['packages/cli/templates/bg.svg', 2304, 1296],
  ['packages/themes/textures/grain.svg', 480, 480],
  ['packages/themes/bunker/concrete.svg', 2400, 1350],
  ['packages/themes/patina/stains.svg', 2400, 1200],
  ['packages/themes/pirate/toner.svg', 1200, 1200],
];

for (const [source, width, height] of assets) rasterize(source, width, height);
copyFileSync(
  join(root, 'packages/cli/templates/bg.png'),
  join(root, 'examples/demo/assets/bg.png'),
);

function rasterize(source: string, width: number, height: number): void {
  const output = source.replace(/\.svg$/, '.png');
  const temporary = join(root, `${output}.tmp`);
  const conversion = spawnSync(
    'rsvg-convert',
    [
      '--width',
      String(width),
      '--height',
      String(height),
      '--output',
      temporary,
      join(root, source),
    ],
    { encoding: 'utf8' },
  );
  if (conversion.error || conversion.status !== 0) {
    rmSync(temporary, { force: true });
    if (conversion.error && 'code' in conversion.error && conversion.error.code === 'ENOENT') {
      throw new Error(
        'Cannot run rsvg-convert. Install librsvg (brew install librsvg on macOS), then run vp run rasterize-assets again.',
        { cause: conversion.error },
      );
    }
    throw new Error(
      `Cannot rasterize ${source}: ${conversion.stderr || conversion.error?.message || conversion.signal}. Check the SVG and write access to ${output}, then run vp run rasterize-assets again.`,
      { cause: conversion.error },
    );
  }
  renameSync(temporary, join(root, output));
  console.log(`rasterize-assets: ${output} (${width}x${height})`);
}
