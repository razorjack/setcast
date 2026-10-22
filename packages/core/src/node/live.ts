import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ConfigError, SetcastError, zodIssues } from '../errors.ts';
import { LiveConfigSchema, type LiveConfig } from '../live.ts';
import type { Theme } from '../theme.ts';
import type { ResolvedLiveProject } from '../project.ts';
import { visualizers } from '../visualizers.ts';
import {
  composeCss,
  parseConfigYaml,
  requireFile,
  resolveTheme,
  resolveVisualizers,
  themeRoutes,
  type LoadOptions,
} from './project.ts';

const LIVE_CONFIG = 'live.yaml';

export interface LoadedLiveProject {
  dir: string;
  project: ResolvedLiveProject;
  warnings: string[];
}

/** Missing live.yaml uses defaults; an existing file is always validated. No audio is probed. */
export async function loadLiveProject(
  dir: string,
  options: Pick<LoadOptions, 'themes' | 'theme'> = {},
): Promise<LoadedLiveProject> {
  const root = resolve(dir);
  await requireDirectory(root);
  const config = await readLiveConfig(root);
  const theme = await resolveTheme(
    options.theme ?? config.theme,
    root,
    options.themes ?? {},
    LIVE_CONFIG,
  );
  if (config.background) await requireFile(root, config.background, 'background', LIVE_CONFIG);
  const css = config.css ? await requireFile(root, config.css, 'css', LIVE_CONFIG) : null;
  const selected = resolveLiveVisualizers(config, theme);
  const warnings: string[] = [];
  const available = selected.filter((entry) => !visualizers.get(entry.name).wholeSet);
  if (available.length !== selected.length) {
    warnings.push(
      'Whole-set visualizers are omitted live because the performance has no known endpoint.',
    );
  }
  const project = resolveLiveProject(config, theme, await composeCss(theme, css), available);
  warnings.push(...liveWarnings(project, config));
  return { dir: root, project, warnings };
}

function resolveLiveProject(
  config: LiveConfig,
  theme: Theme,
  css: string,
  selected: ResolvedLiveProject['visualizers'],
): ResolvedLiveProject {
  return {
    title: config.title,
    audio: null,
    mix: null,
    clockOffset: 0,
    clockTotal: null,
    background: config.background ?? null,
    backgroundFit: config.backgroundFit,
    theme: theme.name,
    css,
    ...config.output,
    presentation: 'playlist',
    modulation: [...themeRoutes(theme), ...config.modulation],
    visualizers: selected,
    envelope: null,
    travel: null,
    panel: null,
    tracklist: null,
    bpm: config.bpm ?? null,
    beatOffset: config.beatOffset,
    live: { input: config.input, clock: config.clock },
  };
}

function resolveLiveVisualizers(
  config: LiveConfig,
  theme: Parameters<typeof resolveVisualizers>[1],
) {
  try {
    return resolveVisualizers(config.visualizer, theme);
  } catch (error) {
    if (error instanceof ConfigError) throw new ConfigError(LIVE_CONFIG, error.issues);
    throw error;
  }
}

function liveWarnings(project: ResolvedLiveProject, config: LiveConfig): string[] {
  const warnings: string[] = [];
  if (
    config.modulation.some(
      (route) =>
        route.scope === 'play' ||
        route.when ||
        !['bass', 'mids', 'highs', 'rms', 'onset', 'beat', 'bar'].includes(route.source),
    )
  ) {
    warnings.push(
      'Live input has no tracks or annotations. Unconditional audio and manual tempo routes can react; other routes stay at their resting values.',
    );
  }
  if (
    !project.bpm &&
    config.modulation.some((route) => route.source === 'beat' || route.source === 'bar')
  ) {
    warnings.push(
      'Live beat/bar routes rest until tempo is set. Add bpm: to live.yaml or use the Tempo controls.',
    );
  }
  if (/var\(\s*--travel-/.test(project.css)) {
    warnings.push(
      'This CSS uses --travel-* from whole-set analysis. Live input does not provide those variables; add CSS fallbacks.',
    );
  }
  return warnings;
}

async function readLiveConfig(root: string): Promise<LiveConfig> {
  let text: string;
  try {
    text = await readFile(join(root, LIVE_CONFIG), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return LiveConfigSchema.parse({});
    }
    throw error;
  }
  const parsed = LiveConfigSchema.safeParse(parseConfigYaml(text, LIVE_CONFIG) ?? {});
  if (!parsed.success) throw new ConfigError(LIVE_CONFIG, zodIssues(parsed.error));
  return parsed.data;
}

async function requireDirectory(root: string) {
  try {
    if ((await stat(root)).isDirectory()) return;
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  throw new SetcastError(
    `Live project directory does not exist or is not a directory: ${root}`,
    'Choose an existing directory for live.yaml and your artwork, or omit dir to use the current directory.',
  );
}
