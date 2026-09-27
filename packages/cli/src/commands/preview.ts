import { preview, probeAudio, type PreviewOptions } from '@setcast/renderer-remotion';
import { parseCommandArgs, parseNumber } from '../args.ts';
import { load, warnEventsAfterAudio, withSetEnvelope } from '../project.ts';
import { dim, intro, log } from '../ui.ts';

export const help = `setcast preview [dir] [--port N] [--theme name]

Opens the project in Remotion Studio: scrub the timeline, tweak, then render.
  --port   the port Remotion Studio listens on
  --theme  a built-in theme or a .css file to use instead of setcast.yaml's theme:`;

interface PreviewCommandOptions {
  dir: string | undefined;
  port: number | undefined;
  theme: string | undefined;
}

export async function run(argv: string[]): Promise<void> {
  const options = parseOptions(argv);

  intro('preview');
  const loaded = await load(options.dir, options.theme);
  const { dir } = loaded;
  const duration = await probeAudio(loaded.project, dir);
  warnEventsAfterAudio(loaded.project.events, duration);
  const project = await withSetEnvelope(loaded);
  log.info(`Opening Remotion Studio for ${project.title || dir} ${dim('(Ctrl+C to stop)')}`);

  const studio: PreviewOptions = { projectDir: dir };
  if (options.port !== undefined) studio.port = options.port;
  await preview(project, studio);
}

function parseOptions(argv: string[]): PreviewCommandOptions {
  const { values, positionals } = parseCommandArgs(
    argv,
    { port: { type: 'string' }, theme: { type: 'string' } },
    help,
  );
  const port =
    values.port === undefined
      ? undefined
      : parseNumber('port', values.port, {
          min: 1,
          max: 65535,
          integer: true,
          hint: 'Use a whole number between 1 and 65535.',
        });
  return { dir: positionals[0], port, theme: values.theme };
}
