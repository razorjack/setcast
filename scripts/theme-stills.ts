// Renders the same moment of a project in every built-in theme, then tiles the stills into one
// contact sheet when ffmpeg is available, so themes can be compared side by side.
// Run: vp run theme-stills [dir] [--at 1:51] [--at 0:40] [--theme bristol]
// dir defaults to examples/demo; without --at each still is the first drop.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { themes } from '../packages/themes/src/index.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'packages/cli/bin/setcast.js');
const COLUMNS = 3;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    at: { type: 'string', multiple: true },
    theme: { type: 'string', multiple: true },
  },
});
const projectDir = resolve(positionals[0] ?? join(root, 'examples/demo'));
const names = values.theme ?? Object.keys(themes);
const moments: (string | undefined)[] = values.at ?? [undefined];
const outDir = join(projectDir, 'out/themes');

mkdirSync(outDir, { recursive: true });
const failed: string[] = [];
for (const at of moments) {
  const stills = names.flatMap((name) => renderStill(name, at));
  tileStills(stills, at);
}
if (failed.length > 0) {
  console.error(`theme-stills: FAIL – no still for ${failed.join(', ')}; see the errors above`);
  process.exit(1);
}

function renderStill(theme: string, at: string | undefined): string[] {
  const out = join(outDir, `${theme}${suffix(at)}.jpg`);
  const args = [cli, 'still', projectDir, '--theme', theme, '--out', out];
  if (at) args.push('--at', at);

  const still = spawnSync(process.execPath, args, { stdio: ['ignore', 'ignore', 'inherit'] });
  if (still.status !== 0) {
    failed.push(`${theme}${at ? ` at ${at}` : ''}`);
    return [];
  }
  console.log(`theme-stills: ${theme} → ${shown(out)}`);
  return [out];
}

/** Every still in one image, left to right in the order they were rendered. */
function tileStills(stills: string[], at: string | undefined): void {
  if (stills.length < 2) return;
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    console.log('theme-stills: ffmpeg not found, skipping the contact sheet');
    return;
  }

  const sheet = join(outDir, `contact${suffix(at)}.jpg`);
  const rows = Math.ceil(stills.length / COLUMNS);
  const inputs = stills.flatMap((still) => ['-i', still]);
  const streams = stills.map((_, index) => `[${index}:v]`).join('');
  const filter = `${streams}concat=n=${stills.length}:v=1:a=0,scale=640:360,tile=${COLUMNS}x${rows}`;
  const args = ['-loglevel', 'error', '-y', ...inputs, '-filter_complex', filter];

  spawnSync('ffmpeg', [...args, '-frames:v', '1', '-q:v', '3', sheet], { stdio: 'inherit' });
  console.log(`theme-stills: contact sheet → ${shown(sheet)} (${stills.length} themes, in order)`);
}

function suffix(at: string | undefined): string {
  return at ? `-${at.replaceAll(':', '-')}` : '';
}

function shown(file: string): string {
  return relative(process.cwd(), file);
}
