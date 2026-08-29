import { parseArgs } from 'node:util';
import { preview, type PreviewOptions } from '@setcast/renderer-remotion';
import { parseNumber } from '../args.ts';
import { load } from '../project.ts';
import { dim, intro, log } from '../ui.ts';

export const help = `setcast preview [dir] [--port N]

Opens the project in Remotion Studio: scrub the timeline, tweak, then render.`;

interface PreviewCommandOptions {
  dir: string | undefined;
  port: number | undefined;
}

export async function run(argv: string[]): Promise<void> {
  const options = parseOptions(argv);

  intro('preview');
  const { dir, project } = await load(options.dir);
  log.info(`Opening Remotion Studio for ${project.title || dir} ${dim('(Ctrl+C to stop)')}`);

  const studio: PreviewOptions = { projectDir: dir };
  if (options.port !== undefined) studio.port = options.port;
  await preview(project, studio);
}

function parseOptions(argv: string[]): PreviewCommandOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { port: { type: 'string' } },
  });
  if (values.port === undefined) return { dir: positionals[0], port: undefined };

  return {
    dir: positionals[0],
    port: parseNumber('port', values.port, {
      min: 1,
      max: 65535,
      integer: true,
      hint: 'Use a whole number between 1 and 65535.',
    }),
  };
}
