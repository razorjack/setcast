import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  formatTime,
  formatTimecode,
  importers,
  SetcastError,
  type Importer,
  type TrackEntry,
} from '@setcast/core';
import { CONFIG_FILE } from '@setcast/core/node';
import { parseDocument, stringify } from 'yaml';
import { bold, dim, intro, log, outro, steel } from '../ui.ts';

export const help = `setcast import <tracklist.txt> [--format plain] [--write] [dir]

Parses a tracklist into Setcast tracks and prints them as YAML.
  --write   replace the tracks: section of setcast.yaml in <dir> (default: current directory)
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

  showTracks(tracks, importer.name);

  if (!options.write) {
    printDraft(tracks);
    return;
  }

  const path = await replaceTracks(options.dir, tracks);
  outro(`Wrote ${tracks.length} tracks to ${steel(path)}`);
}

function parseOptions(argv: string[]): ImportOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { write: { type: 'boolean' }, format: { type: 'string' } },
  });
  const [file, dir = '.'] = positionals;
  if (!file) throw new SetcastError('Missing tracklist file', help);
  return { file, dir, format: values.format, write: values.write ?? false };
}

async function readTracklist(file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    throw new SetcastError(
      `Cannot read ${file}`,
      'Pass a path to a text file with one track per line.',
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

function showTracks(tracks: TrackEntry[], importerName: string): void {
  log.info(`${bold(String(tracks.length))} tracks via ${steel(importerName)} importer`);
  for (const track of tracks) log.message(trackLine(track));
}

const trackLine = (track: TrackEntry) => {
  const time = dim(formatTime(track.time).padStart(7));
  const label = track.label ? dim(`  [${track.label}]`) : '';
  return `${time}  ${track.artist} ${dim('-')} ${track.title}${label}`;
};

function printDraft(tracks: TrackEntry[]): void {
  process.stdout.write(`\n${stringify({ tracks: tracks.map(toYaml) })}`);
  outro(`Add the block above to ${CONFIG_FILE}, or re-run with --write.`);
}

/** Swaps the `tracks:` block, leaving every other key of the file as the user wrote it. */
async function replaceTracks(dir: string, tracks: TrackEntry[]): Promise<string> {
  const path = join(resolve(dir), CONFIG_FILE);
  const doc = parseDocument(await readProjectConfig(path, dir));
  doc.set('tracks', tracks.map(toYaml));
  // padding off so rewriting one block does not reformat `[1, 1.06]` elsewhere in the file
  await writeFile(path, doc.toString({ flowCollectionPadding: false }));
  return path;
}

async function readProjectConfig(path: string, dir: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    throw new SetcastError(
      `No ${CONFIG_FILE} found in ${resolve(dir)}`,
      'Run `setcast init` there first, or drop --write to print the tracks instead.',
    );
  }
}

function toYaml(track: TrackEntry): Record<string, string> {
  const entry: Record<string, string> = {
    time: formatTimecode(track.time),
    artist: track.artist,
    title: track.title,
  };
  if (track.label) entry.label = track.label;
  if (track.deck) entry.deck = track.deck;
  return entry;
}
