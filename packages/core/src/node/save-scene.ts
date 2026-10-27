import { copySceneDirectory, sceneDirectory } from './copy-scenes.ts';
import { constants } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parse, stringify } from 'yaml';
import { SceneSelectionSchema, type SceneSelection } from '../live/scene-selection.ts';
import { sceneAppearance, type SceneAppearance, type SceneProject } from '../project.ts';
import { PANEL_DEFAULTS } from '../config.ts';
import { TRACKLIST_DEFAULTS } from '../mix/tracklist.ts';
import { SetcastError } from '../errors.ts';
import { parseConfigYaml } from './project.ts';

type YamlConfig = Record<string, unknown>;

/** Saves a self-contained copy; source YAML and media are never changed. */
export async function saveScene(
  root: string,
  project: SceneProject,
  selection: SceneSelection,
  kind: 'scene' | 'journal' = 'scene',
) {
  root = await realpath(root);
  SceneSelectionSchema.parse(selection);
  const configName = project.mix ? 'setcast.yaml' : 'live.yaml';
  const config = await sourceConfig(root, configName);
  const output = await mkdtemp(join(root, kind === 'journal' ? 'journal-scene-' : 'saved-scene-'));
  try {
    const selected = selectedConfig(config, project, selection);
    await copyMedia(root, output, selected);
    await copyScenes(root, output, selected, selection);
    await writeFile(join(output, `${project.theme}.css`), project.css);
    await writeFile(join(output, configName), stringify(selected));
    return { directory: basename(output), config: configName };
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    throw error;
  }
}

async function sourceConfig(root: string, name: string): Promise<YamlConfig> {
  try {
    return (parseConfigYaml(await readFile(join(root, name), 'utf8'), name) ?? {}) as YamlConfig;
  } catch (error) {
    if (name === 'live.yaml' && (error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

/** Live setup and keys a saved scene must not carry over from the project it was saved from. */
const SETUP_KEYS = ['css', 'sequence', 'projection', 'testPattern', 'beatTracking', 'midi'];

/** The source YAML with the selected appearance, art and credits written over it. */
function selectedConfig(
  config: YamlConfig,
  project: SceneProject,
  selected: SceneSelection,
): YamlConfig {
  const kept = Object.fromEntries(
    Object.entries(config).filter(
      ([key]) => !SETUP_KEYS.includes(key) && (key !== 'scenes' || project.scenes),
    ),
  );
  return {
    ...kept,
    ...appearanceConfig(selectedAppearance(project, selected)),
    performance: selected.performance ?? project.performance,
    output: {
      ...(config.output as object),
      width: project.width,
      height: project.height,
      fps: project.fps,
    },
    ...selectedArt(kept, selected),
    ...selectedCredits(project, selected),
  };
}

/** A scene appearance as `setcast.yaml` / `live.yaml` keys, with its CSS saved as `<theme>.css`. */
export function appearanceConfig(appearance: SceneAppearance): YamlConfig {
  return {
    theme: `./${appearance.theme}.css`,
    title: appearance.title,
    background: appearance.background ?? undefined,
    backgroundFit: appearance.backgroundFit,
    branding: appearance.branding ?? undefined,
    bpm: appearance.bpm ?? undefined,
    beatOffset: appearance.beatOffset,
    visualizer: appearance.visualizers,
    modulation: appearance.modulation,
  };
}

/** The project's appearance with the player's title, tempo and branding; null removes a value. */
function selectedAppearance(project: SceneProject, selected: SceneSelection): SceneAppearance {
  const appearance = sceneAppearance(project);
  return {
    ...appearance,
    title: selected.title ?? appearance.title,
    bpm: selected.bpm === undefined ? appearance.bpm : selected.bpm,
    beatOffset: selected.beatOffset ?? appearance.beatOffset,
    branding: selected.branding === undefined ? appearance.branding : selected.branding,
  };
}

/** Art chosen in the player replaces the project's art and every play's own. */
function selectedArt(config: YamlConfig, selected: SceneSelection): YamlConfig {
  if (selected.art === 'project') return {};
  if (selected.art === 'file' && !selected.artwork)
    throw new Error('Upload the artwork before saving the scene.');
  const background = selected.art === 'file' ? selected.artwork : undefined;
  if (!Array.isArray(config.plays)) return { background };
  const plays = config.plays.map(({ background: _background, ...play }) => play);
  return { background, plays };
}

function selectedCredits(project: SceneProject, selected: SceneSelection): YamlConfig {
  if (!project.mix) {
    return {
      clock: selected.clock ?? project.live.clock,
      input: selected.input ?? project.live.input,
    };
  }
  if (!selected.credits) {
    return { panel: project.panel ?? false, tracklist: project.tracklist ?? false };
  }
  return {
    panel: selected.credits === 'tracklist' ? false : (project.panel ?? PANEL_DEFAULTS),
    tracklist: selected.credits === 'panels' ? false : (project.tracklist ?? TRACKLIST_DEFAULTS),
  };
}

async function copyMedia(root: string, output: string, config: YamlConfig) {
  const copied = new Map<string, string>();
  await mkdir(join(output, 'assets'), { recursive: true });
  const copy = async (path: unknown) => {
    if (typeof path !== 'string') return undefined;
    const cached = copied.get(path);
    if (cached) return cached;
    const source = await realpath(resolve(root, path));
    const inside = relative(root, source);
    if (
      isAbsolute(path) ||
      inside === '..' ||
      inside.startsWith(`..${sep}`) ||
      isAbsolute(inside)
    ) {
      throw new SetcastError(
        `Cannot save asset outside the project: ${path}`,
        'Choose artwork inside the project or upload a file in the player.',
      );
    }
    const destination = `assets/${copied.size}${extname(path)}`;
    await copyFile(source, join(output, destination), constants.COPYFILE_FICLONE);
    copied.set(path, destination);
    return destination;
  };
  config.audio = await copy(config.audio);
  config.background = await copy(config.background);
  const branding = config.branding as { logo?: string } | undefined;
  if (branding?.logo) config.branding = { ...branding, logo: await copy(branding.logo) };
  if (Array.isArray(config.plays)) {
    for (const play of config.plays) play.background = await copy(play.background);
  }
}

async function copyScenes(
  root: string,
  output: string,
  config: YamlConfig,
  selection: SceneSelection,
) {
  if (!Array.isArray(config.scenes)) return;
  const scenes = [];
  for (const [index, entry] of config.scenes.entries()) {
    const source = await sceneDirectory(root, entry.preset);
    const preset = `scenes/${index}`;
    await copySceneDirectory(source, join(output, preset));
    if (selection.art !== 'project') {
      const file = join(output, preset, 'live.yaml');
      const scene = parse(await readFile(file, 'utf8'));
      const art = { background: selection.art === 'file' ? selection.artwork : undefined };
      await copyMedia(root, join(output, preset), art);
      scene.background = art.background;
      await writeFile(file, stringify(scene));
    }
    scenes.push({ ...entry, preset });
  }
  config.scenes = scenes;
}
