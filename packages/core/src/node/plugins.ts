import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, readdir, realpath } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';
import { SetcastError } from '../errors.ts';
import { Registry } from '../registry.ts';
import { visualizers, type VisualizerSpec } from '../visualizers.ts';
import type { ResolvedPlugin, VisualizerPlugin } from '../plugins.ts';
import type { SceneProject } from '../project.ts';

const loaded = new Map<string, { digest: string; definition: VisualizerPlugin }>();

export async function loadPlugins(
  root: string,
  names: readonly string[] = [],
  dependencies?: Set<string>,
) {
  const catalog = new Registry<VisualizerSpec>('visualizer');
  for (const name of visualizers.names()) catalog.add(visualizers.get(name));
  const plugins: ResolvedPlugin[] = [];
  for (const name of names) {
    const entry = await readPlugin(root, name, dependencies);
    catalog.add(entry.definition.visualizer);
    const spec = entry.definition.visualizer;
    plugins.push({
      package: name,
      version: entry.version,
      digest: entry.digest,
      resolveFrom: '.',
      name: spec.name,
      assets: entry.definition.assets ?? [],
      wholeSet: spec.wholeSet === true,
      audio: spec.audio !== false,
    });
  }
  return { catalog, plugins };
}

async function readPlugin(root: string, name: string, dependencies?: Set<string>) {
  const require = createRequire(join(resolve(root), 'package.json'));
  let schema: string;
  let browser: string;
  try {
    schema = require.resolve(`${name}/setcast`);
    browser = require.resolve(`${name}/setcast/browser`);
  } catch (cause) {
    if (
      !['MODULE_NOT_FOUND', 'ERR_PACKAGE_PATH_NOT_EXPORTED'].includes(
        (cause as NodeJS.ErrnoException).code ?? '',
      )
    )
      throw cause;
    throw new SetcastError(
      `Cannot resolve plugin "${name}" from ${root}.`,
      'Install the package in this project and expose its /setcast and /setcast/browser ESM entries.',
      { cause },
    );
  }
  const manifest = await pluginManifest(schema, name);
  const digest = await packageDigest(manifest.root, dependencies);
  const cached = loaded.get(schema);
  if (cached && cached.digest !== digest) throw pluginChanged(name);
  const definition =
    cached?.definition ?? checkDefinition((await import(pathToFileURL(schema).href)).default, name);
  loaded.set(schema, { digest, definition });
  return { schema, browser, digest, definition, version: manifest.version };
}

async function pluginManifest(entry: string, name: string) {
  let root = dirname(await realpath(entry));
  while (dirname(root) !== root) {
    try {
      const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
      if (manifest.name === name && typeof manifest.version === 'string')
        return { root, version: manifest.version as string };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    root = dirname(root);
  }
  throw new SetcastError(
    `Plugin "${name}" has no matching package.json with a version.`,
    'Use a packaged npm visualizer with name and version metadata.',
  );
}

async function packageDigest(root: string, dependencies?: Set<string>) {
  const hash = createHash('sha256');
  async function visit(directory: string) {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const file = join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) {
        dependencies?.add(file);
        hash.update(relative(root, file).split(sep).join('/'));
        hash.update('\0');
        hash.update(await readFile(file));
        hash.update('\0');
      } else
        throw new SetcastError(
          `Plugin package contains a symbolic link or special file: ${file}.`,
          'Ship regular files inside the plugin package.',
        );
    }
  }
  await visit(root);
  return hash.digest('hex');
}

function checkDefinition(definition: unknown, name: string): VisualizerPlugin {
  const parsed = z
    .strictObject({
      apiVersion: z.literal(1),
      visualizer: z.strictObject({
        name: z.string().regex(/^[a-z][a-z0-9-]*$/),
        schema: z.custom<z.ZodType>((schema) => schema instanceof z.ZodType),
        wholeSet: z.boolean().optional(),
        audio: z.boolean().optional(),
      }),
      assets: z.array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/)).optional(),
    })
    .safeParse(definition);
  if (!parsed.success)
    throw new SetcastError(
      `Plugin "${name}" has an invalid /setcast default export: ${parsed.error.message}`,
      'Export { apiVersion: 1, visualizer: { name, schema }, assets?: [fieldName] } using the installed Zod peer.',
    );
  if (
    parsed.data.assets?.includes('name') ||
    new Set(parsed.data.assets).size !== (parsed.data.assets?.length ?? 0)
  )
    throw new SetcastError(
      `Plugin "${name}" has invalid asset fields.`,
      'Use unique top-level config field names, excluding name.',
    );
  requirePluginSchema(parsed.data, name);
  return parsed.data;
}

function requirePluginSchema(definition: VisualizerPlugin, packageName: string) {
  const { name, schema } = definition.visualizer;
  const input = z.toJSONSchema(schema, { io: 'input' });
  const literal = input.properties?.name;
  if (
    input.type !== 'object' ||
    !literal ||
    typeof literal !== 'object' ||
    !('const' in literal) ||
    literal.const !== name
  )
    throw new SetcastError(
      `Plugin "${packageName}" has an invalid schema for "${name}".`,
      'Use a JSON-compatible object schema with name: z.literal(visualizerName).',
    );
  for (const field of definition.assets ?? []) {
    if (!input.properties?.[field])
      throw new SetcastError(
        `Plugin "${packageName}" declares unknown asset field "${field}".`,
        'Include each declared media field in the visualizer schema.',
      );
  }
}

function pluginChanged(name: string) {
  return new SetcastError(
    `Plugin "${name}" changed after it was loaded.`,
    'Restart the command or preview to load the changed package and rebuild its browser code.',
  );
}

export function projectPlugins(project: SceneProject): ResolvedPlugin[] {
  const entries = [project, ...(project.scenes ?? []).map(({ scene }) => scene)].flatMap(
    (scene) => scene.plugins ?? [],
  );
  const names = new Map<string, ResolvedPlugin>();
  for (const plugin of entries) {
    const previous = names.get(plugin.name);
    if (previous && (previous.package !== plugin.package || previous.digest !== plugin.digest))
      throw new SetcastError(
        `Conflicting packages provide visualizer "${plugin.name}".`,
        'Use one package version for this visualizer in the project and all its scenes.',
      );
    names.set(plugin.name, plugin);
  }
  return [...names.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function assertPluginSet(available: ResolvedPlugin[], requested: ResolvedPlugin[]) {
  for (const plugin of requested) {
    if (
      !available.some((entry) => entry.package === plugin.package && entry.digest === plugin.digest)
    )
      throw new SetcastError(
        `Plugin "${plugin.package}" is not in the running browser bundle.`,
        'Add the package to the root plugins list and restart preview/live before recalling this scene.',
      );
  }
}

/** Browser module declarations and registrations, evaluated before the host mounts its scene. */
export async function pluginRegistration(root: string, plugins: ResolvedPlugin[]) {
  const lines = [
    `import { defineVisualizer } from ${JSON.stringify(fileURLToPath(import.meta.resolve('@setcast/core/react')))};`,
  ];
  for (const [index, plugin] of plugins.entries()) {
    const resolved = await readPlugin(resolve(root, plugin.resolveFrom), plugin.package);
    if (resolved.digest !== plugin.digest) throw pluginChanged(plugin.package);
    lines.push(`import definition${index} from ${JSON.stringify(resolved.schema)};`);
    lines.push(`import component${index} from ${JSON.stringify(resolved.browser)};`);
    lines.push(
      `defineVisualizer({ ...definition${index}.visualizer, component: component${index} });`,
    );
  }
  return lines.join('\n');
}
