import { z } from 'zod';
import type { VisualizerSpec, VisualizerConfig } from './visualizers.ts';

const packageName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const packageError =
  'plugins entries must be installed npm package names, such as setcast-viz-example. Remove paths, URLs and version suffixes.';
export const PluginsSchema = z
  .array(z.string({ error: packageError }).regex(packageName, { error: packageError }), {
    error: 'plugins must be a list of installed npm package names.',
  })
  .refine((names) => new Set(names).size === names.length, {
    error: 'plugins contains a repeated package. List each package once.',
  });

/** The default export of a package's isomorphic /setcast entry. */
export interface VisualizerPlugin {
  apiVersion: 1;
  visualizer: VisualizerSpec;
  /** Top-level config fields containing optional project-relative media paths. */
  assets?: string[];
}

export interface ResolvedPlugin {
  package: string;
  version: string;
  digest: string;
  /** Directory from which to resolve the installed package, relative to the project. */
  resolveFrom: string;
  name: string;
  assets: string[];
  wholeSet: boolean;
  audio: boolean;
}

type PluginScene = { plugins?: ResolvedPlugin[]; visualizers: VisualizerConfig[] };

export function visualizerAssets(scene: PluginScene) {
  if (!scene.plugins?.length) return [];
  return scene.visualizers.flatMap((config, index) => {
    const plugin = scene.plugins?.find((entry) => entry.name === config.name);
    return (plugin?.assets ?? []).map((field) => ({
      config,
      field,
      path: `visualizer[${index}].${field}`,
      value: config[field],
    }));
  });
}
