import { SetcastError } from './errors.ts';
import type { GraphicsBackend } from './config.ts';
import type { RendererCapabilities, RendererFeature } from './renderer-capabilities.ts';

export const RENDERER_FEATURES: readonly RendererFeature[] = [
  'still',
  'webp',
  'video',
  'resume',
  'gpu',
  'hardwareEncoding',
];

export interface RendererDiagnosticOptions {
  gl?: GraphicsBackend;
  /** Features that must pass for the report to succeed. Defaults to video. */
  require?: readonly RendererFeature[];
  /** Per operation, not a benchmark or a total session budget. Defaults to 15 seconds. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface RendererCheck {
  id: string;
  features: readonly RendererFeature[];
  status: 'pass' | 'fail' | 'skipped';
  message: string;
  hint?: string;
  details?: Record<string, string | number | boolean | null>;
}

export type RendererReadiness = 'ready' | 'unavailable' | 'unchecked' | 'unsupported';
export interface RendererDiagnosticReport {
  version: 1;
  capabilities: RendererCapabilities;
  environment: { platform: string; arch: string; node: string };
  graphicsBackend: GraphicsBackend;
  required: readonly RendererFeature[];
  checks: RendererCheck[];
  features: Record<RendererFeature, RendererReadiness>;
  ready: boolean;
  exitCode: 0 | 1;
}

export function diagnosticOptions(options: RendererDiagnosticOptions = {}) {
  const required = options.require ?? ['video'];
  if (!required.length || required.some((feature) => !RENDERER_FEATURES.includes(feature)))
    throw new SetcastError(
      'Unknown or empty renderer diagnostic requirements.',
      `Choose one or more of: ${RENDERER_FEATURES.join(', ')}.`,
    );
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60_000)
    throw new SetcastError(
      'Diagnostic timeout must be 1000–60000 milliseconds.',
      'Use the default 15000 milliseconds unless this machine needs a longer probe.',
    );
  return { ...options, gl: options.gl ?? 'auto', require: [...new Set(required)], timeoutMs };
}

/** Failed prerequisites dominate skipped dependent checks; absent evidence never becomes ready. */
export function rendererReadiness(
  capabilities: RendererCapabilities,
  checks: readonly RendererCheck[],
) {
  return Object.fromEntries(
    RENDERER_FEATURES.map((feature) => {
      if (!capabilities.features.includes(feature)) return [feature, 'unsupported'];
      const relevant = checks.filter((check) => check.features.includes(feature));
      if (relevant.some((check) => check.status === 'fail')) return [feature, 'unavailable'];
      if (!relevant.length || relevant.some((check) => check.status === 'skipped'))
        return [feature, 'unchecked'];
      return [feature, 'ready'];
    }),
  ) as Record<RendererFeature, RendererReadiness>;
}
