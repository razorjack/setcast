import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  beatOffset,
  clamp,
  detectSections,
  envelope,
  estimateBpm,
  formatTime,
  formatTimecode,
  SetcastError,
  ProjectConfigSchema,
  compileMix,
  summarizeEnvelope,
  type Envelope,
  type Pcm,
  type DraftAnnotation,
} from '@setcast/core';
import { CONFIG_FILE, decodeMono, type LoadedProject } from '@setcast/core/node';
import { isSeq, parseDocument, stringify, type Document } from 'yaml';
import { load } from '../project.ts';
import { parseCommandArgs } from '../args.ts';
import {
  accent,
  bold,
  clearSpinnerOnError,
  dim,
  formatDuration,
  highlightYaml,
  intro,
  log,
  outro,
  shown,
  spinner,
  steel,
} from '../ui.ts';

export const help = `setcast analyze [dir] [--sensitivity 0.5] [--write]

Reads the project audio and drafts drop and breakdown annotations from its bass energy, plus the tempo.
Drafts retain detected times; review them before accepting with --write.
  --sensitivity  0..1; higher splits the set into more sections (default 0.5)
  --write        add the drafted annotations, the tempo and its beatOffset to ${CONFIG_FILE}, keeping
                 what is there

Buildups follow musical intent rather than energy, so those stay yours to place.`;

/** A drafted event this close to one already in the project is the same event. */
const SAME_EVENT_SECONDS = 2;

/** Bar heights of the energy overview, quietest first. */
const LEVELS = '▁▂▃▄▅▆▇█';

interface AnalyzeOptions {
  dir: string;
  sensitivity: number;
  write: boolean;
}

interface AnalysisDraft {
  annotations: DraftAnnotation[];
  bpm: number | null;
  offset: number | null;
  seconds: number;
  energy: Envelope;
}

interface AnalysisChanges {
  annotations: DraftAnnotation[];
  tempo: number | null;
  offset: number | null;
}

export async function run(argv: string[]): Promise<void> {
  const options = parseOptions(argv);

  intro('analyze');
  const loaded = await load(options.dir);
  const analysis = await analyzeProject(loaded, options.sensitivity);

  showAnalysis(analysis);
  if (analysis.annotations.length === 0 && !analysis.bpm) {
    outro('Nothing stood out. Raise --sensitivity, or write the annotations by hand.');
    return;
  }

  const changes = changesFor(loaded, analysis);
  if (!options.write) {
    printDraft(analysis.annotations, changes);
    return;
  }

  if (changes.annotations.length === 0 && !changes.tempo) {
    outro(`${CONFIG_FILE} already has all of these.`);
    return;
  }

  const path = await updateProject(loaded, changes);
  showWrittenChanges(path, changes);
}

function parseOptions(argv: string[]): AnalyzeOptions {
  const { values, positionals } = parseCommandArgs(
    argv,
    { write: { type: 'boolean' }, sensitivity: { type: 'string' } },
    help,
  );
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
    return draftFrom(pcm, sensitivity);
  });

  spin.stop(audioSummary(analysis));
  return analysis;
}

/** Sections and tempo estimated from master audio, without modifying detected times. */
function draftFrom(pcm: Pcm, sensitivity: number): AnalysisDraft {
  const energy = envelope(pcm);
  const bpm = estimateBpm(energy);
  const drafted = detectSections(energy, { sensitivity });

  return {
    annotations: drafted,
    bpm,
    offset: bpm ? beatOffset(energy, bpm) : null,
    seconds: pcm.samples.length / pcm.sampleRate,
    energy,
  };
}

const audioSummary = ({ seconds, bpm }: AnalysisDraft) => {
  const tempo = bpm ? `, ${bold(`${Math.round(bpm)} BPM`)}` : ', no steady tempo';
  return `${formatDuration(seconds)} of audio${tempo}`;
};

function showAnalysis({ energy, annotations }: AnalysisDraft): void {
  const lines = overviewLines(energy, annotations);
  if (annotations.length > 0) {
    // Padded names line the intensities up; trimmed because an uncoloured terminal shows the padding.
    lines.push('', ...annotations.map((event) => eventLine(event).trimEnd()));
  }
  log.message(lines);
}

/**
 * The set's bass energy as one row of bars, lit where a drafted drop has the bass in, and the
 * drafted annotations marked under it: what the drafts were read from, to judge --sensitivity by.
 */
function overviewLines(energy: Envelope, annotations: DraftAnnotation[]): string[] {
  const { step, bass } = summarizeEnvelope(energy, overviewColumns());
  const bars = bass.map((level, column) => {
    const bar = LEVELS[Math.round(level * (LEVELS.length - 1))]!;
    return bassIsIn(annotations, (column + 1) * step) ? accent(bar) : dim(bar);
  });
  if (annotations.length === 0) return [bars.join('')];

  const markers = Array<string>(bass.length).fill(' ');
  for (const event of annotations) {
    const column = Math.min(bass.length - 1, Math.floor(event.at / step));
    markers[column] = event.kind === 'drop' ? accent('▲') : steel('▼');
  }
  return [bars.join(''), markers.join('').trimEnd()];
}

/** As wide as the terminal allows beside the rail, and no wider than reads at a glance. */
const overviewColumns = () => clamp((process.stdout.columns ?? 80) - 4, 16, 120);

/** Whether the drafts have the bass in at `time`. Before the first, the set is the opposite of it. */
function bassIsIn(annotations: DraftAnnotation[], time: number): boolean {
  const latest = annotations.findLast((event) => event.at <= time);
  if (latest) return latest.kind === 'drop';
  return annotations[0]?.kind === 'breakdown';
}

const eventLine = (event: DraftAnnotation): string => {
  const time = dim(formatTime(event.at).padStart(7));
  const name = event.kind.padEnd(9);
  if (event.kind !== 'drop') return `${time}  ${steel(name)}`;
  return `${time}  ${accent(name)} ${dim(`intensity ${event.intensity.toFixed(2)}`)}`;
};

function changesFor(loaded: LoadedProject, analysis: AnalysisDraft): AnalysisChanges {
  const stated = loaded.config.annotations;
  const isNew = (drafted: DraftAnnotation) =>
    !stated.some(
      (event) =>
        event.scope === 'mix' &&
        event.kind === drafted.kind &&
        Math.abs(event.at / 1_000_000 - drafted.at) < SAME_EVENT_SECONDS,
    );

  return {
    annotations: analysis.annotations.filter(isNew),
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
function printDraft(annotations: DraftAnnotation[], changes: AnalysisChanges): void {
  const draft: Record<string, unknown> = {};
  if (changes.tempo) {
    draft.bpm = changes.tempo;
    draft.beatOffset = changes.offset;
  }
  draft.annotations = annotations.map(toYaml);

  process.stdout.write(`\n${highlightYaml(stringify(draft))}`);
  outro(`Add the block above to ${CONFIG_FILE}, or re-run with --write.`);
}

async function updateProject(loaded: LoadedProject, changes: AnalysisChanges): Promise<string> {
  const path = join(loaded.dir, CONFIG_FILE);
  const doc = parseDocument(await readFile(path, 'utf8'));

  if (changes.tempo) {
    doc.set('bpm', changes.tempo);
    doc.set('beatOffset', changes.offset);
  }
  appendAnnotations(doc, changes.annotations);
  compileMix(ProjectConfigSchema.parse(doc.toJS()), loaded.project.mix.duration / 1_000_000);

  // padding off so rewriting one block does not reformat `[1, 1.06]` elsewhere in the file
  await writeFile(path, doc.toString({ flowCollectionPadding: false }));
  return path;
}

/** Adds to the `annotations:` the user already wrote, so nothing of theirs is rewritten. */
function appendAnnotations(doc: Document, annotations: DraftAnnotation[]): void {
  const existing = doc.get('annotations');
  if (isSeq(existing)) {
    existing.flow = false;
    for (const event of annotations) existing.add(doc.createNode(toYaml(event)));
    return;
  }
  if (annotations.length) doc.set('annotations', annotations.map(toYaml));
}

function showWrittenChanges(path: string, changes: AnalysisChanges): void {
  const added: string[] = [];
  if (changes.annotations.length) added.push(`${changes.annotations.length} annotations`);
  if (changes.tempo) added.push(`bpm: ${changes.tempo} with beatOffset`);
  outro(`Added ${added.join(' and ')} to ${shown(path)}`);
}

function toYaml(event: DraftAnnotation): Record<string, string | number> {
  const yamlEvent: Record<string, string | number> = {
    kind: event.kind,
    at: formatTimecode(event.at),
  };
  if (event.kind === 'drop') yamlEvent.intensity = event.intensity;
  return yamlEvent;
}
