// Renders the tracklist of each built-in theme over examples/demo with a ten-listing mix, in
// playlist and DJ mode, landscape and portrait, and mid-glide, then tiles each theme's stills.
// Run: vp run tracklist-stills [--theme bristol]   (writes examples/demo/out/tracklist/<theme>/)
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  normalizeMix,
  type MixAuthoring,
  type ResolvedProject,
} from '../packages/core/src/index.ts';
import { load, withSetEnvelope } from '../packages/cli/src/project.ts';
import { still, withRenderSession } from '../packages/renderer-remotion/src/index.ts';
import { themes } from '../packages/themes/src/index.ts';

const LISTING_SECONDS = 15;
const CREDITS: [string | undefined, string][] = [
  ['Null Vector', 'Sterile Room'],
  ['Oxide Array', 'Rust Protocol'],
  ['Halogen', 'Subterranean Frequencies (Phase Memory Remix)'],
  ['Łukasz Żółw', 'Źródło Ciszy'],
  [undefined, 'ID'],
  ['Cold Fusion Unit', 'Ballast'],
  ['Vex & Morrow', 'Night Shift Dub'],
  ['Tessellate', 'Ferrous'],
  ['ID', 'ID'],
  ['Saltmarsh', 'Weeping Steel'],
];

type Mode = 'playlist' | 'dj';
type Shot = { name: string; mode: Mode; at: number; portrait?: boolean };
const SHOTS: Shot[] = [
  { name: 'playlist', mode: 'playlist', at: 64 },
  { name: 'glide', mode: 'playlist', at: 60.4 },
  { name: 'alone', mode: 'playlist', at: 72 },
  { name: 'dj', mode: 'dj', at: 64 },
  { name: 'portrait', mode: 'playlist', at: 64, portrait: true },
  { name: 'portrait-dj', mode: 'dj', at: 64, portrait: true },
];

const { values } = parseArgs({ options: { theme: { type: 'string', multiple: true } } });
const names = values.theme ?? Object.keys(themes);
const projectDir = resolve('examples/demo');

await withRenderSession(async () => {
  for (const theme of names) {
    const outDir = join(projectDir, 'out/tracklist', theme);
    await mkdir(outDir, { recursive: true });
    const loaded = await load(projectDir, theme);
    const project = await withSetEnvelope(loaded);
    const files: string[] = [];
    for (const shot of SHOTS) files.push(await grab(project, shot, outDir));
    tile(
      files.filter((file) => !file.includes('portrait')),
      'scale=960:540',
      join(outDir, 'sheet.jpg'),
    );
    console.log(`tracklist-stills: ${theme} → ${relative(process.cwd(), outDir)}`);
  }
});

async function grab(project: ResolvedProject, shot: Shot, outDir: string): Promise<string> {
  const durationSeconds = project.mix.duration / 1_000_000;
  const size = shot.portrait ? { width: 1080, height: 1920 } : {};
  const staged: ResolvedProject = {
    ...project,
    ...size,
    mix: normalizeMix(fixtureMix(shot.mode), durationSeconds),
    presentation: shot.mode,
    panel: { dwell: 6, fade: 1 },
    tracklist: { before: 2, after: 2 },
  };
  const out = join(outDir, `${shot.name}.jpg`);
  await still(staged, { projectDir, out, at: shot.at });
  return out;
}

/** Ten listings; in DJ mode each play also overlaps the next for eight seconds, on decks A and B. */
function fixtureMix(mode: Mode): MixAuthoring {
  const plays = CREDITS.map(([artist, title], index) => {
    const at = index * LISTING_SECONDS;
    const credit = { id: `t${index + 1}`, at, artist, title };
    if (mode === 'playlist') return credit;
    const isLast = index === CREDITS.length - 1;
    const until = isLast ? ('end' as const) : at + LISTING_SECONDS + 8;
    return { ...credit, contributions: [{ from: at, until, deck: index % 2 ? 'B' : 'A' }] };
  });
  return { plays };
}

function tile(files: string[], scale: string, out: string): void {
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) return;
  const inputs = files.flatMap((file) => ['-i', file]);
  const streams = files.map((_, index) => `[${index}:v]`).join('');
  const filter = `${streams}concat=n=${files.length}:v=1:a=0,${scale},tile=2x${Math.ceil(files.length / 2)}`;
  const args = ['-loglevel', 'error', '-y', ...inputs, '-filter_complex', filter, '-frames:v', '1'];
  spawnSync('ffmpeg', [...args, out], { stdio: 'inherit' });
}
