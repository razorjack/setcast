import { useEffect, useRef, useState } from 'react';
import type { ResolvedProject } from '@setcast/core';
import type { ThemeListing } from '../catalog.ts';

export async function fetchProject(theme: string | null): Promise<ResolvedProject> {
  const query = theme ? `?theme=${encodeURIComponent(theme)}` : '';
  const response = await fetch(`/project.json${query}`);
  if (response.ok) return (await response.json()) as ResolvedProject;
  const failure = (await response.json().catch(() => null)) as {
    message?: string;
    hint?: string;
  } | null;
  if (!failure?.message)
    throw new Error('Cannot load the project. Restart setcast play and reload this page.');
  throw new Error([failure.message, failure.hint].filter(Boolean).join('. '));
}

/** The project with the selected theme. The URL keeps the choice, so a reload shows it again. */
export function useThemes(initial: ResolvedProject, report: (message: string) => void) {
  const [project, setProject] = useState(initial);
  const [listings, setListings] = useState<ThemeListing[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    void fetch('/themes.json')
      .then((response) => response.json() as Promise<ThemeListing[]>)
      .then(setListings, () => report('Cannot list the themes. Restart setcast play to switch.'));
  }, [report]);

  const select = (theme: string) => {
    if (theme === project.theme && !loading) return;
    const request = ++latest.current;
    setLoading(theme);
    fetchProject(theme).then(
      (themed) => {
        if (request !== latest.current) return;
        setProject(themed);
        setLoading(null);
        rememberTheme(themed.theme, listings);
      },
      (error: unknown) => {
        if (request !== latest.current) return;
        setLoading(null);
        report(
          `Cannot switch to ${theme}: ${error instanceof Error ? error.message : String(error)}`,
        );
      },
    );
  };

  /** Selects the theme `offset` places away in the list and returns its name. */
  const step = (offset: number): string | null => {
    const names = listings.map((listing) => listing.name);
    if (names.length === 0) return null;
    const current = names.indexOf(loading ?? project.theme);
    const theme = names.at((current + offset) % names.length)!;
    select(theme);
    return theme;
  };

  return { project, listings, loading, select, step };
}

export const requestedTheme = () => new URLSearchParams(location.search).get('theme');

function rememberTheme(theme: string, listings: ThemeListing[]) {
  const url = new URL(location.href);
  const own = listings.find((listing) => listing.project)?.name;
  if (theme === own) url.searchParams.delete('theme');
  else url.searchParams.set('theme', theme);
  history.replaceState(null, '', url);
}
