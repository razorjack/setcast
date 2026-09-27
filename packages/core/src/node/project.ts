import { access, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml, YAMLParseError } from 'yaml';
import { ProjectConfigSchema, type ProjectConfig, type ProjectConfigInput } from '../config.ts';
import { FEATURE_SOURCES } from '../audio.ts';
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
  warnings: string[];
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
  const { config, input } = await readProjectConfig(root);
  const theme = await resolveTheme(config.theme, root, themes);
  const events = mergeEvents(config);
  const modulation = [...themeRoutes(theme), ...config.modulation];

  await requireAssets(root, config, events);
  const userCssFile = config.css ? await requireFile(root, config.css, 'css') : null;

  const project: ResolvedProject = {
    title: config.title,
    clockOffset: config.clockOffset,
    clockTotal: config.clockTotal ?? null,
    trackNumberOffset: config.trackNumberOffset,
    audio: config.audio,
    background: config.background ?? null,
    theme: theme.name,
    css: await composeCss(theme, userCssFile),
    width: config.output.width,
    height: config.output.height,
    fps: config.output.fps,
    events,
    modulation,
    visualizer: resolveVisualizerConfig(config.visualizer),
    panel: config.panel,
    bpm: config.bpm ?? null,
    beatOffset: config.beatOffset,
  };
  return {
    dir: root,
    config,
    project,
    warnings: projectWarnings(config, events, modulation, input),
  };
}

function projectWarnings(
  config: ProjectConfig,
  events: readonly SetEvent[],
  routes: readonly ModRoute[],
  input: ProjectConfigInput,
): string[] {
  return [
    ...modulationWarnings(config, events, routes),
    ...trackWarnings(config, events),
    ...(config.panel.dwell === 0 && config.panel.fade > 0 && input.panel?.fade !== undefined
      ? ['panel.fade has no effect when panel.dwell is 0.']
      : []),
  ];
}

function modulationWarnings(
  config: ProjectConfig,
  events: readonly SetEvent[],
  routes: readonly ModRoute[],
): string[] {
  const effectiveRoutes = [...new Map(routes.map((route) => [route.target, route])).values()];
  const hasDrop = events.some((event) => event.type === 'drop' || event.type === 'double_drop');
  return effectiveRoutes.flatMap((route) => {
    const warnings: string[] = [];
    if ((route.source === 'beat' || route.source === 'bar') && !config.bpm) {
      warnings.push(
        `modulation route "${route.target}" uses ${route.source}, but the project has no bpm; its source stays at 0.`,
      );
    }
    if (route.source.includes(':') && route.smooth > 0) {
      warnings.push(
        `modulation route "${route.target}" sets smooth, but smooth only applies to audio sources.`,
      );
    }
    if ((FEATURE_SOURCES as readonly string[]).includes(route.source) && route.window !== 1) {
      warnings.push(
        `modulation route "${route.target}" sets window, but window only applies to timeline sources.`,
      );
    }
    if (route.when === 'drop' && !hasDrop) {
      warnings.push(
        `modulation route "${route.target}" uses when: drop, but the set has no drop events; the route never fires.`,
      );
    }
    return warnings;
  });
}

function trackWarnings(config: ProjectConfig, events: readonly SetEvent[]): string[] {
  const warnings: string[] = [];
  for (let index = 1; index < config.tracks.length; index++) {
    const track = config.tracks[index]!;
    const previous = config.tracks[index - 1]!;
    if (track.time < previous.time) {
      warnings.push(
        `track "${track.title}" at ${track.time} s appears after a later track in tracks:; Setcast sorts tracks by time.`,
      );
    }
  }

  const tracks = events.filter((event) => event.type === 'track_start');
  for (let index = 1; index < tracks.length; index++) {
    const track = tracks[index]!;
    const previous = tracks[index - 1]!;
    if (track.time === previous.time) {
      warnings.push(
        `tracks "${previous.title}" and "${track.title}" both start at ${track.time} s.`,
      );
    }
  }
  return warnings;
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
  const { config } = await readProjectConfig(root);
  return config;
}

async function readProjectConfig(root: string) {
  const text = await readConfigFile(join(root, CONFIG_FILE), root);
  const raw = parseConfigYaml(text);

  const parsed = ProjectConfigSchema.safeParse(raw ?? {});
  if (!parsed.success) throw new ConfigError(CONFIG_FILE, zodIssues(parsed.error));
  return { config: parsed.data, input: raw as ProjectConfigInput };
}

async function readConfigFile(file: string, root: string): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch (cause) {
    if (!isEnoent(cause)) throw cause;
    throw new SetcastError(
      `No ${CONFIG_FILE} found in ${root}`,
      'Run `setcast init` here to scaffold a project, or cd into a project directory.',
      { cause },
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

const isEnoent = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

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
