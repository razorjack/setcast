import { access, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml, YAMLParseError } from 'yaml';
import { ProjectConfigSchema, type ProjectConfig } from '../config.ts';
import { ConfigError, SetcastError, zodIssues } from '../errors.ts';
import { sortEvents, type SetEvent } from '../events.ts';
import { ModPatchSchema, type ModRoute } from '../modulation.ts';
import type { ResolvedProject } from '../project.ts';
import type { Theme } from '../theme.ts';
import { resolveVisualizerConfig } from '../visualizers.ts';
import { loadCss } from './css.ts';

export const CONFIG_FILE = 'setcast.yaml';
const BASE_CSS = fileURLToPath(new URL('../../css/base.css', import.meta.url));

export interface LoadedProject {
  dir: string;
  config: ProjectConfig;
  project: ResolvedProject;
}

export interface LoadOptions {
  /** Built-in themes by name. `theme: ./x.css` paths work without any table. */
  themes?: Record<string, Theme>;
}

export async function loadProject(
  dir: string,
  { themes = {} }: LoadOptions = {},
): Promise<LoadedProject> {
  const root = resolve(dir);
  const config = await readConfig(root);
  const theme = await resolveTheme(config.theme, root, themes);
  const events = mergeEvents(config);

  await requireAssets(root, config, events);
  const userCssFile = config.css ? await requireFile(root, config.css, 'css') : null;

  const project: ResolvedProject = {
    title: config.title,
    audio: config.audio,
    background: config.background ?? null,
    theme: theme.name,
    css: await composeCss(theme, userCssFile),
    width: config.output.width,
    height: config.output.height,
    fps: config.output.fps,
    events,
    modulation: [...themeRoutes(theme), ...config.modulation],
    visualizer: resolveVisualizerConfig(config.visualizer),
    panel: config.panel,
    bpm: config.bpm ?? null,
    beatOffset: config.beatOffset,
  };
  return { dir: root, config, project };
}

/** Every media path a project names has to exist and stay inside the project directory. */
async function requireAssets(
  root: string,
  config: ProjectConfig,
  events: readonly SetEvent[],
): Promise<void> {
  await requireFile(root, config.audio, 'audio');
  if (config.background) await requireFile(root, config.background, 'background');
  for (const event of events) {
    if (event.type === 'track_start' && event.background) {
      await requireFile(root, event.background, `track "${event.title}" background`);
    }
  }
}

/** Base CSS, then the theme with its fonts inlined, then the user's overrides, in that order. */
async function composeCss(theme: Theme, userCssFile: string | null): Promise<string> {
  const base = await readFile(BASE_CSS, 'utf8');
  const themeCss = await loadCss(theme.cssFile);
  const userCss = userCssFile ? await loadCss(userCssFile) : '';
  return [base, themeCss, userCss].join('\n');
}

export async function readConfig(root: string): Promise<ProjectConfig> {
  const text = await readConfigFile(join(root, CONFIG_FILE), root);
  const raw = parseConfigYaml(text);

  const parsed = ProjectConfigSchema.safeParse(raw ?? {});
  if (!parsed.success) throw new ConfigError(CONFIG_FILE, zodIssues(parsed.error));
  return parsed.data;
}

async function readConfigFile(file: string, root: string): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    throw new SetcastError(
      `No ${CONFIG_FILE} found in ${root}`,
      'Run `setcast init` here to scaffold a project, or cd into a project directory.',
    );
  }
}

function parseConfigYaml(text: string): unknown {
  try {
    return parseYaml(text);
  } catch (error) {
    throw new SetcastError(
      `${CONFIG_FILE} is not valid YAML${yamlLine(error)}: ${firstLine(error)}`,
      'Check indentation and quoting; YAML keys need a space after the colon.',
    );
  }
}

const yamlLine = (error: unknown) =>
  error instanceof YAMLParseError && error.linePos?.[0] ? ` (line ${error.linePos[0].line})` : '';

const firstLine = (error: unknown) => (error as Error).message.split('\n')[0];

async function resolveTheme(
  name: string,
  root: string,
  themes: Record<string, Theme>,
): Promise<Theme> {
  if (name.endsWith('.css')) {
    const cssFile = await requireFile(root, name, 'theme');
    return { name: themeName(name), cssFile, modulation: [] };
  }
  const theme = themes[name];
  if (theme) return theme;
  throw new SetcastError(
    `Unknown theme "${name}"`,
    `Built-in themes: ${Object.keys(themes).join(', ') || '(none)'}. A path to a .css file (e.g. "./my-theme.css") is also a valid theme.`,
  );
}

/** The file's base name, made safe for the `theme-<name>` class on the stage root. */
const themeName = (file: string) =>
  file
    .replace(/.*[\\/]/, '')
    .replace(/\.css$/, '')
    .replace(/[^\w-]+/g, '-');

/** A theme is a plugin: its default patch goes through the same schema as the project's routes. */
function themeRoutes({ name, modulation }: Theme): ModRoute[] {
  const parsed = ModPatchSchema.safeParse(modulation);
  if (parsed.success) return parsed.data;
  const issue = zodIssues(parsed.error)[0]!;
  throw new SetcastError(
    `Theme "${name}" has an invalid modulation route: ${issue.path} ${issue.message}`,
    "A theme's default patch uses the same route schema as modulation: in setcast.yaml.",
  );
}

async function requireFile(root: string, path: string, purpose: string): Promise<string> {
  const absolute = resolve(root, path);
  if (escapesRoot(root, absolute)) {
    throw new SetcastError(
      `${purpose} path leaves the project directory: ${path}`,
      `Use a path inside ${root} (e.g. "assets/mix.wav"), not an absolute path or "..".`,
    );
  }
  try {
    await access(absolute);
  } catch {
    throw new SetcastError(
      `${purpose} file not found: ${path}`,
      `Expected it at ${absolute}. Paths in ${CONFIG_FILE} are relative to the project directory and must stay inside it.`,
    );
  }
  return absolute;
}

/** The renderer serves the project directory as its public root; nothing outside it is reachable. */
function escapesRoot(root: string, absolute: string): boolean {
  const fromRoot = relative(root, absolute);
  return fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot);
}

/** Decks alternate in play order, and an explicit deck moves the rotation on from there. */
function mergeEvents(config: ProjectConfig): SetEvent[] {
  const decks = config.deckOrder;
  let nextDeck = 0;
  const trackEvents = config.tracks.map((track): SetEvent => ({ type: 'track_start', ...track }));

  return sortEvents([...trackEvents, ...config.events]).map((event) => {
    if (event.type !== 'track_start') return event;
    const deck = event.deck ?? decks[nextDeck % decks.length]!;
    nextDeck = decks.indexOf(deck) + 1;
    return { ...event, deck };
  });
}
