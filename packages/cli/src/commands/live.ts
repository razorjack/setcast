import { loadLiveProject } from '@setcast/core/node';
import { play, type ThemeCatalog } from '@setcast/renderer-browser';
import { themes } from '@setcast/themes';
import { parseCommandArgs, parseNumber } from '../args.ts';
import { intro, log } from '../ui.ts';

export const help = `setcast live [dir] [--port N] [--theme name]

Visualize a live audio input in a local browser.
  --port   localhost port (default 3210)
  --theme  a built-in theme or .css file instead of live.yaml's theme

Reads optional live.yaml in dir (default: current directory). No audio file, tracklist or
known duration is needed. Choose your interface and its exposed left/right channels in
the browser, then start input. Capture is silent; send mixer audio to OBS separately.
H toggles clean output; F toggles fullscreen. Move the window to a projector or capture
it in OBS. The browser may expose fewer channels than the interface has physical inputs.
Ctrl+C stops the server. Hardware events, recording and direct streaming are not included.`;

export async function run(argv: string[]): Promise<void> {
  const { values, positionals } = parseCommandArgs(
    argv,
    { port: { type: 'string' }, theme: { type: 'string' } },
    help,
  );
  const port =
    values.port === undefined
      ? 3210
      : parseNumber('port', values.port, {
          min: 1,
          max: 65535,
          integer: true,
          hint: 'Use a whole number between 1 and 65535.',
        });
  intro('live');
  const loaded = await loadLiveProject(positionals[0] ?? '.', { themes, theme: values.theme });
  loaded.warnings.forEach((warning) => log.warn(warning));
  const catalog: ThemeCatalog = {
    choices: Object.values(themes).map(({ name, description }) => ({ name, description })),
    load: async (theme) => {
      const next = await loadLiveProject(loaded.dir, { themes, theme });
      return next.project;
    },
  };
  const server = await play(loaded.project, { projectDir: loaded.dir, port, themes: catalog });
  log.info(`Open ${server.url} in current Chrome, then choose and start your audio input.`);
  try {
    await untilStopped();
  } finally {
    await server.close();
  }
}

function untilStopped(): Promise<void> {
  return new Promise((resolve) => {
    const stop = () => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      resolve();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
}
