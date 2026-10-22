import { copySceneDirectory, sceneDirectory } from './copy-scenes.ts';
import { constants } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parse, stringify } from 'yaml';
import { SceneSelectionSchema, type SceneSelection } from '../scene-selection.ts';
import type { SceneProject } from '../project.ts';
import { PANEL_DEFAULTS } from '../config.ts';
import { TRACKLIST_DEFAULTS } from '../tracklist.ts';
import { SetcastError } from '../errors.ts';
import { parseConfigYaml } from './project.ts';

/** Saves a self-contained copy; source YAML and media are never changed. */
export async function saveScene(root: string, project: SceneProject, selection: SceneSelection) {
  root = await realpath(root);
  SceneSelectionSchema.parse(selection);
  const configName = project.mix ? 'setcast.yaml' : 'live.yaml';
  const config = await sourceConfig(root, configName);
  const output = await mkdtemp(join(root, 'saved-scene-'));
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

async function sourceConfig(root: string, name: string): Promise<Record<string, unknown>> {
  try {
    return (parseConfigYaml(await readFile(join(root, name), 'utf8'), name) ?? {}) as Record<
      string,
      unknown
    >;
  } catch (error) {
    if (name === 'live.yaml' && (error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

function selectedConfig(
  config: Record<string, unknown>,
  project: SceneProject,
  selected: SceneSelection,
) {
  const copy = { ...config };
  delete copy.css;
  if (!project.scenes) delete copy.scenes;
  copy.theme = `./${project.theme}.css`;
  copy.title = selected.title ?? project.title;
  copy.modulation = project.modulation;
  copy.visualizer = project.visualizers;
  copy.backgroundFit = project.backgroundFit;
  copy.background = project.background ?? undefined;
  copy.bpm = (selected.bpm === undefined ? project.bpm : selected.bpm) ?? undefined;
  copy.beatOffset = selected.beatOffset ?? project.beatOffset;
  copy.output = {
    ...(config.output as object),
    width: project.width,
    height: project.height,
    fps: project.fps,
  };
  selectArt(copy, selected);
  selectCredits(copy, project, selected);
  return copy;
}

function selectArt(copy: Record<string, unknown>, selected: SceneSelection) {
  if (selected.art !== 'project') {
    copy.background = selected.art === 'file' ? selected.artwork : undefined;
    if (selected.art === 'file' && !selected.artwork)
      throw new Error('Upload the artwork before saving the scene.');
    if (Array.isArray(copy.plays))
      copy.plays = copy.plays.map(({ background: _background, ...play }) => play);
  }
}

function selectCredits(
  copy: Record<string, unknown>,
  project: SceneProject,
  selected: SceneSelection,
) {
  if (project.mix) {
    copy.panel = project.panel ?? false;
    copy.tracklist = project.tracklist ?? false;
    if (selected.credits) {
      copy.panel = selected.credits === 'tracklist' ? false : (project.panel ?? PANEL_DEFAULTS);
      copy.tracklist =
        selected.credits === 'panels' ? false : (project.tracklist ?? TRACKLIST_DEFAULTS);
    }
  } else {
    copy.clock = selected.clock ?? project.live.clock;
    copy.input = selected.input ?? project.live.input;
  }
}

async function copyMedia(root: string, output: string, config: Record<string, unknown>) {
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
  if (Array.isArray(config.plays)) {
    for (const play of config.plays) play.background = await copy(play.background);
  }
}

async function copyScenes(
  root: string,
  output: string,
  config: Record<string, unknown>,
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
