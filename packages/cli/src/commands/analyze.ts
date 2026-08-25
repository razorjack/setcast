import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  detectSections,
  envelope,
  estimateBpm,
  formatTime,
  formatTimecode,
  SetcastError,
  type SetEvent,
} from '@setcast/core';
import { CONFIG_FILE, decodeMono } from '@setcast/core/node';
import { isSeq, parseDocument, stringify } from 'yaml';
import { load } from '../project.ts';
import {
  accent,
  bold,
  clearSpinnerOnError,
  dim,
  fmtSeconds,
  intro,
  log,
  outro,
  spinner,
  steel,
} from '../ui.ts';

export const help = `setcast analyze [dir] [--sensitivity 0.5] [--write]

Reads the project audio and drafts drop and breakdown events from its bass energy, plus the tempo.
  --sensitivity  0..1; higher splits the set into more sections (default 0.5)
  --write        add the drafted events to ${CONFIG_FILE}, keeping the ones already there

Buildups follow musical intent rather than energy, so those stay yours to place.`;

/** A drafted event this close to one already in the project is the same event. */
const SAME_EVENT_SECONDS = 2;

export async function run(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { write: { type: 'boolean' }, sensitivity: { type: 'string' } },
  });
  const sensitivity = values.sensitivity === undefined ? 0.5 : Number(values.sensitivity);
  if (!(sensitivity >= 0 && sensitivity <= 1)) {
    throw new SetcastError(
      `--sensitivity must be a number from 0 to 1, got "${values.sensitivity}"`,
      'Higher splits the set into more sections. The default is 0.5.',
    );
  }
  const [dir = '.'] = positionals;

  intro('analyze');
  const { dir: root, config, project } = await load(dir);
  const spin = spinner();
  spin.start(`Reading ${project.audio}`);
  const { events, bpm, seconds } = await clearSpinnerOnError(spin, async () => {
    const pcm = await decodeMono(join(root, project.audio));
    spin.message('Analyzing');
    const shape = envelope(pcm);
    return {
      events: detectSections(shape, { sensitivity }),
      bpm: estimateBpm(shape),
      seconds: pcm.samples.length / pcm.sampleRate,
    };
  });
  spin.stop(
    `${fmtSeconds(seconds)} of audio${bpm ? `, ${bold(`${Math.round(bpm)} BPM`)}` : ', no steady tempo'}`,
  );

  if (events.length === 0) {
    outro('Nothing stood out. Raise --sensitivity, or write the events by hand.');
    return;
  }
  for (const e of events) {
    const kind = e.type === 'drop' ? accent(e.type.padEnd(9)) : steel(e.type.padEnd(9));
    const detail = e.type === 'drop' ? dim(`intensity ${e.intensity.toFixed(2)}`) : '';
    log.message(`${dim(formatTime(e.time).padStart(7))}  ${kind} ${detail}`.trimEnd());
  }

  const fresh = events.filter(
    (e) =>
      !config.events.some(
        (had) => had.type === e.type && Math.abs(had.time - e.time) < SAME_EVENT_SECONDS,
      ),
  );
  if (!values.write) {
    process.stdout.write(`\n${stringify({ events: events.map(toYaml) })}`);
    outro(`Add the block above to ${CONFIG_FILE}, or re-run with --write.`);
    return;
  }
  if (fresh.length === 0) {
    outro(`${CONFIG_FILE} already has all of these.`);
    return;
  }
  const path = join(root, CONFIG_FILE);
  const doc = parseDocument(await readFile(path, 'utf8'));
  const existing = doc.get('events');
  if (isSeq(existing)) for (const e of fresh) existing.add(doc.createNode(toYaml(e)));
  else doc.set('events', fresh.map(toYaml));
  // padding off so rewriting one block does not reformat `[1, 1.06]` elsewhere in the file
  await writeFile(path, doc.toString({ flowCollectionPadding: false }));
  outro(`Added ${fresh.length} events to ${steel(path)}`);
}

const toYaml = (e: SetEvent) => ({
  type: e.type,
  time: formatTimecode(e.time),
  ...(e.type === 'drop' && { intensity: e.intensity }),
});
