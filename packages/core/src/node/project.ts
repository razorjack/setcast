import { access, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml, YAMLParseError } from 'yaml';
import { ProjectConfigSchema, type ProjectConfig, type ProjectConfigInput } from '../config.ts';
import { FEATURE_SOURCES } from '../audio.ts';
import { backgroundWarnings, isVideoFile } from '../background.ts';
import { ConfigError, SetcastError, zodIssues } from '../errors.ts';
import { compileMix, mixWarnings } from '../mix.ts';
import { Timeline } from '../timeline.ts';
import { ModPatchSchema, type ModRoute } from '../modulation.ts';
import type { ResolvedProject } from '../project.ts';
import type { Theme } from '../theme.ts';
import {
  TracklistCountsSchema,
  resolveTracklist,
  type TracklistInput,
  type TracklistCounts,
} from '../tracklist.ts';
import { resolveVisualizerConfigs, type VisualizerConfig } from '../visualizers.ts';
import { loadCss } from './css.ts';
import { readImageSize } from './image-size.ts';

export const CONFIG_FILE = 'setcast.yaml';
const BASE_CSS = fileURLToPath(new URL('../../css/base.css', import.meta.url));

export interface LoadedProject {
  dir: string;
  config: ProjectConfig;
  project: ResolvedProject;
  warnings: string[];
}

export interface LoadOptions {
  /** Receives every input path, including missing inputs, for preview reloads. */
  dependencies?: Set<string>;
  /** Renderer-owned audio probe, called before finite timeline normalization. */
  probeDuration?: (audio: string, root: string) => Promise<number>;
  /** Built-in themes by name. `theme: ./x.css` paths work without any table. */
  themes?: Record<string, Theme>;
  /** A theme to use instead of the one `setcast.yaml` names, such as the CLI's `--theme`. */
  theme?: string;
}

export async function loadProject(
  dir: string,
  {
    themes = {},
    theme: themeOverride,
    probeDuration,
    dependencies = new Set<string>(),
  }: LoadOptions = {},
): Promise<LoadedProject> {
  const root = resolve(dir);
  dependencies.add(join(root, CONFIG_FILE));
  const { config, input } = await readProjectConfig(root);
  const themeName = themeOverride ?? config.theme;
  trackDependencies(root, config, themeName, dependencies);
  const theme = await resolveTheme(themeName, root, themes);

  await requireAssets(root, config);
  if (!probeDuration)
    throw new Error(
      'loadProject requires options.probeDuration(audio, root) to finalize finite mix intervals.',
    );
  const mix = compileMix(config, await probeDuration(config.audio, root));
  const userCssFile = config.css ? await requireFile(root, config.css, 'css') : null;

  const project = resolveProject(
    config,
    theme,
    mix,
    await composeCss(theme, userCssFile, dependencies),
  );
  return {
    dir: root,
    config,
    project,
    warnings: [
      ...projectWarnings(config, project.modulation, input),
      ...mixWarnings(mix),
      ...(await artWarnings(root, config)),
    ],
  };
}

function resolveProject(
  config: ProjectConfig,
  theme: Theme,
  mix: ResolvedProject['mix'],
  css: string,
): ResolvedProject {
  const modulation = [...themeRoutes(theme), ...config.modulation];
  let presentation = config.presentation.mode;
  if (presentation === 'auto') presentation = new Timeline(mix).overlaps ? 'dj' : 'playlist';
  return {
    title: config.title,
    clockOffset: config.clockOffset,
    clockTotal: config.clockTotal ?? null,
    audio: config.audio,
    background: config.background ?? null,
    backgroundFit: config.backgroundFit,
    theme: theme.name,
    css,
    width: config.output.width,
    height: config.output.height,
    fps: config.output.fps,
    mix,
    presentation,
    modulation,
    visualizers: resolveVisualizers(config.visualizer, theme),
    envelope: null,
    panel: config.panel,
    tracklist: resolveProjectTracklist(config.tracklist, theme),
    bpm: config.bpm ?? null,
    beatOffset: config.beatOffset,
  };
}

function trackDependencies(
  root: string,
  config: ProjectConfig,
  theme: string,
  dependencies: Set<string>,
) {
  for (const path of [config.audio, config.css, ...backgroundPaths(config).keys()]) {
    if (path) dependencies.add(resolve(root, path));
  }
  if (theme.endsWith('.css')) dependencies.add(resolve(root, theme));
}

function projectWarnings(
  config: ProjectConfig,
  routes: readonly ModRoute[],
  input: ProjectConfigInput,
): string[] {
  return [
    ...modulationWarnings(config, routes),
    ...(config.panel.dwell === 0 && config.panel.fade > 0 && input.panel?.fade !== undefined
      ? ['panel.fade has no effect when panel.dwell is 0.']
      : []),
  ];
}

function modulationWarnings(config: ProjectConfig, routes: readonly ModRoute[]): string[] {
  const effectiveRoutes = [
    ...new Map(routes.map((route) => [`${route.scope}:${route.target}`, route])).values(),
  ];
  const hasDrop = config.annotations.some((annotation) => annotation.kind === 'drop');
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
        `modulation route "${route.target}" uses when: drop, but the set has no drop annotations; the route never fires.`,
      );
    }
    return warnings;
  });
}

/** Every media path a project names has to exist and stay inside the project directory. */
async function requireAssets(root: string, config: ProjectConfig): Promise<void> {
  await requireFile(root, config.audio, 'audio');
  if (config.background) await requireFile(root, config.background, 'background');
  for (const [index, play] of config.plays.entries()) {
    if (play.background) await requireFile(root, play.background, `plays[${index}].background`);
  }
}

/** Art that will look soft, or that `backgroundFit: auto` shows whole, before anything renders. */
async function artWarnings(root: string, config: ProjectConfig): Promise<string[]> {
  const frame = { width: config.output.width, height: config.output.height };
  const warnings: string[] = [];
  for (const [path, key] of backgroundPaths(config)) {
    if (isVideoFile(path)) continue;
    const size = await readImageSize(join(root, path));
    if (!size) continue;
    warnings.push(...backgroundWarnings(`${key} ${path}`, size, frame, config.backgroundFit));
  }
  return warnings;
}

/** Each background file once, with the first key that names it. */
function backgroundPaths(config: ProjectConfig): Map<string, string> {
  const paths = new Map<string, string>();
  if (config.background) paths.set(config.background, 'background');
  for (const [index, play] of config.plays.entries()) {
    if (play.background && !paths.has(play.background)) {
      paths.set(play.background, `plays[${index}].background`);
    }
  }
  return paths;
}

/** Base CSS, then the theme with its fonts inlined, then the user's overrides, in that order. */
async function composeCss(
  theme: Theme,
  userCssFile: string | null,
  dependencies?: Set<string>,
): Promise<string> {
  dependencies?.add(BASE_CSS);
  const base = await readFile(BASE_CSS, 'utf8');
  const themeCss = await loadCss(theme.cssFile, dependencies);
  const userCss = userCssFile ? await loadCss(userCssFile, dependencies) : '';
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
    return parseYaml(text, { version: '1.2' });
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

/** The project's `visualizer:` when it has one, otherwise the theme's default, otherwise a spectrum. */
function resolveVisualizers(written: unknown, theme: Theme): VisualizerConfig[] {
  if (written !== undefined) return resolveVisualizerConfigs(written);
  try {
    return resolveVisualizerConfigs(theme.visualizer ?? {});
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    const issue = error.issues[0]!;
    throw new SetcastError(
      `Theme "${theme.name}" has an invalid default visualizer: ${issue.path} ${issue.message}`,
      "A theme's default visualizer uses the same blocks as visualizer: in setcast.yaml.",
      { cause: error },
    );
  }
}

/** The project's `tracklist:` over the theme's default, which is reported under the theme's name. */
function resolveProjectTracklist(
  written: TracklistInput | undefined,
  theme: Theme,
): TracklistCounts | null {
  const parsed = TracklistCountsSchema.optional().safeParse(theme.tracklist);
  if (parsed.success) return resolveTracklist(written, parsed.data);
  const issue = zodIssues(parsed.error)[0]!;
  throw new SetcastError(
    `Theme "${theme.name}" has an invalid default tracklist: ${issue.path} ${issue.message}`,
    "A theme's default tracklist uses the same keys as tracklist: in setcast.yaml.",
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
  if (isAbsolute(path)) {
    throw new SetcastError(
      `${purpose} requires a project-relative path: ${path}`,
      `Use ${JSON.stringify(relative(root, absolute))} in ${CONFIG_FILE}.`,
    );
  }
  try {
    await access(absolute);
  } catch (cause) {
    if (!isEnoent(cause)) throw cause;
    throw new SetcastError(
      `${purpose} file not found: ${path}`,
      `Expected it at ${absolute}. Paths in ${CONFIG_FILE} are relative to the project directory and must stay inside it.`,
      { cause },
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
