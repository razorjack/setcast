import { parseArgs } from 'node:util';
import { preview } from '@setcast/renderer-remotion';
import { load } from '../project.ts';
import { dim, intro, log } from '../ui.ts';

export const help = `setcast preview [dir] [--port N]

Opens the project in Remotion Studio: scrub the timeline, tweak, then render.`;

export async function run(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { port: { type: 'string' } },
  });
  intro('preview');
  const { dir, project } = await load(positionals[0]);
  log.info(`Opening Remotion Studio for ${project.title || dir} ${dim('(Ctrl+C to stop)')}`);
  await preview(project, { projectDir: dir, ...(values.port && { port: Number(values.port) }) });
}
