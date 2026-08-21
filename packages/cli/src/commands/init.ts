import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { formatTime, SetcastError } from '@setcast/core';
import { CONFIG_FILE } from '@setcast/core/node';
import { themes } from '@setcast/themes';
import { stringify } from 'yaml';
import { synthesizeDemo } from '../demo/synth.ts';
import { bold, cancel, dim, intro, log, outro, prompts, steel } from '../ui.ts';

const TEMPLATES = fileURLToPath(new URL('../../templates/', import.meta.url));

export const help = `setcast init [dir] [--demo] [--yes]

Scaffolds a project: setcast.yaml, a background, and (with --demo) a generated demo track so
\`setcast render\` works immediately. Interactive unless --yes.`;

export async function run(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { demo: { type: 'boolean' }, yes: { type: 'boolean' } },
  });
  const dir = resolve(positionals[0] ?? '.');
  intro('init');
  if (await exists(join(dir, CONFIG_FILE))) {
    throw new SetcastError(
      `${CONFIG_FILE} already exists in ${dir}`,
      'Pick another directory or remove it first.',
    );
  }

  const answers = values.yes
    ? { title: titleFrom(dir), audio: values.demo ? 'demo' : '', fps: 30, theme: 'sterile-tech' }
    : await ask(dir, values.demo ?? false);

  await mkdir(join(dir, 'assets'), { recursive: true });
  await writeFile(join(dir, 'assets/bg.svg'), await readFile(join(TEMPLATES, 'bg.svg')));

  let audio = answers.audio;
  let tracks: object[] = [{ time: '0:00', artist: 'ID', title: 'ID' }];
  let events: object[] = [];
  if (audio === 'demo') {
    const s = prompts.spinner();
    s.start('Synthesizing a demo track (174 BPM)');
    try {
      const demo = synthesizeDemo(0.25);
      audio = 'assets/demo-set.wav';
      await writeFile(join(dir, audio), demo.wav);
      const at = (i: number) => formatTime(demo.sections[i]!.startSeconds);
      tracks = [
        { time: '0:00', artist: 'Null Vector', title: 'Sterile Room', label: 'Setcast Recordings' },
        { time: at(3), artist: 'Oxide Array', title: 'Rust Protocol', label: 'Setcast Recordings' },
        { time: at(5), artist: 'ID', title: 'ID' },
      ];
      events = [
        { type: 'buildup', time: at(1) },
        { type: 'drop', time: at(2) },
        { type: 'breakdown', time: at(3) },
        { type: 'buildup', time: at(4) },
        { type: 'drop', time: at(5) },
      ];
      s.stop(`Demo track written (${Math.round(demo.durationSeconds)} s)`);
    } catch (error) {
      s.clear();
      throw error;
    }
  }

  const yaml = [
    `# Setcast project. Paths are relative to this directory. Docs: https://github.com/setcast/setcast`,
    stringify({
      title: answers.title,
      audio: audio || 'CHANGE-ME.wav',
      background: 'assets/bg.svg',
      theme: answers.theme,
      renderer: 'remotion',
      output: { width: 1920, height: 1080, fps: answers.fps, file: 'out/set.mp4' },
      tracks,
      events,
      modulation: [],
      visualizer: { name: 'spectrum', bars: 48 },
    }),
    `# events: drop, double_drop, breakdown, buildup, rewind, switch (deck: B), chapter (title: …)`,
    `# modulation routes: { source: bass|mids|highs|rms|onset, target: bg-zoom, range: [1, 1.06], curve: pow2, smooth: 0.1, when: drop }`,
    `# import a tracklist:  setcast import tracklist.txt --write`,
    '',
  ].join('\n');
  await writeFile(join(dir, CONFIG_FILE), yaml);

  const rel = relative(process.cwd(), dir) || '.';
  log.success(`Created ${steel(join(rel, CONFIG_FILE))}`);
  if (!audio)
    log.warn(`Set ${bold('audio:')} in ${CONFIG_FILE} to your mix file before rendering.`);
  outro(
    `Next: ${bold(`cd ${rel}`)} ${dim('then')} ${bold('setcast preview')} ${dim('or')} ${bold('setcast render')}`,
  );
}

async function ask(dir: string, demoDefault: boolean) {
  const group = await prompts.group(
    {
      title: () =>
        prompts.text({
          message: 'Set title',
          defaultValue: titleFrom(dir),
          placeholder: titleFrom(dir),
        }),
      audio: () =>
        prompts.select({
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
        }),
      audioFile: ({ results }) =>
        results.audio === 'file'
          ? prompts.text({
              message: `Path to the mix file, relative to ${basename(dir)}/`,
              placeholder: 'assets/mix.wav',
              validate: (v) =>
                v && !v.startsWith('/') && !v.startsWith('..')
                  ? undefined
                  : 'Use a relative path inside the project directory.',
            })
          : Promise.resolve(undefined),
      fps: () =>
        prompts.select({
          message: 'Frame rate',
          initialValue: '30',
          options: [
            { value: '30', label: '30 fps', hint: 'YouTube default, fastest render' },
            { value: '60', label: '60 fps' },
          ],
        }),
      theme: () =>
        prompts.select({
          message: 'Theme',
          options: Object.keys(themes).map((name) => ({ value: name, label: name })),
        }),
    },
    {
      onCancel: () => {
        cancel('Cancelled.');
        process.exit(0);
      },
    },
  );
  return {
    title: String(group.title),
    audio:
      group.audio === 'demo' ? 'demo' : typeof group.audioFile === 'string' ? group.audioFile : '',
    fps: Number(group.fps),
    theme: String(group.theme),
  };
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
