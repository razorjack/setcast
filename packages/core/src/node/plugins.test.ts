import { mkdtemp, mkdir, writeFile, rm, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vite-plus/test';
import { loadPlugins, projectPlugins, assertPluginSet } from './plugins.ts';
import { resolveVisualizerConfigs } from '../visualizers.ts';
import { loadLiveProject } from './live.ts';
import { saveScene } from './save-scene.ts';
import { rebaseScene } from './scenes.ts';
import { PluginsSchema } from '../plugins.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(definition?: string) {
  const root = await mkdtemp(join(tmpdir(), 'setcast-plugin-'));
  roots.push(root);
  const packageDir = join(root, 'node_modules/setcast-viz-fixture');
  await mkdir(packageDir, { recursive: true });
  await writeFile(
    join(packageDir, 'package.json'),
    JSON.stringify({
      name: 'setcast-viz-fixture',
      version: '1.0.0',
      type: 'module',
      exports: { './setcast': './schema.mjs', './setcast/browser': './browser.mjs' },
    }),
  );
  await writeFile(
    join(packageDir, 'schema.mjs'),
    definition ??
      `
    import { z } from ${JSON.stringify(import.meta.resolve('zod'))};
    export default { apiVersion: 1, visualizer: { name: 'external-meter', audio: false,
      schema: z.strictObject({ name: z.literal('external-meter'),
        label: z.string({ error: 'label must be text. Use a quoted label.' }).default('external'),
        image: z.string().optional() }) }, assets: ['image'] };
  `,
  );
  await writeFile(
    join(packageDir, 'browser.mjs'),
    'export default function Meter() { return null; }',
  );
  await writeFile(join(root, 'theme.css'), '.setcast { color: white; }');
  return { root, packageDir };
}

test('configured schemas are scoped to one project and fill defaults', async () => {
  const { root } = await fixture();
  const { catalog, plugins } = await loadPlugins(root, ['setcast-viz-fixture']);
  expect(resolveVisualizerConfigs({ name: 'external-meter' }, catalog)).toEqual([
    { name: 'external-meter', label: 'external' },
  ]);
  expect(plugins[0]).toMatchObject({
    name: 'external-meter',
    version: '1.0.0',
    assets: ['image'],
    audio: false,
  });
  expect(() => resolveVisualizerConfigs({ name: 'external-meter' })).toThrowError(
    expect.objectContaining({
      issues: [expect.objectContaining({ message: expect.stringContaining('Unknown visualizer') })],
    }),
  );
  expect(() =>
    resolveVisualizerConfigs({ name: 'external-meter', label: 12 }, catalog),
  ).toThrowError(
    expect.objectContaining({
      issues: [expect.objectContaining({ message: expect.stringContaining('label must be text') })],
    }),
  );
});

test('package errors identify installation, contract and restart requirements', async () => {
  const { root, packageDir } = await fixture();
  await expect(loadPlugins(root, ['setcast-viz-missing'])).rejects.toMatchObject({
    hint: expect.stringContaining('Install the package'),
  });
  await loadPlugins(root, ['setcast-viz-fixture']);
  await writeFile(join(packageDir, 'browser.mjs'), 'export default () => 1;');
  await expect(loadPlugins(root, ['setcast-viz-fixture'])).rejects.toMatchObject({
    hint: expect.stringContaining('Restart'),
  });
  const invalid = await fixture('export default { apiVersion: 99 };');
  await expect(loadPlugins(invalid.root, ['setcast-viz-fixture'])).rejects.toThrow(
    'invalid /setcast default export',
  );
});

test('names cannot replace built-ins or be repeated in configuration', async () => {
  const { root } = await fixture(`import { z } from ${JSON.stringify(import.meta.resolve('zod'))};
    export default { apiVersion: 1, visualizer: { name: 'spectrum', schema: z.object({ name: z.literal('spectrum') }) } };`);
  await expect(loadPlugins(root, ['setcast-viz-fixture'])).rejects.toThrow('already registered');
  expect(PluginsSchema.safeParse(['setcast-viz-fixture', 'setcast-viz-fixture']).success).toBe(
    false,
  );
  const invalidType = PluginsSchema.safeParse([42]);
  expect(invalidType.error?.issues[0]?.message).toContain('installed npm package names');
  for (const name of ['./plugin.js', 'https://example.com/plugin', 'package@1', '../outside'])
    expect(PluginsSchema.safeParse([name]).success).toBe(false);
});

test('declared media is validated, copied in saved scenes and rebased', async () => {
  const { root } = await fixture();
  await writeFile(
    join(root, 'art.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>',
  );
  await writeFile(
    join(root, 'live.yaml'),
    'theme: ./theme.css\nplugins: [setcast-viz-fixture]\nvisualizer: { name: external-meter, image: art.svg }\n',
  );
  const { project } = await loadLiveProject(root);
  const saved = await saveScene(root, project, { theme: project.theme, art: 'project' });
  const reloaded = await loadLiveProject(join(root, saved.directory));
  const manifest = JSON.parse(await readFile(join(root, saved.directory, 'package.json'), 'utf8'));
  expect(manifest.dependencies).toEqual({ 'setcast-viz-fixture': '1.0.0' });
  const image = reloaded.project.visualizers[0]!.image as string;
  expect(await readFile(join(root, saved.directory, image), 'utf8')).toContain('<svg');
  expect(rebaseScene(reloaded.project, saved.directory).visualizers[0]!.image).toBe(
    `${saved.directory}/${image}`,
  );
  expect(project.visualizers[0]!.image).toBe('art.svg');
  await rm(join(root, 'art.svg'));
  await expect(loadLiveProject(root)).rejects.toThrow('visualizer[0].image file not found');
});

test('scene bundles reject missing and conflicting plugin versions', async () => {
  const { root } = await fixture();
  await writeFile(
    join(root, 'live.yaml'),
    'theme: ./theme.css\nplugins: [setcast-viz-fixture]\nvisualizer: { name: external-meter }\n',
  );
  const { project } = await loadLiveProject(root);
  const plugins = projectPlugins(project);
  expect(() => assertPluginSet([], plugins)).toThrow('not in the running browser bundle');
  expect(() => assertPluginSet(plugins, plugins)).not.toThrow();
  const scene = {
    ...project,
    plugins: plugins.map((plugin) => ({ ...plugin, digest: 'changed' })),
  };
  expect(() => projectPlugins({ ...project, scenes: [{ at: 0, scene }] })).toThrow(
    'Conflicting packages',
  );
});

test('declared media rejects directories and links outside the project', async () => {
  const { root } = await fixture();
  const outside = await fixture();
  await writeFile(join(outside.root, 'outside.svg'), '<svg/>');
  await symlink(join(outside.root, 'outside.svg'), join(root, 'linked.svg'));
  for (const image of ['linked.svg', 'node_modules']) {
    await writeFile(
      join(root, 'live.yaml'),
      `theme: ./theme.css\nplugins: [setcast-viz-fixture]\nvisualizer: { name: external-meter, image: ${image} }\n`,
    );
    await expect(loadLiveProject(root)).rejects.toMatchObject({
      hint: expect.stringContaining('inside the project'),
    });
  }
});
