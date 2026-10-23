import { LiveConfigSchema, type LiveConfig } from '@setcast/core';
import { themes } from '../../../themes/src/index.ts';

export interface EnduranceConfig {
  version: 1;
  mode: 'live' | 'export';
  seconds: number;
  sampleSeconds: number;
  changeSeconds: number;
  restartSeconds: number;
  project: string;
  at: number;
  concurrency: number;
  scenes: LiveConfig[];
}

const keys = [
  'version',
  'mode',
  'seconds',
  'sampleSeconds',
  'changeSeconds',
  'restartSeconds',
  'project',
  'at',
  'concurrency',
  'scenes',
];

export function readEnduranceConfig(input: unknown): EnduranceConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Endurance configuration must be a JSON object. See docs/endurance.md.');
  const config = input as Record<string, unknown>;
  for (const key of Object.keys(config))
    if (!keys.includes(key))
      throw new Error(`Unknown endurance setting ${key}. Use ${keys.join(', ')}.`);
  if (config.version !== 1)
    throw new Error('Endurance version must be 1. Use the documented configuration format.');
  if (config.mode !== 'live' && config.mode !== 'export')
    throw new Error('Endurance mode must be live or export. Choose the workload to qualify.');
  if (
    config.project !== undefined &&
    (typeof config.project !== 'string' || !config.project.trim())
  )
    throw new Error('Endurance project must be a nonempty project directory path.');
  return {
    version: 1,
    mode: config.mode,
    seconds: number(config, 'seconds', { fallback: 3600, min: 10, max: 86400 }),
    sampleSeconds: number(config, 'sampleSeconds', { fallback: 5, min: 1, max: 60 }),
    changeSeconds: number(config, 'changeSeconds', { fallback: 30, min: 5, max: 3600 }),
    restartSeconds: number(config, 'restartSeconds', { fallback: 600, min: 0, max: 86400 }),
    project: (config.project as string | undefined) ?? 'examples/demo',
    at: number(config, 'at', { fallback: 0, min: 0, max: 86400 }),
    concurrency: number(config, 'concurrency', { fallback: 1, min: 1, max: 8, integer: true }),
    scenes: readScenes(config.scenes),
  };
}

function number(
  config: Record<string, unknown>,
  key: string,
  bounds: { fallback: number; min: number; max: number; integer?: boolean },
) {
  const { fallback, min, max, integer } = bounds;
  const value = config[key] === undefined ? fallback : config[key];
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    throw new Error(
      `Endurance ${key}=${JSON.stringify(value)} is invalid. Use ${integer ? 'an integer' : 'a number'} from ${min} to ${max}.`,
    );
  return value;
}

function readScenes(input: unknown): LiveConfig[] {
  const scenes =
    input ??
    ['field', 'tunnel', 'constellation'].map((name) => ({
      theme: 'sterile-tech',
      title: name,
      visualizer: { name, resolution: 0.5 },
      output: { width: 960, height: 540, fps: 30 },
      branding: {
        name: 'Endurance',
        logo: 'logo.svg',
        messages: { lines: ['Sustained live output'], seconds: 3, gap: 2 },
      },
    }));
  if (!Array.isArray(scenes) || scenes.length < 1 || scenes.length > 16)
    throw new Error('Endurance scenes must contain 1 to 16 live configuration objects.');
  return scenes.map((scene, index) => {
    const config = LiveConfigSchema.parse(scene);
    if (!Object.hasOwn(themes, config.theme))
      throw new Error(
        `Endurance scenes[${index}].theme=${config.theme} is not built in. Choose ${Object.keys(themes).join(', ')}.`,
      );
    if (
      config.background ||
      config.css ||
      (config.branding?.logo && config.branding.logo !== 'logo.svg')
    )
      throw new Error(
        `Endurance scenes[${index}] references external assets. Omit background/css; use the generated logo.svg or omit the logo.`,
      );
    return config;
  });
}
