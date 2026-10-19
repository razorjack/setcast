import { play } from '@setcast/renderer-browser';
import { parseCommandArgs, parseNumber } from '../args.ts';
import { load, withWholeSet } from '../project.ts';
import { intro, log } from '../ui.ts';

export const help = `setcast play [dir] [--port N] [--theme name]

Play a recorded project in a local browser (prototype).
  --port   localhost port (default 3210)
  --theme  a built-in theme or .css file instead of setcast.yaml's theme:

Open the printed URL in current Chrome. Space plays/pauses; Escape restores hidden controls.
Seeking and missing assets may pause playback while they are prepared. Ctrl+C stops the server.
This is recorded-project playback; live audio input and broadcasting are not implemented.`;

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
  intro('play');
  const loaded = await load(positionals[0], values.theme);
  const project = await withWholeSet(loaded);
  log.info('Preparing the browser player');
  const server = await play(project, { projectDir: loaded.dir, port });
  log.info(`Open ${server.url} in your browser (Ctrl+C to stop)`);
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
