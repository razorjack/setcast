import { parseRendererFlag, preview, type PreviewOptions, type Renderer } from '../renderer.ts';
import { parseCommandArgs, parseNumber } from '../args.ts';
import { load, withHardwareEncoding, withWholeSet } from '../project.ts';
import { watchInputs } from '../watch.ts';
import { browserPreview } from '../browser-preview.ts';
import { dim, intro, log, printError } from '../ui.ts';

export const help = `setcast preview [dir] [--port N] [--theme name] [--renderer remotion|browser]

Preview with the configured renderer (default: Remotion Studio).
  --renderer  remotion or browser; overrides setcast.yaml
  --port   localhost port (browser default 3210)
  --theme  a built-in theme or a .css file to use instead of setcast.yaml's theme:`;

interface PreviewCommandOptions {
  dir: string | undefined;
  port: number | undefined;
  theme: string | undefined;
  renderer: Renderer | undefined;
}

export async function run(argv: string[]): Promise<void> {
  const options = parseOptions(argv);

  intro('preview');
  const dependencies = new Set<string>();
  const initial = await load(options.dir, options.theme, dependencies);
  if (options.renderer ?? initial.config.renderer === 'browser') {
    await browserPreview(initial, dependencies, options);
    return;
  }
  const loaded = await withHardwareEncoding(initial);
  const { dir } = loaded;
  const project = await withWholeSet(loaded);
  log.info(`Opening Remotion Studio for ${project.title || dir} ${dim('(Ctrl+C to stop)')}`);

  const { gl, crf, hardwareAcceleration, videoBitrate, jpegQuality, x264Preset } =
    loaded.config.output;
  const studio: PreviewOptions = {
    projectDir: dir,
    watch: (update) =>
      watchInputs(
        dependencies,
        async (files) => {
          const next = await load(dir, options.theme, files);
          await update(await withWholeSet(next));
        },
        printError,
      ),
    gl,
    crf,
    x264Preset,
    parallelEncoding: loaded.config.output.parallelEncoding,
    hardwareAcceleration,
    videoBitrate,
    jpegQuality,
  };
  if (options.port !== undefined) studio.port = options.port;
  await preview(project, studio);
}

function parseOptions(argv: string[]): PreviewCommandOptions {
  const { values, positionals } = parseCommandArgs(
    argv,
    { port: { type: 'string' }, theme: { type: 'string' }, renderer: { type: 'string' } },
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
  return {
    dir: positionals[0],
    port,
    theme: values.theme,
    renderer: parseRendererFlag(values.renderer),
  };
}
