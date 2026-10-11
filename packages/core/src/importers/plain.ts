export type ImportedPlay = { at: number; title: string; artist?: string; label?: string };
import { parseTime } from '../time.ts';
import { SetcastError } from '../errors.ts';

export interface Importer {
  name: string;
  /** Quick sniff: does this text look like this importer's format? */
  test(text: string): boolean;
  parse(text: string): ImportedPlay[];
}

const LINE = /^\s*(?:\d+[.)]\s+)?\[?(\d+:\d{2}(?::\d{2})?(?:\.\d+)?)\]?\s*[-–—:]?\s*(.+?)\s*$/;
const TIMESTAMP_LINE = /^\s*(?:\d+[.)]\s+)?\[?\d+:/;
const LABEL = /^(.*?)\s*\[([^\]]+)\]\s*$/;
const ARTIST_TITLE = /^(.+?)\s+[-–—]\s+(.+)$/;

/**
 * Plain text tracklists, one track per line:
 *   00:00 Noisia - Stigma
 *   [03:45] ID - ID
 *   2. 07:10 Phace – Thick Lips [Neosignal]
 * Lines that don't start with a timecode are ignored.
 */
export const plainImporter: Importer = {
  name: 'plain',
  test: (text) => text.split('\n').some((line) => LINE.test(line)),
  parse(text) {
    const tracks: ImportedPlay[] = [];
    for (const [index, line] of text.split('\n').entries()) {
      const track = parseLine(line);
      if (track) tracks.push(track);
      else if (TIMESTAMP_LINE.test(line)) {
        throw new SetcastError(
          `Invalid tracklist entry on line ${index + 1}: ${line.trim()}`,
          'Use M:SS or H:MM:SS followed by a title; seconds and hour-format minutes must be below 60.',
        );
      }
    }
    return tracks;
  },
};

function parseLine(line: string): ImportedPlay | null {
  const match = LINE.exec(line);
  if (!match) return null;
  const time = parseTime(match[1]!);
  if (time === null) return null;

  const { rest, label } = splitLabel(match[2]!);
  const { artist, title } = splitArtistTitle(rest);
  if (label === undefined) return { at: time, artist, title };
  return { at: time, artist, title, label };
}

/** A trailing `[Neosignal]` names the release, not the track. */
function splitLabel(rest: string): { rest: string; label: string | undefined } {
  const match = LABEL.exec(rest);
  if (!match) return { rest, label: undefined };
  return { rest: match[1]!, label: match[2]! };
}

/** Splits "Artist - Title" (also "–", "—") into parts; the whole line is the title if there is no separator. */
function splitArtistTitle(rest: string): { artist?: string; title: string } {
  const match = ARTIST_TITLE.exec(rest);
  if (!match) return { artist: undefined, title: rest };
  return { artist: match[1]!.trim(), title: match[2]!.trim() };
}
