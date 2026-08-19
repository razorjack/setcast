import type { TrackEntry } from '../config.ts';
import { parseTime } from '../time.ts';

export interface Importer {
  name: string;
  /** Quick sniff: does this text look like this importer's format? */
  test(text: string): boolean;
  parse(text: string): TrackEntry[];
}

const LINE = /^\s*(?:\d+[.)]\s+)?\[?(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)\]?\s*[-–—:]?\s*(.+?)\s*$/;

/** Splits "Artist - Title" (also "–", "—") into parts; the whole line is the title if there is no separator. */
function splitArtistTitle(rest: string): { artist: string; title: string } {
  const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(rest);
  if (!m) return { artist: 'ID', title: rest };
  return { artist: m[1]!.trim(), title: m[2]!.trim() };
}

/**
 * Plain text tracklists, one track per line:
 *   00:00 Noisia - Stigma
 *   [03:45] ID - ID
 *   2. 07:10 Phace – Thick Lips [Neosignal]
 * Lines that don't start with a timecode are ignored.
 */
export const plainImporter: Importer = {
  name: 'plain',
  test: (text) => text.split('\n').some((l) => LINE.test(l)),
  parse(text) {
    const tracks: TrackEntry[] = [];
    for (const line of text.split('\n')) {
      const m = LINE.exec(line);
      if (!m) continue;
      const time = parseTime(m[1]!);
      if (time === null) continue;
      let rest = m[2]!;
      let label: string | undefined;
      const lm = /^(.*?)\s*\[([^\]]+)\]\s*$/.exec(rest);
      if (lm) {
        rest = lm[1]!;
        label = lm[2]!;
      }
      const { artist, title } = splitArtistTitle(rest);
      tracks.push({ time, artist, title, ...(label !== undefined && { label }) });
    }
    return tracks;
  },
};
