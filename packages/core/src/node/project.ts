import { access, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml, YAMLParseError } from 'yaml';
import { ProjectConfigSchema, type ProjectConfig } from '../config.ts';
import { ConfigError, SetcastError, zodIssues } from '../errors.ts';
import { sortEvents, type SetEvent } from '../events.ts';
import type { ResolvedProject } from '../project.ts';
import type { Theme } from '../theme.ts';
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

  await requireFile(root, config.audio, 'audio');
  if (config.background) await requireFile(root, config.background, 'background');
  if (config.css) await requireFile(root, config.css, 'css');

  const css = [
    await readFile(BASE_CSS, 'utf8'),
    await loadCss(theme.cssFile),
    config.css ? await loadCss(join(root, config.css)) : '',
  ].join('\n');

  const project: ResolvedProject = {
    title: config.title,
    audio: config.audio,
    background: config.background ?? null,
    theme: theme.name,
    css,
    width: config.output.width,
    height: config.output.height,
    fps: config.output.fps,
    events: mergeEvents(config),
    modulation: [...theme.modulation, ...config.modulation],
    visualizer: config.visualizer,
  };
  return { dir: root, config, project };
}

export async function readConfig(root: string): Promise<ProjectConfig> {
  const file = join(root, CONFIG_FILE);
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    throw new SetcastError(
      `No ${CONFIG_FILE} found in ${root}`,
      'Run `setcast init` here to scaffold a project, or cd into a project directory.',
    );
  }
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (e) {
    const where =
      e instanceof YAMLParseError && e.linePos?.[0] ? ` (line ${e.linePos[0].line})` : '';
    throw new SetcastError(
      `${CONFIG_FILE} is not valid YAML${where}: ${(e as Error).message.split('\n')[0]}`,
      'Check indentation and quoting; YAML keys need a space after the colon.',
    );
  }
  const parsed = ProjectConfigSchema.safeParse(raw ?? {});
  if (!parsed.success) throw new ConfigError(CONFIG_FILE, zodIssues(parsed.error));
  return parsed.data;
}

async function resolveTheme(
  name: string,
  root: string,
  themes: Record<string, Theme>,
): Promise<Theme> {
  if (name.endsWith('.css')) {
    const cssFile = resolve(root, name);
    await requireFile(root, name, 'theme');
    return { name: name.replace(/.*\//, '').replace(/\.css$/, ''), cssFile, modulation: [] };
  }
  const theme = themes[name];
  if (theme) return theme;
  throw new SetcastError(
    `Unknown theme "${name}"`,
    `Built-in themes: ${Object.keys(themes).join(', ') || '(none)'}. A path to a .css file (e.g. "./my-theme.css") is also a valid theme.`,
  );
}

async function requireFile(root: string, rel: string, what: string): Promise<void> {
  try {
    await access(join(root, rel));
  } catch {
    throw new SetcastError(
      `${what} file not found: ${rel}`,
      `Expected it at ${join(root, rel)}. Paths in ${CONFIG_FILE} are relative to the project directory and must stay inside it.`,
    );
  }
}

function mergeEvents(config: ProjectConfig): SetEvent[] {
  const decks = config.deckOrder;
  const tracks = config.tracks.map((t, i): SetEvent => ({
    type: 'track_start',
    time: t.time,
    title: t.title,
    artist: t.artist,
    ...(t.label !== undefined && { label: t.label }),
    deck: t.deck ?? decks[i % decks.length]!,
  }));
  return sortEvents([...tracks, ...config.events]);
}
