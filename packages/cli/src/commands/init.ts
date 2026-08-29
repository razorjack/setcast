import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { formatTime, SetcastError } from '@setcast/core';
import { CONFIG_FILE } from '@setcast/core/node';
import { themes } from '@setcast/themes';
import { stringify } from 'yaml';
import { synthesizeDemo } from '../demo/synth.ts';
import {
  bold,
  cancel,
  clearSpinnerOnError,
  dim,
  intro,
  log,
  outro,
  prompts,
  steel,
} from '../ui.ts';

const TEMPLATES = fileURLToPath(new URL('../../templates/', import.meta.url));

interface InitOptions {
  dir: string;
  demo: boolean;
  yes: boolean;
}

interface InitAnswers {
  title: string;
  audio: string;
  fps: number;
  theme: string;
}

interface ProjectContent {
  audio: string;
  bpm: number | undefined;
  tracks: Record<string, string | number>[];
  events: Record<string, string | number>[];
}

export const help = `setcast init [dir] [--demo] [--yes]

Scaffolds a project: setcast.yaml, a background, and (with --demo) a generated demo track so
\`setcast render\` works immediately. Interactive unless --yes.`;

export async function run(argv: string[]): Promise<void> {
  const options = parseOptions(argv);

  intro('init');
  await ensureAvailable(options.dir);
  const answers = options.yes
    ? defaultAnswers(options.dir, options.demo)
    : await ask(options.dir, options.demo);

  await writeBackground(options.dir);
  const project = await prepareProject(options.dir, answers.audio);
  await writeProjectConfig(options.dir, answers, project);

  showNextSteps(options.dir, project.audio);
}

function parseOptions(argv: string[]): InitOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { demo: { type: 'boolean' }, yes: { type: 'boolean' } },
  });
  return {
    dir: resolve(positionals[0] ?? '.'),
    demo: values.demo ?? false,
    yes: values.yes ?? false,
  };
}

async function ensureAvailable(dir: string): Promise<void> {
  if (await exists(join(dir, CONFIG_FILE))) {
    throw new SetcastError(
      `${CONFIG_FILE} already exists in ${dir}`,
      'Pick another directory or remove it first.',
    );
  }
}

function defaultAnswers(dir: string, demo: boolean): InitAnswers {
  return { title: titleFrom(dir), audio: demo ? 'demo' : '', fps: 30, theme: 'sterile-tech' };
}

async function writeBackground(dir: string): Promise<void> {
  await mkdir(join(dir, 'assets'), { recursive: true });
  await writeFile(join(dir, 'assets/bg.svg'), await readFile(join(TEMPLATES, 'bg.svg')));
}

async function prepareProject(dir: string, audio: string): Promise<ProjectContent> {
  if (audio !== 'demo') {
    return {
      audio,
      bpm: undefined,
      tracks: [{ time: '0:00', artist: 'ID', title: 'ID' }],
      events: [],
    };
  }

  const spin = prompts.spinner();
  spin.start('Synthesizing a demo track (174 BPM)');
  const demo = await clearSpinnerOnError(spin, async () => {
    const generated = synthesizeDemo(0.25);
    await writeFile(join(dir, 'assets/demo-set.wav'), generated.wav);
    return generated;
  });
  spin.stop(`Demo track written (${Math.round(demo.durationSeconds)} s)`);

  const sectionTime = (index: number) => formatTime(demo.sections[index]!.startSeconds);
  return {
    audio: 'assets/demo-set.wav',
    bpm: 174,
    tracks: [
      { time: '0:00', artist: 'Null Vector', title: 'Sterile Room', label: 'Setcast Recordings' },
      {
        time: sectionTime(3),
        artist: 'Oxide Array',
        title: 'Rust Protocol',
        label: 'Setcast Recordings',
      },
      { time: sectionTime(5), artist: 'ID', title: 'ID' },
    ],
    events: [
      { type: 'buildup', time: sectionTime(1) },
      { type: 'drop', time: sectionTime(2) },
      { type: 'breakdown', time: sectionTime(3) },
      { type: 'buildup', time: sectionTime(4) },
      { type: 'drop', time: sectionTime(5) },
    ],
  };
}

async function writeProjectConfig(
  dir: string,
  answers: InitAnswers,
  project: ProjectContent,
): Promise<void> {
  const config: Record<string, unknown> = {
    title: answers.title,
    audio: project.audio || 'CHANGE-ME.wav',
    background: 'assets/bg.svg',
    theme: answers.theme,
    renderer: 'remotion',
    output: { width: 1920, height: 1080, fps: answers.fps, file: 'out/set.mp4' },
  };
  if (project.bpm) config.bpm = project.bpm;
  config.tracks = project.tracks;
  config.events = project.events;
  config.modulation = [];
  config.visualizer = { name: 'spectrum', bars: 48 };
  const yaml = [
    `# Setcast project. Paths are relative to this directory. Docs: https://github.com/razorjack/setcast`,
    stringify(config),
    `# events: drop, double_drop, breakdown, buildup, rewind, switch (deck: B), chapter (title: …)`,
    `# modulation routes: { source: bass|mids|highs|rms|onset, target: bg-zoom, range: [1, 1.06], curve: pow2, smooth: 0.1, when: drop }`,
    `# import a tracklist:  setcast import tracklist.txt --write`,
    '',
  ].join('\n');
  await writeFile(join(dir, CONFIG_FILE), yaml);
}

function showNextSteps(dir: string, audio: string): void {
  const rel = relative(process.cwd(), dir) || '.';
  log.success(`Created ${steel(join(rel, CONFIG_FILE))}`);
  if (!audio)
    log.warn(`Set ${bold('audio:')} in ${CONFIG_FILE} to your mix file before rendering.`);
  outro(
    `Next: ${bold(`cd ${rel}`)} ${dim('then')} ${bold('setcast preview')} ${dim('or')} ${bold('setcast render')}`,
  );
}

async function ask(dir: string, demoDefault: boolean): Promise<InitAnswers> {
  const group = await prompts.group(
    {
      title: () => promptTitle(dir),
      audio: () => promptAudio(demoDefault),
      audioFile: ({ results }) => promptAudioFile(dir, results.audio),
      fps: promptFps,
      theme: promptTheme,
    },
    {
      onCancel: () => {
        cancel('Cancelled.');
        process.exit(0);
      },
    },
  );

  let audio = '';
  if (group.audio === 'demo') audio = 'demo';
  if (typeof group.audioFile === 'string') audio = group.audioFile;

  return {
    title: String(group.title),
    audio,
    fps: Number(group.fps),
    theme: String(group.theme),
  };
}

function promptTitle(dir: string) {
  return prompts.text({
    message: 'Set title',
    defaultValue: titleFrom(dir),
    placeholder: titleFrom(dir),
  });
}

function promptAudio(demoDefault: boolean) {
  return prompts.select({
    message: 'Audio',
    initialValue: demoDefault ? 'demo' : 'file',
    options: [
      {
        value: 'demo',
        label: 'Generate a demo track',
        hint: '40 s of synthesized drum & bass, renders immediately',
      },
      { value: 'file', label: 'I have a mix file', hint: 'you will point audio: at it' },
    ],
  });
}

function promptAudioFile(dir: string, audio: unknown) {
  if (audio !== 'file') return Promise.resolve(undefined);
  return prompts.text({
    message: `Path to the mix file, relative to ${basename(dir)}/`,
    placeholder: 'assets/mix.wav',
    validate: (value) =>
      value && !value.startsWith('/') && !value.startsWith('..')
        ? undefined
        : 'Use a relative path inside the project directory.',
  });
}

function promptFps() {
  return prompts.select({
    message: 'Frame rate',
    initialValue: '30',
    options: [
      { value: '30', label: '30 fps', hint: 'YouTube default, fastest render' },
      { value: '60', label: '60 fps' },
    ],
  });
}

function promptTheme() {
  return prompts.select({
    message: 'Theme',
    options: Object.keys(themes).map((name) => ({ value: name, label: name })),
  });
}

const titleFrom = (dir: string) =>
  basename(dir)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );
