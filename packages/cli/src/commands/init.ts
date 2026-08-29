import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { formatTime, SetcastError } from '@setcast/core';
import { CONFIG_FILE } from '@setcast/core/node';
import { themes } from '@setcast/themes';
import { stringify } from 'yaml';
import { synthesizeDemo, type DemoAudio, type DemoSection } from '../demo/synth.ts';
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
  if (audio !== 'demo') return placeholderProject(audio);

  const spin = prompts.spinner();
  spin.start('Synthesizing a demo track (174 BPM)');
  const demo = await clearSpinnerOnError(spin, () => writeDemoTrack(dir));
  spin.stop(`Demo track written (${Math.round(demo.durationSeconds)} s)`);

  return demoProject(demo.sections);
}

/** One nameless track at 0:00: enough structure for the user to edit rather than invent. */
const placeholderProject = (audio: string): ProjectContent => ({
  audio,
  bpm: undefined,
  tracks: [{ time: '0:00', artist: 'ID', title: 'ID' }],
  events: [],
});

async function writeDemoTrack(dir: string): Promise<DemoAudio> {
  const demo = synthesizeDemo(0.25);
  await writeFile(join(dir, 'assets/demo-set.wav'), demo.wav);
  return demo;
}

/** Tracks and events placed on the demo's own arrangement, so the scaffold renders something real. */
function demoProject(sections: DemoSection[]): ProjectContent {
  const at = (index: number) => formatTime(sections[index]!.startSeconds);
  return {
    audio: 'assets/demo-set.wav',
    bpm: 174,
    tracks: [
      { time: '0:00', artist: 'Null Vector', title: 'Sterile Room', label: 'Setcast Recordings' },
      { time: at(3), artist: 'Oxide Array', title: 'Rust Protocol', label: 'Setcast Recordings' },
      { time: at(5), artist: 'ID', title: 'ID' },
    ],
    events: [
      { type: 'buildup', time: at(1) },
      { type: 'drop', time: at(2) },
      { type: 'breakdown', time: at(3) },
      { type: 'buildup', time: at(4) },
      { type: 'drop', time: at(5) },
    ],
  };
}

async function writeProjectConfig(
  dir: string,
  answers: InitAnswers,
  project: ProjectContent,
): Promise<void> {
  const yaml = [
    '# Setcast project. Paths are relative to this directory. Docs: https://github.com/razorjack/setcast',
    stringify(configFor(answers, project)),
    '# events: drop, double_drop, breakdown, buildup, rewind, switch (deck: B), chapter (title: …)',
    '# modulation routes: { source: bass|mids|highs|rms|onset, target: bg-zoom, range: [1, 1.06], curve: pow2, smooth: 0.1, when: drop }',
    '# import a tracklist:  setcast import tracklist.txt --write',
    '',
  ].join('\n');
  await writeFile(join(dir, CONFIG_FILE), yaml);
}

/** Assembled key by key, because the order they appear in is the order a user edits them in. */
function configFor(answers: InitAnswers, project: ProjectContent): Record<string, unknown> {
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
  return config;
}

function showNextSteps(dir: string, audio: string): void {
  const where = relative(process.cwd(), dir) || '.';
  log.success(`Created ${steel(join(where, CONFIG_FILE))}`);
  if (!audio) {
    log.warn(`Set ${bold('audio:')} in ${CONFIG_FILE} to your mix file before rendering.`);
  }
  outro(
    `Next: ${bold(`cd ${where}`)} ${dim('then')} ${bold('setcast preview')} ${dim('or')} ${bold('setcast render')}`,
  );
}

async function ask(dir: string, demoDefault: boolean): Promise<InitAnswers> {
  const answers = await prompts.group(
    {
      title: () => promptTitle(dir),
      audio: () => promptAudio(demoDefault),
      audioFile: ({ results }) => promptAudioFile(dir, results.audio),
      fps: promptFps,
      theme: promptTheme,
    },
    { onCancel: cancelInit },
  );

  return {
    title: String(answers.title),
    audio: chosenAudio(answers.audio, answers.audioFile),
    fps: Number(answers.fps),
    theme: String(answers.theme),
  };
}

/** The typed path when there is one, otherwise the demo, otherwise nothing to point `audio:` at. */
function chosenAudio(choice: unknown, file: unknown): string {
  if (typeof file === 'string') return file;
  return choice === 'demo' ? 'demo' : '';
}

function cancelInit(): never {
  cancel('Cancelled.');
  process.exit(0);
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

/** `my-set_02` becomes `My Set 02`: a directory name as a set title. */
const titleFrom = (dir: string) =>
  basename(dir)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );
