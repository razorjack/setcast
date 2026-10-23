import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { parse } from 'yaml';
import { z } from 'zod';
import { describe, expect, test } from 'vite-plus/test';
import { CONFIGURATION_SCHEMA_KINDS, configurationSchema } from './configuration-schema.ts';
import { ProjectConfigSchema } from './config.ts';
import { LiveConfigSchema } from './live.ts';
import { resolveVisualizerConfigs, visualizers } from './visualizers.ts';

const ajv = new Ajv2020({ strict: false, allErrors: true });

describe('authoring JSON Schema', () => {
  test('all published kinds compile as draft-2020-12 without external references', () => {
    for (const kind of CONFIGURATION_SCHEMA_KINDS) {
      const schema = configurationSchema(kind);
      expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(ajv.validateSchema(schema)).toBe(true);
      expect(() => ajv.compile(schema)).not.toThrow();
    }
  });

  test('accepts repository authoring examples before defaults and timecode normalization', async () => {
    const root = new URL('../../../examples/', import.meta.url);
    let count = 0;
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      for (const [file, kind, runtime] of [
        ['setcast.yaml', 'project', ProjectConfigSchema],
        ['live.yaml', 'live', LiveConfigSchema],
      ] as const) {
        const text = await readFile(new URL(join(entry.name, file), root), 'utf8').catch(
          () => null,
        );
        if (text === null) continue;
        const written = parse(text);
        runtime.parse(written);
        const validate = ajv.compile(configurationSchema(kind));
        expect(validate(written), `${entry.name}/${file}: ${JSON.stringify(validate.errors)}`).toBe(
          true,
        );
        count++;
      }
    }
    expect(count).toBeGreaterThan(5);
  });

  test('preserves required fields, strict keys, shorthand and case-insensitive output extensions', () => {
    const project = ajv.compile(configurationSchema('project'));
    const live = ajv.compile(configurationSchema('live'));
    expect(project({})).toBe(false);
    expect(live({})).toBe(true);
    for (const panel of [true, false, {}, { dwell: 0 }])
      expect(
        project({ audio: 'mix.wav', panel, output: { file: 'set.MP4' }, beatOffset: '1:23.5' }),
      ).toBe(true);
    for (const value of [
      { audio: 'mix.wav', typo: true },
      { audio: 'mix.wav', output: { fps: 29 } },
      { audio: 'mix.wav', output: { file: 'set.avi' } },
      { audio: 'mix.wav', branding: { unknown: true } },
    ])
      expect(project(value)).toBe(false);
    expect(live({ audio: 'mix.wav' })).toBe(false);
  });

  test('visualizer dispatch permits omitted name only for spectrum and preserves per-kind controls', () => {
    const validate = ajv.compile(configurationSchema('visualizer'));
    for (const input of [
      {},
      [],
      { name: 'tunnel', sides: 0 },
      [{ name: 'field' }, { name: 'constellation', links: 0 }],
    ]) {
      expect(validate(input), JSON.stringify(validate.errors)).toBe(true);
      expect(() => resolveVisualizerConfigs(input)).not.toThrow();
    }
    for (const input of [
      { seed: 42 },
      { name: 'unknown' },
      { name: 'field', sides: 6 },
      { name: 'tunnel', recoverySeconds: 16 },
    ]) {
      expect(validate(input)).toBe(false);
      expect(() => resolveVisualizerConfigs(input)).toThrow();
    }
    for (const name of visualizers.names()) expect(validate({ name })).toBe(true);
  });

  test('includes registered extension schemas without a separate built-in name list', () => {
    visualizers.add({
      name: 'schema-test-plugin',
      schema: z.strictObject({
        name: z.literal('schema-test-plugin'),
        count: z.number().int().min(2),
      }),
    });
    const validate = ajv.compile(configurationSchema('visualizer'));
    expect(validate({ name: 'schema-test-plugin', count: 2 })).toBe(true);
    expect(validate({ name: 'schema-test-plugin', count: 1 })).toBe(false);
  });

  test('does not pretend JSON Schema can check all semantic constraints', () => {
    const value = { audio: 'missing.wav', beatOffset: 'not a timecode' };
    expect(ajv.compile(configurationSchema('project'))(value)).toBe(true);
    expect(() => ProjectConfigSchema.parse(value)).toThrow();
  });
});
