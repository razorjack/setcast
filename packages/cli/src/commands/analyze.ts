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
  type Pcm,
  type SetEvent,
} from '@setcast/core';
import { CONFIG_FILE, decodeMono, type LoadedProject } from '@setcast/core/node';
import { isSeq, parseDocument, stringify, type Document } from 'yaml';
import { load } from '../project.ts';
import {
  accent,
  bold,
  clearSpinnerOnError,
  dim,
  formatDuration,
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
    return draftFrom(pcm, loaded.config.bpm, sensitivity);
  });

  spin.stop(audioSummary(analysis));
  return analysis;
}

/** Sections and tempo read off the audio. Drafted events land on whichever beat grid the set has. */
function draftFrom(pcm: Pcm, statedBpm: number | undefined, sensitivity: number): AnalysisDraft {
  const energy = envelope(pcm);
  const bpm = estimateBpm(energy);
  const grid = statedBpm ?? bpm;
  const drafted = detectSections(energy, { sensitivity });

  return {
    events: grid ? snapToBeats(drafted, energy, grid) : drafted,
    bpm,
    offset: bpm ? beatOffset(energy, bpm) : null,
    seconds: pcm.samples.length / pcm.sampleRate,
  };
}

const audioSummary = ({ seconds, bpm }: AnalysisDraft) => {
  const tempo = bpm ? `, ${bold(`${Math.round(bpm)} BPM`)}` : ', no steady tempo';
  return `${formatDuration(seconds)} of audio${tempo}`;
};

function showAnalysis(analysis: AnalysisDraft): void {
  // Padded names line the intensities up; trimmed because an uncoloured terminal shows the padding.
  for (const event of analysis.events) log.message(eventLine(event).trimEnd());
}

const eventLine = (event: SetEvent): string => {
  const time = dim(formatTime(event.time).padStart(7));
  const name = event.type.padEnd(9);
  if (event.type !== 'drop') return `${time}  ${steel(name)}`;
  return `${time}  ${accent(name)} ${dim(`intensity ${event.intensity.toFixed(2)}`)}`;
};

function changesFor(loaded: LoadedProject, analysis: AnalysisDraft): AnalysisChanges {
  const stated = loaded.config.events;
  const isNew = (drafted: SetEvent) =>
    !stated.some(
      (event) =>
        event.type === drafted.type && Math.abs(event.time - drafted.time) < SAME_EVENT_SECONDS,
    );

  return {
    events: analysis.events.filter(isNew),
    tempo: newTempo(loaded.config.bpm, analysis.bpm),
    offset: analysis.offset,
  };
}

/** A project that already states a tempo keeps it; analysis only fills in an empty `bpm:`. */
const newTempo = (stated: number | undefined, detected: number | null): number | null => {
  if (stated !== undefined || !detected) return null;
  return Math.round(detected * 10) / 10;
};

/** The dry run prints every drafted event, not just the ones `setcast.yaml` is missing. */
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
  appendEvents(doc, changes.events);

  // padding off so rewriting one block does not reformat `[1, 1.06]` elsewhere in the file
  await writeFile(path, doc.toString({ flowCollectionPadding: false }));
  return path;
}

/** Adds to the `events:` the user already wrote, so nothing of theirs is rewritten. */
function appendEvents(doc: Document, events: SetEvent[]): void {
  const existing = doc.get('events');
  if (isSeq(existing)) {
    existing.flow = false;
    for (const event of events) existing.add(doc.createNode(toYaml(event)));
    return;
  }
  if (events.length) doc.set('events', events.map(toYaml));
}

function showWrittenChanges(path: string, changes: AnalysisChanges): void {
  const added: string[] = [];
  if (changes.events.length) added.push(`${changes.events.length} events`);
  if (changes.tempo) added.push(`bpm: ${changes.tempo} with beatOffset`);
  outro(`Added ${added.join(' and ')} to ${steel(path)}`);
}

function toYaml(event: SetEvent): Record<string, string | number> {
  const yamlEvent: Record<string, string | number> = {
    type: event.type,
    time: formatTimecode(event.time),
  };
  if (event.type === 'drop') yamlEvent.intensity = event.intensity;
  return yamlEvent;
}
