import { AsyncLocalStorage } from 'node:async_hooks';
import type { HardwareProbe } from '@setcast/renderer-browser/export';
import {
  SetcastError,
  type Exporter,
  type ProjectConfig,
  type HardwareAcceleration,
  type RendererDiagnosticOptions,
} from '@setcast/core';
export type { PreviewOptions } from '@setcast/renderer-remotion';

export type Renderer = ProjectConfig['renderer'];
const selected = new AsyncLocalStorage<{
  name: Renderer;
  exporter: Exporter;
  signal: AbortSignal;
}>();

/** A `--renderer` value, checked before the project loads. */
export function parseRendererFlag(text: string | undefined): Renderer | undefined {
  if (text === undefined) return undefined;
  if (text === 'remotion' || text === 'browser') return text;
  throw new SetcastError(
    `Unknown renderer "${text}".`,
    'Use --renderer remotion or --renderer browser.',
  );
}

export async function rendererCapabilities(name: Renderer) {
  const adapter =
    name === 'browser'
      ? await import('@setcast/renderer-browser/capabilities')
      : await import('@setcast/renderer-remotion/capabilities');
  return adapter.capabilities;
}

export async function diagnoseRenderer(name: Renderer, options: RendererDiagnosticOptions) {
  const adapter =
    name === 'browser'
      ? await import('@setcast/renderer-browser/diagnostics')
      : await import('@setcast/renderer-remotion/diagnostics');
  return adapter.diagnose(options);
}

export async function withRenderSession<T>(task: () => Promise<T>, name: Renderer = 'remotion') {
  const exporter =
    name === 'browser'
      ? await import('@setcast/renderer-browser/export')
      : await import('@setcast/renderer-remotion');
  const controller = new AbortController();
  const stop = () =>
    controller.abort(
      new SetcastError(
        'Export interrupted.',
        'Completed outputs remain available. With --resume, completed browser chunks remain beside the output; rerun the same command.',
        { exitCode: 1 },
      ),
    );
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    return await selected.run({ name, exporter, signal: controller.signal }, () =>
      exporter.withRenderSession(task),
    );
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}

export const render: Exporter['render'] = (project, options) =>
  current().render(project, { ...options, signal: options.signal ?? selected.getStore()?.signal });
export const still: Exporter['still'] = (project, options) =>
  current().still(project, { ...options, signal: options.signal ?? selected.getStore()?.signal });

function current() {
  const context = selected.getStore();
  if (!context) throw new Error('Offline rendering requires withRenderSession.');
  return context.exporter;
}

export async function resolveHardwareEncoding(
  setting: HardwareAcceleration,
  options?: HardwareProbe,
) {
  if (selected.getStore()?.name !== 'browser')
    return (await import('@setcast/renderer-remotion')).resolveHardwareEncoding(setting);
  return (await import('@setcast/renderer-browser/export')).resolveHardwareEncoding(setting, {
    ...options,
    signal: options?.signal ?? selected.getStore()?.signal,
  });
}

export async function preview(
  ...args: Parameters<typeof import('@setcast/renderer-remotion').preview>
) {
  return (await import('@setcast/renderer-remotion')).preview(...args);
}
