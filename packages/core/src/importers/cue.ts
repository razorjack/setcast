import type { ImportedPlay } from './plain.ts';
import type { Importer } from './plain.ts';
import { SetcastError } from '../errors.ts';

const TRACK = /^\s*TRACK\s+\d+/im;
const FIELD = /^\s*(TITLE|PERFORMER|INDEX)\s+(.*?)\s*$/i;
const INDEX = /^01\s+(\d+):(\d{2}):(\d{2})$/;

const unquote = (value: string) => value.replace(/^"(.*)"$/, '$1');

/**
 * Cue sheets, as mix CDs, Mixcloud and most recorders write them:
 *   TRACK 01 AUDIO
 *     TITLE "Stigma"
 *     PERFORMER "Noisia"
 *     INDEX 01 03:45:00
 * `INDEX 01` is the track start in minutes, seconds and 1/75 s frames. Fields before the first
 * TRACK describe the whole set and are ignored.
 */
export const cueImporter: Importer = {
  name: 'cue',
  test: (text) => TRACK.test(text) && /^\s*INDEX\s+01\s/im.test(text),
  parse(text) {
    if ([...text.matchAll(/^\s*FILE\s+.+$/gim)].length > 1) {
      throw new SetcastError(
        'The CUE sheet contains multiple FILE entries with separate timelines',
        'Export a single-file CUE sheet for the recorded mix, or convert its timestamps to offsets in that mix.',
      );
    }
    const tracks: ImportedPlay[] = [];
    let current: Partial<ImportedPlay> | null = null;

    const finishTrack = () => {
      if (current?.at === undefined || !current.title) return;
      tracks.push({ at: current.at, artist: current.artist, title: current.title });
    };

    for (const line of text.split('\n')) {
      if (TRACK.test(line)) {
        finishTrack();
        current = {};
        continue;
      }
      if (current) readField(current, line);
    }
    finishTrack();

    return tracks.toSorted((a, b) => a.at - b.at);
  },
};

function readField(track: Partial<ImportedPlay>, line: string): void {
  const match = FIELD.exec(line);
  if (!match) return;

  const field = match[1]!.toUpperCase();
  if (field === 'TITLE') track.title = unquote(match[2]!);
  if (field === 'PERFORMER') track.artist = unquote(match[2]!);
  if (field === 'INDEX') {
    const time = indexTime(match[2]!);
    if (time !== null) track.at = time;
  }
}

/** `01 MM:SS:FF` in 1/75 s frames. Null for `INDEX 00`, the pre-gap, which is not the start. */
function indexTime(value: string): number | null {
  const match = INDEX.exec(value);
  if (!match) return null;
  if (Number(match[2]) >= 60 || Number(match[3]) >= 75) return null;
  return Number(match[1]) * 60 + Number(match[2]) + Number(match[3]) / 75;
}
