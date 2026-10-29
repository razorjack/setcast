import {
  RENDERER_FEATURES,
  SetcastError,
  type RendererDiagnosticReport,
  type RendererFeature,
  type GraphicsBackend,
} from '@setcast/core';
import { parseCommandArgs, parseNumber } from '../args.ts';
import { diagnoseRenderer, rendererCapabilities, parseRendererFlag } from '../renderer.ts';

export const help = `setcast doctor [--renderer remotion|browser] [--require video,gpu] [--gl auto] [--json]

Check this machine with the selected renderer. Defaults to Remotion; does not read a project.
Runs small browser, screenshot, WebGL and codec probes. No downloads or configuration changes.
  --require  comma-separated features that must work (default video):
             still, webp, video, resume, cache, gpu, hardwareEncoding
  --gl       graphics backend to probe (default auto)
  --timeout  probe timeout in seconds, 1–60 (default 15)
  --json     one versioned report, including failed and skipped checks

Optional failures do not fail the command unless their feature is required.
Exit status: 0 requested features ready, 1 unavailable/unchecked or interrupted, 2 invalid arguments.
This is a setup smoke check, not project validation, a benchmark or hardware qualification.`;

async function argumentsFor(argv: string[]) {
  const { values, positionals } = parseCommandArgs(
    argv,
    {
      renderer: { type: 'string' },
      require: { type: 'string' },
      gl: { type: 'string' },
      timeout: { type: 'string' },
      json: { type: 'boolean' },
    },
    help,
  );
  if (positionals.length) throw new SetcastError('doctor takes no project directory.', help);
  const name = parseRendererFlag(values.renderer) ?? 'remotion';
  const capabilities = await rendererCapabilities(name);
  const required = (values.require ?? 'video').split(',').map((value) => value.trim());
  if (required.some((feature) => !RENDERER_FEATURES.includes(feature as RendererFeature)))
    throw new SetcastError('Unknown or empty --require feature.', help);
  const gl = values.gl ?? 'auto';
  if (!capabilities.graphicsBackends.includes(gl as GraphicsBackend))
    throw new SetcastError(
      `Renderer ${name} does not support --gl ${gl}.`,
      `Choose ${capabilities.graphicsBackends.join(', ')}.`,
    );
  const timeoutMs =
    parseNumber('timeout', values.timeout ?? '15', {
      min: 1,
      max: 60,
      hint: 'Use a timeout from 1 to 60 seconds.',
    }) * 1000;
  return {
    name,
    json: values.json,
    options: {
      gl: gl as GraphicsBackend,
      require: required as RendererFeature[],
      timeoutMs,
    },
  };
}

export async function run(argv: string[]) {
  const { name, json, options } = await argumentsFor(argv);
  const controller = new AbortController();
  const stop = () =>
    controller.abort(
      new SetcastError(
        'Renderer diagnostics interrupted.',
        'Rerun setcast doctor to finish the checks.',
        { exitCode: 1 },
      ),
    );
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    const report = await diagnoseRenderer(name, { ...options, signal: controller.signal });
    process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : format(report));
    return report.exitCode;
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}

function format(report: RendererDiagnosticReport) {
  const lines = [
    `${report.capabilities.renderer}: ${report.ready ? 'ready' : 'not ready'} for ${report.required.join(', ')} (small setup probes)`,
  ];
  for (const check of report.checks) {
    lines.push(`${check.status}: ${check.id}: ${check.message}`);
    if (check.hint) lines.push(`  ${check.hint}`);
    if (check.details)
      lines.push(
        `  ${Object.entries(check.details)
          .map(([key, value]) => `${key}: ${value}`)
          .join('; ')}`,
      );
  }
  lines.push(
    `Features: ${Object.entries(report.features)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ')}`,
    'Does not qualify project assets, sustained performance or physical devices.',
    '',
  );
  return lines.join('\n');
}
