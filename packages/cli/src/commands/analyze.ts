import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  beatOffset,
  detectSections,
  envelope,
  estimateBpm,
  formatTime,
  formatTimecode,
  SetcastError,
  snapToBeats,
  type SetEvent,
} from '@setcast/core';
import { CONFIG_FILE, decodeMono, type LoadedProject } from '@setcast/core/node';
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
Drafted events snap to the beat grid when the project has a bpm or one was found.
  --sensitivity  0..1; higher splits the set into more sections (default 0.5)
  --write        add the drafted events, the tempo and its beatOffset to ${CONFIG_FILE}, keeping
                 what is there

Buildups follow musical intent rather than energy, so those stay yours to place.`;

/** A drafted event this close to one already in the project is the same event. */
const SAME_EVENT_SECONDS = 2;

interface AnalyzeOptions {
  dir: string;
  sensitivity: number;
  write: boolean;
}

interface AnalysisDraft {
  events: SetEvent[];
  bpm: number | null;
  offset: number | null;
  seconds: number;
}

interface AnalysisChanges {
  events: SetEvent[];
  tempo: number | null;
  offset: number | null;
}

export async function run(argv: string[]): Promise<void> {
  const options = parseOptions(argv);

  intro('analyze');
  const loaded = await load(options.dir);
  const analysis = await analyzeProject(loaded, options.sensitivity);

  showAnalysis(analysis);
  if (analysis.events.length === 0 && !analysis.bpm) {
    outro('Nothing stood out. Raise --sensitivity, or write the events by hand.');
    return;
  }

  const changes = changesFor(loaded, analysis);
  if (!options.write) {
    printDraft(analysis.events, changes);
    return;
  }

  if (changes.events.length === 0 && !changes.tempo) {
    outro(`${CONFIG_FILE} already has all of these.`);
    return;
  }

  const path = await updateProject(loaded.dir, changes);
  showWrittenChanges(path, changes);
}

function parseOptions(argv: string[]): AnalyzeOptions {
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
  return { dir: positionals[0] ?? '.', sensitivity, write: values.write ?? false };
}

async function analyzeProject(loaded: LoadedProject, sensitivity: number): Promise<AnalysisDraft> {
  const spin = spinner();
  spin.start(`Reading ${loaded.project.audio}`);

  const analysis = await clearSpinnerOnError(spin, async () => {
    const pcm = await decodeMono(join(loaded.dir, loaded.project.audio));
    spin.message('Analyzing');
    const shape = envelope(pcm);
    const bpm = estimateBpm(shape);
    const grid = loaded.config.bpm ?? bpm;
    const drafted = detectSections(shape, { sensitivity });
    return {
      events: grid ? snapToBeats(drafted, shape, grid) : drafted,
      bpm,
      offset: bpm ? beatOffset(shape, bpm) : null,
      seconds: pcm.samples.length / pcm.sampleRate,
    };
  });

  spin.stop(
    `${fmtSeconds(analysis.seconds)} of audio${analysis.bpm ? `, ${bold(`${Math.round(analysis.bpm)} BPM`)}` : ', no steady tempo'}`,
  );
  return analysis;
}

function showAnalysis(analysis: AnalysisDraft): void {
  for (const event of analysis.events) {
    const kind = event.type === 'drop' ? accent(event.type.padEnd(9)) : steel(event.type.padEnd(9));
    const detail = event.type === 'drop' ? dim(`intensity ${event.intensity.toFixed(2)}`) : '';
    log.message(`${dim(formatTime(event.time).padStart(7))}  ${kind} ${detail}`.trimEnd());
  }
}

function changesFor(loaded: LoadedProject, analysis: AnalysisDraft): AnalysisChanges {
  const events = analysis.events.filter(
    (event) =>
      !loaded.config.events.some(
        (existing) =>
          existing.type === event.type && Math.abs(existing.time - event.time) < SAME_EVENT_SECONDS,
      ),
  );
  const tempo =
    analysis.bpm && loaded.config.bpm === undefined ? Math.round(analysis.bpm * 10) / 10 : null;
  return { events, tempo, offset: analysis.offset };
}

function printDraft(events: SetEvent[], changes: AnalysisChanges): void {
  const draft: Record<string, unknown> = {};
  if (changes.tempo) {
    draft.bpm = changes.tempo;
    draft.beatOffset = changes.offset;
  }
  draft.events = events.map(toYaml);

  process.stdout.write(`\n${stringify(draft)}`);
  outro(`Add the block above to ${CONFIG_FILE}, or re-run with --write.`);
}

async function updateProject(root: string, changes: AnalysisChanges): Promise<string> {
  const path = join(root, CONFIG_FILE);
  const doc = parseDocument(await readFile(path, 'utf8'));
  if (changes.tempo) {
    doc.set('bpm', changes.tempo);
    doc.set('beatOffset', changes.offset);
  }

  const existing = doc.get('events');
  if (isSeq(existing)) {
    existing.flow = false;
    for (const event of changes.events) existing.add(doc.createNode(toYaml(event)));
  } else if (changes.events.length) {
    doc.set('events', changes.events.map(toYaml));
  }

  // padding off so rewriting one block does not reformat `[1, 1.06]` elsewhere in the file
  await writeFile(path, doc.toString({ flowCollectionPadding: false }));
  return path;
}

function showWrittenChanges(path: string, changes: AnalysisChanges): void {
  const added = [
    changes.events.length ? `${changes.events.length} events` : '',
    changes.tempo ? `bpm: ${changes.tempo} with beatOffset` : '',
  ];
  outro(`Added ${added.filter(Boolean).join(' and ')} to ${steel(path)}`);
}

function toYaml(event: SetEvent): Record<string, string | number> {
  const yamlEvent: Record<string, string | number> = {
    type: event.type,
    time: formatTimecode(event.time),
  };
  if (event.type === 'drop') yamlEvent.intensity = event.intensity;
  return yamlEvent;
}
