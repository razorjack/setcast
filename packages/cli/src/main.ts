import { createRequire } from 'node:module';
import { accent, bold, dim, printError, steel } from './ui.ts';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

type Command = { help: string; run: (argv: string[]) => Promise<void> };

const commands: Record<string, () => Promise<Command>> = {
  init: () => import('./commands/init.ts'),
  import: () => import('./commands/import.ts'),
  analyze: () => import('./commands/analyze.ts'),
  preview: () => import('./commands/preview.ts'),
  render: () => import('./commands/render.ts'),
  chapters: () => import('./commands/chapters.ts'),
  live: () => import('./commands/stubs.ts').then((m) => ({ help: m.liveHelp, run: m.live })),
};

const usage = `${bold(accent('setcast'))} ${dim(`v${version}`)}  event-driven visuals for DJ sets

${bold('Usage')}  setcast <command> [options]

  ${steel('init')}      scaffold a project (interactive; --demo ships a working demo)
  ${steel('import')}    turn a tracklist file into tracks: for setcast.yaml
  ${steel('analyze')}   read the audio and draft drop / breakdown events
  ${steel('preview')}   open the project in Remotion Studio
  ${steel('render')}    render the MP4 (--range MM:SS-MM:SS for a slice)
  ${steel('chapters')}  print YouTube chapters + description
  ${steel('live')}      (planned) live overlay mode

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
    process.stdout.write(`${command.help}\n`);
    return 0;
  }
  try {
    await command.run(rest);
    return 0;
  } catch (error) {
    printError(error);
    return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
