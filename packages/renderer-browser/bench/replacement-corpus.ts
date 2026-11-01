import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { loadProject, probeAudio } from '@setcast/core/node';
import { themes } from '../../themes/src/index.ts';
import { projectContent } from '../../../scripts/render-compare/content.ts';

const cases = [
  { name: 'standard', theme: 'sterile-tech', at: 90, seconds: 10 },
  { name: 'css-filters', theme: 'afterhours', at: 90, seconds: 10 },
  { name: 'field', theme: 'sterile-tech', visualizer: 'field', at: 90, seconds: 10 },
  { name: 'tunnel', theme: 'sterile-tech', visualizer: 'tunnel', at: 90, seconds: 10 },
  {
    name: 'constellation',
    theme: 'sterile-tech',
    visualizer: 'constellation',
    at: 90,
    seconds: 10,
  },
  { name: 'looping-video', theme: 'sterile-tech', video: true, at: 90, seconds: 10 },
  { name: 'dj-art-branding', theme: 'sterile-tech', branding: true, at: 102, seconds: 10 },
  { name: 'portrait', theme: 'afterhours', branding: true, portrait: true, at: 102, seconds: 10 },
  { name: '60fps', theme: 'sterile-tech', fps: 60, at: 90, seconds: 6 },
  { name: '4k', theme: 'sterile-tech', width: 3840, height: 2160, at: 90, seconds: 3 },
  { name: 'chunk-boundary', theme: 'sterile-tech', branding: true, at: 88, seconds: 63 },
];
type CorpusCase = (typeof cases)[number];
const execute = promisify(execFile);
const { values } = parseArgs({ options: { out: { type: 'string' } } });
if (!values.out) throw new Error('Pass --out NEW_DIRECTORY; generate demo assets first.');
const out = resolve(values.out);
const demoAssets = resolve('examples/demo/assets');
const control = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => control.abort(new Error(`Stopped by ${signal}`)));

await mkdir(out);
await generateMotion();
const manifest = [];
for (const fixture of cases) manifest.push(await writeProject(fixture));
await writeFile(
  join(out, 'manifest.json'),
  JSON.stringify(
    {
      version: 1,
      scope:
        'Frozen portable corpus. Three alternating timed pairs per case, after quality qualification. Long real-master qualification is separate and remains required.',
      revision: (await execute('git', ['rev-parse', 'HEAD'])).stdout.trim(),
      ffmpeg: (await execute('ffmpeg', ['-version'])).stdout.split('\n')[0],
      cases: manifest,
    },
    null,
    2,
  ) + '\n',
);
process.stdout.write(`Replacement corpus: ${join(out, 'manifest.json')}\n`);

async function generateMotion() {
  await execute(
    'ffmpeg',
    [
      '-v',
      'error',
      '-loop',
      '1',
      '-framerate',
      '30',
      '-i',
      join(demoAssets, 'bg.png'),
      '-vf',
      "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='1.05+0.025*sin(on/12)':d=1:s=1920x1080:fps=30",
      '-t',
      '3',
      '-an',
      '-c:v',
      'libx264',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      join(out, 'motion.mp4'),
    ],
    { signal: control.signal },
  );
}

async function writeProject(fixture: CorpusCase) {
  const directory = join(out, fixture.name);
  const assets = join(directory, 'assets');
  await mkdir(assets, { recursive: true });
  for (const name of ['demo-set.wav', 'bg.png'])
    await copyFile(join(demoAssets, name), join(assets, name), constants.COPYFILE_FICLONE);
  if (fixture.video) await copyFile(join(out, 'motion.mp4'), join(assets, 'motion.mp4'));
  await writeFile(
    join(assets, 'alternate.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#19303a"/><circle cx="1200" cy="450" r="350" fill="#9b6045"/><path d="M0 800L1920 200V260L0 860Z" fill="#ebcca1"/></svg>',
  );
  await writeFile(
    join(assets, 'logo.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="white"/><circle cx="50" cy="50" r="15" fill="#19303a"/></svg>',
  );
  const config = configuration(fixture);
  await writeFile(join(directory, 'setcast.yaml'), JSON.stringify(config, null, 2) + '\n');
  const { project } = await loadProject(directory, {
    themes,
    probeDuration: (audio, root) => probeAudio({ audio }, root),
  });
  const content = await projectContent(project, directory, control.signal);
  return { ...fixture, directory, config, ...content };
}

function configuration(fixture: CorpusCase) {
  const config: Record<string, unknown> = {
    title: 'Renderer replacement corpus v1',
    audio: 'assets/demo-set.wav',
    background: fixture.video ? 'assets/motion.mp4' : 'assets/bg.png',
    theme: fixture.theme,
    bpm: 174,
    output: {
      width: fixture.portrait ? 1080 : (fixture.width ?? 1920),
      height: fixture.portrait ? 1920 : (fixture.height ?? 1080),
      fps: fixture.fps ?? 30,
      crf: 18,
      jpegQuality: 95,
      x264Preset: 'medium',
      chunkSeconds: 60,
    },
    plays: creditedPlays(Boolean(fixture.branding)),
    annotations: [
      { kind: 'breakdown', at: 77.2 },
      { kind: 'drop', at: 110.3, participants: ['second', 'closer'] },
    ],
  };
  if (fixture.visualizer) config.visualizer = { name: fixture.visualizer };
  if (fixture.branding) {
    config.tracklist = true;
    config.branding = {
      logo: 'assets/logo.svg',
      name: 'Null Vector',
      event: 'Renderer qualification',
      episode: '01',
      messages: { lines: ['Tracklist in the description', 'Recorded fixture'], seconds: 3, gap: 1 },
    };
    config.announcements = [{ at: 104, text: 'Guest contribution', seconds: 4 }];
  }
  return config;
}

function creditedPlays(changingArt: boolean) {
  const closer: Record<string, unknown> = {
    id: 'closer',
    at: 105,
    artist: 'Phase Memory',
    title: 'Broken Signal',
  };
  if (changingArt) closer.background = 'assets/alternate.svg';
  return [
    { id: 'first', at: 0, until: 105, artist: 'Null Vector', title: 'Sterile Room' },
    { id: 'second', at: 60, until: 114, artist: 'Oxide Array', title: 'Rust Protocol' },
    closer,
  ];
}
