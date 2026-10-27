import { useEffect, useRef, useState } from 'react';
import {
  errorMessage,
  DEFAULT_MIDI,
  MidiMappingSchema,
  MidiProfileSchema,
  type MidiConfig,
  type MidiMapping,
} from '@setcast/core';
import { downloadJson } from './diagnostics.tsx';
import type { Report } from '../player/report.ts';

const storageKey = 'setcast-midi-profile-v1';
export function readMidiProfile(storage: Pick<Storage, 'getItem'>): {
  config: MidiConfig;
  source: string;
} {
  const read = (key: string) => {
    try {
      return JSON.parse(storage.getItem(key) ?? 'null');
    } catch {
      return null;
    }
  };
  const profile = MidiProfileSchema.safeParse(read(storageKey));
  if (profile.success) return { config: profile.data, source: 'Browser profile' };
  const legacy = MidiMappingSchema.safeParse(read('setcast-midi-v1'));
  if (legacy.success)
    return { config: { name: 'MIDI controls', mapping: legacy.data }, source: 'Browser profile' };
  return { config: { name: 'MIDI controls', mapping: { ...DEFAULT_MIDI } }, source: 'Defaults' };
}

export function useMidiProfile(initial: MidiConfig | undefined, report: Report) {
  const [state, setState] = useState(() =>
    initial
      ? { config: initial, source: 'live.yaml' }
      : readMidiProfile({ getItem: (key) => localStorage.getItem(key) }),
  );
  const { config, source } = state;
  const revision = useRef(0);
  useEffect(() => {
    if (initial) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ ...config, version: 1 }));
    } catch {
      /* Session controls still work without persistence. */
    }
  }, [config, initial]);
  const upload = (file: File) => {
    const current = ++revision.current;
    const notify = (message: string) => {
      if (current === revision.current) report(message);
    };
    return importProfile(file, notify, (config) => {
      if (current !== revision.current) return false;
      setState({ config, source: 'Imported profile' });
      return true;
    });
  };

  return {
    config,
    source,
    upload,
    sessionOnly: Boolean(initial),
    setMapping: (update: (mapping: MidiMapping) => MidiMapping) => {
      revision.current++;
      setState((current) => ({
        config: { ...current.config, mapping: update(current.config.mapping) },
        source: 'Edited mappings',
      }));
    },
    reset: () => {
      revision.current++;
      setState({
        config: { name: 'MIDI controls', mapping: { ...DEFAULT_MIDI } },
        source: 'Defaults',
      });
    },
    download: () => downloadJson('setcast-midi.json', { ...config, version: 1 }),
  };
}

async function importProfile(file: File, report: Report, apply: (config: MidiConfig) => boolean) {
  try {
    if (file.size > 65536)
      throw new Error('MIDI profile exceeds 64 KiB. Import an exported mapping profile.');
    const profile = MidiProfileSchema.safeParse(JSON.parse(await file.text()));
    if (!profile.success)
      throw new Error(profile.error.issues.map((issue) => issue.message).join(' '));
    if (!apply(profile.data)) return false;
    report(`Imported MIDI profile "${profile.data.name}".`);
    return true;
  } catch (error) {
    report(`Cannot import MIDI profile: ${errorMessage(error)}`);
    return false;
  }
}
