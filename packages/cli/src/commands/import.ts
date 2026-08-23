import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { formatTime, importers, SetcastError, type TrackEntry } from '@setcast/core';
import { CONFIG_FILE } from '@setcast/core/node';
import { parseDocument, stringify } from 'yaml';
import { bold, dim, intro, log, outro, steel } from '../ui.ts';

export const help = `setcast import <tracklist.txt> [--format plain] [--write] [dir]

Parses a tracklist into Setcast tracks and prints them as YAML.
  --write   replace the tracks: section of setcast.yaml in <dir> (default: current directory)
  --format  importer to use (default: auto-detect). Available: ${importers.names().join(', ')}`;

export async function run(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { write: { type: 'boolean' }, format: { type: 'string' } },
  });
  const [file, dir = '.'] = positionals;
  if (!file) throw new SetcastError('Missing tracklist file', help);
  intro('import');
  const text = await readFile(file, 'utf8').catch(() => {
    throw new SetcastError(
      `Cannot read ${file}`,
      'Pass a path to a text file with one track per line.',
    );
  });
  const importer = values.format
    ? importers.get(values.format)
    : importers
        .names()
        .map((n) => importers.get(n))
        .find((i) => i.test(text));
  if (!importer) {
    throw new SetcastError(
      `No importer recognizes ${file}`,
      `Lines should start with a timecode, e.g. "03:45 Artist - Title". Importers: ${importers.names().join(', ')}.`,
    );
  }
  const tracks = importer.parse(text);
  log.info(`${bold(String(tracks.length))} tracks via ${steel(importer.name)} importer`);
  for (const t of tracks)
    log.message(
      `${dim(formatTime(t.time).padStart(7))}  ${t.artist} ${dim('-')} ${t.title}${t.label ? dim(`  [${t.label}]`) : ''}`,
    );

  if (!values.write) {
    process.stdout.write(`\n${stringify({ tracks: tracks.map(toYaml) })}`);
    outro(`Add the block above to ${CONFIG_FILE}, or re-run with --write.`);
    return;
  }
  const path = join(resolve(dir), CONFIG_FILE);
  const current = await readFile(path, 'utf8').catch(() => {
    throw new SetcastError(
      `No ${CONFIG_FILE} found in ${resolve(dir)}`,
      'Run `setcast init` there first, or drop --write to print the tracks instead.',
    );
  });
  const doc = parseDocument(current);
  doc.set('tracks', tracks.map(toYaml));
  await writeFile(path, doc.toString());
  outro(`Wrote ${tracks.length} tracks to ${steel(path)}`);
}

/** `3:45.5`. `formatTime` alone floors the fraction away, and tracklists do carry one. */
const timecode = (seconds: number) => {
  const rounded = Math.round(seconds * 1000) / 1000;
  const whole = Math.floor(rounded);
  const frac = (rounded - whole).toFixed(3).replace(/^0/, '').replace(/0+$/, '');
  return formatTime(whole) + (frac === '.' ? '' : frac);
};

const toYaml = (t: TrackEntry) => ({
  time: timecode(t.time),
  artist: t.artist,
  title: t.title,
  ...(t.label && { label: t.label }),
  ...(t.deck && { deck: t.deck }),
});
