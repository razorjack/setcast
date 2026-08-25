import type { TrackEntry } from '../config.ts';
import type { Importer } from './plain.ts';

const TRACK = /^\s*TRACK\s+\d+/im;
const FIELD = /^\s*(TITLE|PERFORMER|INDEX)\s+(.*?)\s*$/i;
const INDEX = /^01\s+(\d+):(\d{2}):(\d{2})$/;

const unquote = (v: string) => v.replace(/^"(.*)"$/, '$1');

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
    const tracks: TrackEntry[] = [];
    let current: Partial<TrackEntry> | null = null;
    const finish = () => {
      if (current?.time !== undefined && current.title) {
        tracks.push({ time: current.time, artist: current.artist ?? 'ID', title: current.title });
      }
    };
    for (const line of text.split('\n')) {
      if (TRACK.test(line)) {
        finish();
        current = {};
        continue;
      }
      const m = FIELD.exec(line);
      if (!m || !current) continue;
      const [, key, value] = m as unknown as [string, string, string];
      if (key.toUpperCase() === 'TITLE') current.title = unquote(value);
      else if (key.toUpperCase() === 'PERFORMER') current.artist = unquote(value);
      else {
        const t = INDEX.exec(value);
        if (t) current.time = Number(t[1]) * 60 + Number(t[2]) + Number(t[3]) / 75;
      }
    }
    finish();
    return tracks.toSorted((a, b) => a.time - b.time);
  },
};
