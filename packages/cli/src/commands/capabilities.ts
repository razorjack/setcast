import { SetcastError, type RendererCapabilities } from '@setcast/core';
import { parseCommandArgs } from '../args.ts';
import { rendererCapabilities, parseRendererFlag } from '../renderer.ts';

export const help = `setcast capabilities [--renderer remotion|browser] [--json]

Describe the selected Setcast renderer without launching a browser or checking this machine.
Defaults to Remotion. Does not read a project. Use setcast doctor to check runtime readiness.
  --json  print the versioned capability descriptor`;

export async function run(argv: string[]) {
  const { values, positionals } = parseCommandArgs(
    argv,
    { renderer: { type: 'string' }, json: { type: 'boolean' } },
    help,
  );
  if (positionals.length) throw new SetcastError('capabilities takes no project directory.', help);
  const report = await rendererCapabilities(parseRendererFlag(values.renderer) ?? 'remotion');
  process.stdout.write(values.json ? `${JSON.stringify(report, null, 2)}\n` : format(report));
}

function format(report: RendererCapabilities) {
  const { concurrency, runtime } = report;
  return [
    `${report.renderer}: declared Setcast capabilities (not a machine check)`,
    `Features: ${report.features.join(', ')}`,
    `Stills: ${report.stillFormats.join(', ')}`,
    `Video: ${videoDescription(report)}`,
    `Graphics: ${report.graphicsBackends.join(', ')}`,
    `Parallel encoding: ${report.parallelEncoding.join(', ')}`,
    `Concurrency: ${concurrency.min}–${concurrency.max ?? 'runtime limit'}; default ${concurrency.default}`,
    `Runtime: ${runtime.browser}; ${runtime.ffmpeg} FFmpeg`,
    '',
  ].join('\n');
}

function videoDescription(report: RendererCapabilities) {
  const formats = report.videoFormats ?? [
    {
      codec: report.videoCodec,
      audioCodec: report.audioCodec,
      containers: report.videoContainers,
      alpha: false,
    },
  ];
  return formats
    .map((format) => {
      const alpha = format.alpha ? ' (alpha)' : '';
      return `${format.codec} + ${format.audioCodec}; ${format.containers.join(', ')}${alpha}`;
    })
    .join(' / ');
}
