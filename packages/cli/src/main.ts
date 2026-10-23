#!/usr/bin/env node
import { createRequire } from 'node:module';
import { accent, bold, dim, errorExitCode, formatHelp, printError, steel } from './ui.ts';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

type Command = { help: string; run: (argv: string[]) => Promise<void | number> };

const commands: Record<string, () => Promise<Command>> = {
  init: () => import('./commands/init.ts'),
  import: () => import('./commands/import.ts'),
  analyze: () => import('./commands/analyze.ts'),
  preview: () => import('./commands/preview.ts'),
  play: () => import('./commands/play.ts'),
  render: () => import('./commands/render.ts'),
  clip: () => import('./commands/clip.ts'),
  still: () => import('./commands/still.ts'),
  inspect: () => import('./commands/inspect.ts'),
  schema: () => import('./commands/schema.ts'),
  validate: () => import('./commands/validate.ts'),
  chapters: () => import('./commands/chapters.ts'),
  live: () => import('./commands/live.ts'),
  replay: () => import('./commands/replay.ts'),
  'browser-install': () => import('./commands/browser-install.ts'),
};

const usage = `${bold(accent('setcast'))} ${dim(`v${version}`)}  event-driven visuals for DJ sets

${bold('Usage')}  setcast <command> [options]

  ${steel('init')}      scaffold a project (interactive; --demo ships a working demo)
  ${steel('import')}    turn a tracklist file into plays: for setcast.yaml
  ${steel('analyze')}   read the audio and draft drop / breakdown annotations
  ${steel('preview')}   open the configured renderer preview
  ${steel('play')}      play a recorded project in the browser (prototype)
  ${steel('render')}    render the MP4 (--range for a slice, --bundle adds thumbnail + description)
  ${steel('clip')}      cut a promo clip around a drop (--all for every drop)
  ${steel('still')}     grab one frame as an image, for the thumbnail
  ${steel('inspect')}   inspect credits and boundary origins; --json exports the finite document
  ${steel('schema')}    print an authoring JSON Schema for editors and tools
  ${steel('validate')}  check project configuration, timeline and assets without rendering
  ${steel('chapters')}  print YouTube chapters + description
  ${steel('live')}      visualize a live audio input in the browser
  ${steel('replay')}    turn a session journal and recorded master into a project
  ${steel('browser-install')}  install Chromium for the experimental browser exporter

Run ${bold('setcast <command> --help')} for details.
`;

async function main(argv: string[]): Promise<number> {
  const [name, ...rest] = argv;
  if (!name || name === '--help' || name === '-h') {
    process.stdout.write(usage);
    return 0;
  }
  if (name === '--version' || name === '-v') {
    process.stdout.write(`${version}\n`);
    return 0;
  }
  const load = commands[name];
  if (!load) {
    process.stderr.write(`Unknown command "${name}".\n\n${usage}`);
    return 2;
  }
  const command = await load();
  if (rest.includes('--help') || rest.includes('-h')) {
    process.stdout.write(`${formatHelp(command.help)}\n`);
    return 0;
  }
  try {
    return (await command.run(rest)) ?? 0;
  } catch (error) {
    printError(error);
    return errorExitCode(error);
  }
}

process.exitCode = await main(process.argv.slice(2));
