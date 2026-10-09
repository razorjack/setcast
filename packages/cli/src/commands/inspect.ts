import { Timeline, formatTimecode } from '@setcast/core';
import { parseAt, parseCommandArgs, timeWithinAudio } from '../args.ts';
import { load } from '../project.ts';

export const help = `setcast inspect [dir] [--at MM:SS] [--json]

Inspect the finite mix timeline and the origin of each contribution boundary.
  --at    also inspect contributors, focus, sections and upcoming entries at this time
  --json  export the normalized document with materialized IDs (or a query with --at).
          Document times are integer microseconds, not authoring YAML seconds.`;

export async function run(argv: string[]): Promise<void> {
  const { values, positionals } = parseCommandArgs(
    argv,
    { at: { type: 'string' }, json: { type: 'boolean' } },
    help,
  );
  const { project } = await load(positionals[0]);
  const mix = project.mix;
  const at =
    values.at === undefined
      ? undefined
      : timeWithinAudio(parseAt(values.at), mix.duration / 1_000_000, '--at');
  const state = at === undefined ? undefined : new Timeline(mix).at(at);
  if (values.json) {
    process.stdout.write(`${JSON.stringify(state ?? mix, null, 2)}\n`);
    return;
  }
  console.log(
    `${mix.recordings.length} recordings · ${mix.plays.length} plays · ${mix.listings.length} listings · ${project.presentation} presentation`,
  );
  for (const interval of mix.contributions) {
    const from = formatTimecode(interval.from / 1_000_000);
    const until = formatTimecode(interval.until / 1_000_000);
    console.log(
      `${interval.play} [${from}, ${until}) ${interval.origins.from.kind} (${interval.origins.from.path}) → ${interval.origins.until.kind} (${interval.origins.until.path})`,
    );
  }
  if (state) {
    console.log(`At ${formatTimecode(at!)}: ${state.currentPlayCount} current plays`);
    console.log(`Focus: ${state.focusPlays.map((entry) => entry.play.id).join(', ') || '(none)'}`);
    console.log(JSON.stringify(state, null, 2));
  }
}
