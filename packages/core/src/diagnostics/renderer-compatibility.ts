import type { RenderOptions } from '../export/export.ts';
import type { RendererCapabilities } from './renderer-capabilities.ts';

export type RendererCompatibilityOptions = Pick<
  RenderOptions,
  'gl' | 'parallelEncoding' | 'hardwareAcceleration' | 'concurrency' | 'resume'
>;
export interface RendererCompatibilityIssue {
  level: 'error' | 'warning';
  path: keyof RendererCompatibilityOptions | '';
  message: string;
  hint: string;
}

/** Check adapter support only. Schema validation and machine diagnostics remain separate. */
export function rendererCompatibility(
  capabilities: RendererCapabilities,
  options: RendererCompatibilityOptions,
): RendererCompatibilityIssue[] {
  const issues: RendererCompatibilityIssue[] = [];
  const { renderer } = capabilities;
  const error = (path: RendererCompatibilityIssue['path'], message: string, hint: string) =>
    issues.push({ level: 'error', path, message, hint });
  if (!capabilities.features.includes('video'))
    error(
      '',
      `${renderer} does not support video export.`,
      'Select a renderer with video support.',
    );
  if (options.gl !== undefined && !capabilities.graphicsBackends.includes(options.gl))
    error(
      'gl',
      `${renderer} does not support graphics backend ${options.gl}.`,
      `Choose ${capabilities.graphicsBackends.join(', ')}.`,
    );
  if (
    options.parallelEncoding !== undefined &&
    !capabilities.parallelEncoding.includes(options.parallelEncoding)
  )
    error(
      'parallelEncoding',
      `${renderer} does not support parallelEncoding: ${options.parallelEncoding}.`,
      `Choose ${capabilities.parallelEncoding.join(' or ')}.`,
    );
  if (options.resume && !capabilities.features.includes('resume'))
    error(
      'resume',
      `${renderer} does not support resumable exports.`,
      'Select a renderer with resume support, or omit --resume.',
    );
  checkConcurrency(capabilities, options.concurrency, issues);
  checkHardware(capabilities, options.hardwareAcceleration, issues);
  return issues;
}

function checkConcurrency(
  capabilities: RendererCapabilities,
  value: number | undefined,
  issues: RendererCompatibilityIssue[],
) {
  if (value === undefined) return;
  const { min, max } = capabilities.concurrency;
  if (Number.isInteger(value) && value >= min && (max === null || value <= max)) return;
  issues.push({
    level: 'error',
    path: 'concurrency',
    message: `${capabilities.renderer} does not support concurrency: ${value}.`,
    hint:
      max === null
        ? `Use an integer of at least ${min}; the runtime applies its upper limit.`
        : `Use an integer from ${min} to ${max}.`,
  });
}

function checkHardware(
  capabilities: RendererCapabilities,
  value: RenderOptions['hardwareAcceleration'],
  issues: RendererCompatibilityIssue[],
) {
  if (!value || value === 'disable' || capabilities.features.includes('hardwareEncoding')) return;
  const fallback = value === 'if-possible';
  issues.push({
    level: fallback ? 'warning' : 'error',
    path: 'hardwareAcceleration',
    message: fallback
      ? `${capabilities.renderer} uses software encoding; the CLI will fall back to software.`
      : `${capabilities.renderer} does not support required hardware encoding.`,
    hint: 'Use hardwareAcceleration: disable, or select a renderer with hardware encoding support.',
  });
}
