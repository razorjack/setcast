import { PANEL_DEFAULTS, TRACKLIST_DEFAULTS, type ResolvedProject } from '@setcast/core';

export type Credits = 'panels' | 'tracklist' | 'both';

/** Art the viewer chose in the player: the project's own, a local file, or none at all. */
export type Art =
  | { kind: 'project' }
  | { kind: 'file'; url: string; name: string }
  | { kind: 'none' };

export function creditsOf(project: ResolvedProject): Credits | null {
  if (project.panel && project.tracklist) return 'both';
  if (project.panel) return 'panels';
  if (project.tracklist) return 'tracklist';
  return null;
}

/** Turns panels and the tracklist on or off, keeping the timing and counts the project chose. */
export function withCredits(project: ResolvedProject, credits: Credits | null): ResolvedProject {
  if (!credits) return project;
  const panel = project.panel ?? PANEL_DEFAULTS;
  const tracklist = project.tracklist ?? TRACKLIST_DEFAULTS;
  return {
    ...project,
    panel: credits === 'tracklist' ? null : panel,
    tracklist: credits === 'panels' ? null : tracklist,
  };
}

/**
 * Shows the chosen art for the whole set, in place of the project's and every play's own. A file
 * keeps its name after the URL's `#`, which the browser ignores when it loads a blob URL, so the
 * stage still tells a video from an image by its extension.
 */
export function withArt(project: ResolvedProject, art: Art): ResolvedProject {
  if (art.kind === 'project') return project;
  const plays = project.mix.plays.map(({ background: _background, ...play }) => play);
  const background = art.kind === 'file' ? `${art.url}#${art.name}` : null;
  const scenes = project.scenes?.map((entry) => ({
    ...entry,
    scene: { ...entry.scene, background },
  }));
  return { ...project, background, ...(scenes ? { scenes } : {}), mix: { ...project.mix, plays } };
}
