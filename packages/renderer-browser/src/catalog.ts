import { SetcastError, type ResolvedProject } from '@setcast/core';

export interface ThemeChoice {
  name: string;
  description?: string;
}

/** The themes the player offers, and how to resolve the project with one of them. */
export interface ThemeCatalog {
  choices: ThemeChoice[];
  load: (name: string) => Promise<ResolvedProject>;
}

export interface ThemeListing extends ThemeChoice {
  /** The theme the project was loaded with. */
  project: boolean;
}

/**
 * Serialized projects by theme, each resolved on its first request. The project's own theme is
 * listed first, so a `.css` theme the catalog does not know stays selectable.
 */
export function projectCatalog(project: ResolvedProject, catalog?: ThemeCatalog) {
  const others = (catalog?.choices ?? []).filter((choice) => choice.name !== project.theme);
  const own = catalog?.choices.find((choice) => choice.name === project.theme);
  const listings: ThemeListing[] = [
    { name: project.theme, description: own?.description, project: true },
    ...others.map((choice) => ({ ...choice, project: false })),
  ];
  const projects = new Map([[project.theme, Promise.resolve(serialize(project))]]);

  const load = (theme: string): Promise<Buffer> => {
    const loaded = projects.get(theme);
    if (loaded) return loaded;
    if (!catalog || !listings.some((listing) => listing.name === theme)) {
      throw new SetcastError(
        `Unknown theme "${theme}"`,
        `Choose one of: ${listings.map((listing) => listing.name).join(', ')}.`,
      );
    }
    const loading = catalog.load(theme).then(serialize);
    projects.set(theme, loading);
    loading.catch(() => projects.delete(theme));
    return loading;
  };

  return { listings, load, theme: project.theme };
}

const serialize = (project: ResolvedProject) => Buffer.from(JSON.stringify(project));
