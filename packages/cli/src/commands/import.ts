import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  toSeconds,
  formatTime,
  formatTimecode,
  importers,
  SetcastError,
  type Importer,
  ProjectConfigSchema,
  compileMix,
  type ImportedPlay,
} from '@setcast/core';
import { CONFIG_FILE } from '@setcast/core/node';
import { parseDocument, stringify } from 'yaml';
import { load } from '../project.ts';
import { parseCommandArgs } from '../args.ts';
import { bold, dim, highlightYaml, intro, log, outro, formatPath, steel } from '../ui.ts';

export const help = `setcast import <tracklist.txt> [--format plain] [--write] [dir]

Parses a tracklist into Setcast tracks and prints them as YAML.
  --write   replace the plays: section of setcast.yaml in <dir> (default: current directory)
  --format  importer to use (default: auto-detect). Available: ${importers.names().join(', ')}`;

interface ImportOptions {
  file: string;
  dir: string;
  format: string | undefined;
  write: boolean;
}

export async function run(argv: string[]): Promise<void> {
  const options = parseOptions(argv);

  intro('import');
  const text = await readTracklist(options.file);
  const importer = selectImporter(text, options);
  const tracks = importer.parse(text);
  requireTracks(tracks, options.file);

  showTracks(tracks, importer.name);

  if (!options.write) {
    printDraft(tracks, options.file);
    return;
  }

  const path = await replaceTracks(options.dir, tracks, options.file);
  outro(`Wrote ${tracks.length} tracks to ${formatPath(path)}`);
}

export function requireTracks(tracks: ImportedPlay[], file: string): void {
  if (tracks.length > 0) return;
  throw new SetcastError(
    `No tracks found in ${file}`,
    'Lines should start with a timecode, e.g. "03:45 Artist - Title".',
  );
}

function parseOptions(argv: string[]): ImportOptions {
  const { values, positionals } = parseCommandArgs(
    argv,
    { write: { type: 'boolean' }, format: { type: 'string' } },
    help,
  );
  const [file, dir = '.'] = positionals;
  if (!file) throw new SetcastError('Missing tracklist file', help);
  return { file, dir, format: values.format, write: values.write ?? false };
}

export async function readTracklist(file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch (cause) {
    if (!isEnoent(cause)) throw cause;
    throw new SetcastError(
      `Cannot read ${file}`,
      'Pass a path to a text file with one track per line.',
      { cause },
    );
  }
}

/** The importer `--format` names, or the first registered one that recognizes the text. */
function selectImporter(text: string, { format, file }: ImportOptions): Importer {
  if (format) return importers.get(format);

  const recognized = importers
    .names()
    .map((name) => importers.get(name))
    .find((importer) => importer.test(text));
  if (recognized) return recognized;

  throw new SetcastError(
    `No importer recognizes ${file}`,
    `Lines should start with a timecode, e.g. "03:45 Artist - Title". Importers: ${importers.names().join(', ')}.`,
  );
}

function showTracks(tracks: ImportedPlay[], importerName: string): void {
  log.info(`${bold(String(tracks.length))} tracks via ${steel(importerName)} importer`);
  log.message(tracks.map(trackLine));
}

const trackLine = (track: ImportedPlay) => {
  const time = dim(formatTime(track.at).padStart(7));
  const label = track.label ? dim(`  [${track.label}]`) : '';
  const artist = track.artist ? `${track.artist} ${dim('-')} ` : '';
  return `${time}  ${artist}${track.title}${label}`;
};

function printDraft(tracks: ImportedPlay[], file: string): void {
  process.stdout.write(
    `\n${highlightYaml(stringify({ sources: { 'imported-tracklist': importSource(file) }, plays: tracks.map((track) => ({ ...toYaml(track), evidence: ['imported-tracklist'] })) }))}`,
  );
  outro(`Add the block above to ${CONFIG_FILE}, or re-run with --write.`);
}

/** Swaps the `plays:` block, leaving every other key of the file as the user wrote it. */
async function replaceTracks(dir: string, tracks: ImportedPlay[], file: string): Promise<string> {
  const path = join(resolve(dir), CONFIG_FILE);
  const doc = parseDocument(await readProjectConfig(path, dir));
  const loaded = await load(dir);
  const sources = loaded.config.sources;
  let source = 'imported-tracklist';
  for (let suffix = 2; source in sources; suffix++) source = `imported-tracklist-${suffix}`;
  doc.setIn(['sources', source], importSource(file));
  doc.set(
    'plays',
    tracks.map((track) => ({ ...toYaml(track), evidence: [source] })),
  );
  compileMix(ProjectConfigSchema.parse(doc.toJS()), toSeconds(loaded.project.mix.duration));
  // padding off so rewriting one block does not reformat `[1, 1.06]` elsewhere in the file
  await writeFile(path, doc.toString({ flowCollectionPadding: false }));
  return path;
}

async function readProjectConfig(path: string, dir: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (cause) {
    if (!isEnoent(cause)) throw cause;
    throw new SetcastError(
      `No ${CONFIG_FILE} found in ${resolve(dir)}`,
      'Run `setcast init` there first, or drop --write to print the tracks instead.',
      { cause },
    );
  }
}

const isEnoent = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

function toYaml(track: ImportedPlay): Record<string, string> {
  const entry: Record<string, string> = {
    at: formatTimecode(track.at),
    title: track.title,
  };
  if (track.label) entry.label = track.label;
  if (track.artist) entry.artist = track.artist;
  return entry;
}

const importSource = (file: string) => ({
  title: `Imported tracklist: ${file}`,
  note: 'Editorial timestamps imported from a tracklist; fallback participation is inferred, not measured.',
});
