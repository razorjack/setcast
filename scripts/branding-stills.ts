// Renders branding over examples/demo for each built-in theme: the identity block in several
// positions and sizes, a rotating message, an announcement and a large centered logo, in landscape
// and portrait, then tiles each theme's landscape stills.
// Run: vp run branding-stills [--theme bristol]   (writes examples/demo/out/branding/<theme>/)
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  BrandingSchema,
  type BrandingInput,
  type ResolvedProject,
} from '../packages/core/src/index.ts';
import { load, withWholeSet } from '../packages/cli/src/project.ts';
import { still, withRenderSession } from '../packages/renderer-remotion/src/index.ts';
import { themes } from '../packages/themes/src/index.ts';

const IDENTITY: BrandingInput = {
  logo: 'assets/logo.svg',
  name: 'Null Vector',
  event: 'Neurofunk Sessions · Warsaw',
  episode: 'Episode 42',
  messages: { lines: ['instagram.com/nullvector', 'Tracklist in the description'], gap: 2 },
};

type Shot = {
  name: string;
  branding: BrandingInput;
  at?: number;
  portrait?: boolean;
  announcement?: boolean;
};
const SHOTS: Shot[] = [
  { name: 'top-right', branding: IDENTITY },
  { name: 'top-left', branding: { ...IDENTITY, position: 'top-left' } },
  {
    name: 'backdrop',
    branding: { ...IDENTITY, position: 'bottom', size: 1.6, messages: undefined },
  },
  { name: 'projection', branding: { logo: 'assets/logo.svg', position: 'center', size: 3 } },
  {
    name: 'announcement',
    branding: { ...IDENTITY, messages: { ...IDENTITY.messages, position: 'bottom' } },
    announcement: true,
  },
  { name: 'portrait', branding: IDENTITY, portrait: true },
  {
    name: 'portrait-backdrop',
    branding: { ...IDENTITY, position: 'top', size: 1.4 },
    portrait: true,
  },
];

const { values } = parseArgs({ options: { theme: { type: 'string', multiple: true } } });
const names = values.theme ?? Object.keys(themes);
const projectDir = resolve('examples/demo');

await withRenderSession(async () => {
  for (const theme of names) {
    const outDir = join(projectDir, 'out/branding', theme);
    await mkdir(outDir, { recursive: true });
    const project = await withWholeSet(await load(projectDir, theme));
    const files: string[] = [];
    for (const shot of SHOTS) files.push(await grab(project, shot, outDir));
    tile(
      files.filter((file) => !file.includes('portrait')),
      'scale=960:540',
      join(outDir, 'sheet.jpg'),
    );
    console.log(`branding-stills: ${theme} → ${relative(process.cwd(), outDir)}`);
  }
});

async function grab(project: ResolvedProject, shot: Shot, outDir: string): Promise<string> {
  const at = shot.at ?? 64;
  const staged: ResolvedProject = {
    ...project,
    ...(shot.portrait ? { width: 1080, height: 1920 } : {}),
    branding: BrandingSchema.parse(shot.branding),
    announcements: shot.announcement ? [{ at: at - 2, text: 'Last track!', seconds: 10 }] : [],
  };
  const out = join(outDir, `${shot.name}.jpg`);
  await still(staged, { projectDir, out, at });
  return out;
}

function tile(files: string[], scale: string, out: string): void {
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) return;
  const inputs = files.flatMap((file) => ['-i', file]);
  const streams = files.map((_, index) => `[${index}:v]`).join('');
  const filter = `${streams}concat=n=${files.length}:v=1:a=0,${scale},tile=2x${Math.ceil(files.length / 2)}`;
  const args = ['-loglevel', 'error', '-y', ...inputs, '-filter_complex', filter, '-frames:v', '1'];
  spawnSync('ffmpeg', [...args, out], { stdio: 'inherit' });
}
