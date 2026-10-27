import type { StillOptions, StillResult } from '@setcast/core';
import { withRenderSession, rendererName } from '../renderer.ts';
import { mkdir } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import {
  defaultStillTime,
  toSeconds,
  formatTime,
  type ResolvedProject,
  type SetEnvelope,
} from '@setcast/core';
import type { LoadedProject } from '@setcast/core/node';
import { still } from '../renderer.ts';
import { themes } from '@setcast/themes';
import { parseAt, parseCommandArgs, timeWithinAudio } from '../args.ts';
import { stem } from '../paths.ts';
import { load, withWholeSet } from '../project.ts';
import { bold, intro, outro, RenderUi, shown } from '../ui.ts';

export const help = `setcast still [dir] [--at MM:SS] [--out thumb.jpg] [--theme name|all]

Renders one frame as an image, ready to upload as the YouTube thumbnail.
  --renderer  remotion (default) or browser (experimental); overrides renderer: in YAML
  --at     the moment to grab; defaults to the first drop, or a quarter into the set
  --out    output file; .png, .jpg or .webp (default: output.file with a .jpg extension)
  --theme  a built-in theme or a .css file to use instead of setcast.yaml's theme:;
           all grabs one still per built-in theme, named after it (thumb-pirate.jpg)`;

const EVERY_THEME = 'all';

interface StillCommandOptions {
  dir: string | undefined;
  at: number | undefined;
  out: string | undefined;
  theme: string | undefined;
  renderer: string | undefined;
}

type StillPlan = Omit<StillOptions, 'onProgress'> & { at: number };

export async function run(argv: string[]) {
  const options = parseOptions(argv);
  intro('still');
  const loaded = await load(
    options.dir,
    options.theme === EVERY_THEME ? Object.keys(themes)[0] : options.theme,
  );
  await withRenderSession(
    () => runCommand(options, loaded),
    rendererName(options.renderer, loaded.config.renderer),
  );
}

async function runCommand(options: StillCommandOptions, loaded: LoadedProject): Promise<void> {
  if (options.theme === EVERY_THEME) {
    await grabEveryTheme(options);
    return;
  }

  const plan = planStill(loaded, options);
  const project = await withWholeSet(loaded);
  const result = await grabStill(
    project,
    plan,
    (grabbed) => `Grabbed ${bold(formatTime(grabbed.timeSeconds))} of the set`,
  );

  outro(`${bold('Done')}  →  ${shown(result.file)}`);
}

/** The same moment in every built-in theme, one file each, to compare them over the user's art. */
async function grabEveryTheme(options: StillCommandOptions): Promise<void> {
  const names = Object.keys(themes);
  const column = Math.max(...names.map((name) => name.length));
  let envelope: SetEnvelope | null = null;
  let grabbedAt = 0;

  for (const theme of names) {
    const loaded = await load(options.dir, theme);
    const plan = planStill(loaded, options);
    const project: ResolvedProject = envelope
      ? { ...loaded.project, envelope }
      : await withWholeSet(loaded);
    envelope = project.envelope;
    const themedPlan = { ...plan, out: themedFile(plan.out, theme) };
    const result = await grabStill(
      project,
      themedPlan,
      (grabbed) => `${theme.padEnd(column)}  ${shown(grabbed.file)}`,
    );
    grabbedAt = result.timeSeconds;
  }

  outro(`${bold('Done')}  →  ${names.length} themes at ${bold(formatTime(grabbedAt))}`);
}

function parseOptions(argv: string[]): StillCommandOptions {
  const { values, positionals } = parseCommandArgs(
    argv,
    {
      at: { type: 'string' },
      out: { type: 'string' },
      theme: { type: 'string' },
      renderer: { type: 'string' },
    },
    help,
  );
  return {
    dir: positionals[0],
    at: values.at ? parseAt(values.at) : undefined,
    out: values.out,
    theme: values.theme,
    renderer: values.renderer === undefined ? undefined : rendererName(values.renderer, 'remotion'),
  };
}

/** Where and when to grab, from the flags and the project. */
function planStill(loaded: LoadedProject, options: StillCommandOptions): StillPlan {
  const { dir, config, project } = loaded;
  const duration = toSeconds(project.mix.duration);
  const at = options.at ?? defaultStillTime(project.mix);
  return {
    projectDir: dir,
    out: options.out ? resolve(options.out) : defaultOut(dir, config.output.file),
    at: timeWithinAudio(at, duration, '--at'),
    jpegQuality: config.output.jpegQuality,
    gl: config.output.gl,
  };
}

async function grabStill(
  project: ResolvedProject,
  plan: StillPlan,
  describe: (grabbed: StillResult) => string,
): Promise<StillResult> {
  await mkdir(dirname(plan.out), { recursive: true });
  const ui = new RenderUi();
  const result = await ui.run(() => still(project, { ...plan, onProgress: ui.onProgress }));
  ui.done(describe(result));
  return result;
}

/** The video's own name with an image extension, so the thumbnail sits next to the render. */
const defaultOut = (dir: string, videoFile: string) => resolve(dir, `${stem(videoFile)}.jpg`);

/** `out/set.jpg` → `out/set-pirate.jpg`. */
const themedFile = (file: string, theme: string) => `${stem(file)}-${theme}${extname(file)}`;
