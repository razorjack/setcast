import { useEffect, useState } from 'react';
import {
  ProjectionSchema,
  VenueSchema,
  type Projection,
  type ResolvedLiveProject,
  type Venue,
} from '@setcast/core';
import { downloadJson } from './diagnostics.tsx';
import type { LiveTestPattern } from './test-pattern.ts';

export function useProjection(
  initial: ResolvedLiveProject,
  report: (message: string) => void,
  testPattern: LiveTestPattern,
) {
  const [config, setConfig] = useState(() => initial.live.projection ?? ProjectionSchema.parse({}));
  const [name, setName] = useState('My venue');
  const change = (next: Projection) => {
    const parsed = ProjectionSchema.safeParse(next);
    if (!parsed.success) {
      report(parsed.error.issues[0]!.message);
      return;
    }
    setConfig(parsed.data);
  };
  const apply = (venue: Venue) => {
    setConfig(venue.projection);
    setName(venue.name);
    testPattern.show(false);
  };
  const venues = useVenues(report);
  const current = () => VenueSchema.parse({ version: 1, name, projection: config });
  const save = () => {
    try {
      venues.save(current());
    } catch (error) {
      report(venueError(error));
    }
  };
  const download = () => {
    try {
      downloadJson('setcast-venue.json', current());
    } catch (error) {
      report(venueError(error));
    }
  };
  return {
    config,
    change,
    pattern: testPattern.alignment,
    setPattern: testPattern.showAlignment,
    name,
    setName,
    venues,
    apply,
    save,
    download,
    upload: (file: File) => importVenue(file, apply, report),
  };
}

const storageKey = 'setcast-venues-v1';
function useVenues(report: (message: string) => void) {
  const [saved, setSaved] = useState<Venue[]>([]);
  useEffect(() => {
    try {
      const entries: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
      if (!Array.isArray(entries) || entries.length > 16)
        throw new Error('Expected at most 16 saved venues.');
      setSaved(entries.map((entry) => VenueSchema.parse(entry)));
    } catch (error) {
      report(
        `Cannot read saved venues: ${venueError(error)}. Import an exported venue to recover.`,
      );
    }
  }, [report]);
  const save = (venue: Venue) => {
    const entries = saved.filter((entry) => entry.name !== venue.name);
    if (entries.length >= 16)
      throw new Error('There are already 16 saved venues. Remove one or use an existing name.');
    const next = [...entries, venue];
    localStorage.setItem(storageKey, JSON.stringify(next));
    setSaved(next);
  };
  const remove = (name: string) => {
    try {
      const next = saved.filter((entry) => entry.name !== name);
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSaved(next);
    } catch (error) {
      report(venueError(error));
    }
  };
  return { saved, save, remove };
}
function venueError(error: unknown) {
  if (error && typeof error === 'object' && 'issues' in error)
    return (error as { issues: { message: string }[] }).issues
      .map((issue) => issue.message)
      .join(' ');
  return error instanceof Error ? error.message : String(error);
}

async function importVenue(
  file: File,
  apply: (venue: Venue) => void,
  report: (message: string) => void,
) {
  try {
    if (file.size > 32_768)
      throw new Error('Venue file exceeds 32 KiB. Import a Setcast venue JSON file.');
    apply(VenueSchema.parse(JSON.parse(await file.text())));
  } catch (error) {
    report(venueError(error));
  }
}
