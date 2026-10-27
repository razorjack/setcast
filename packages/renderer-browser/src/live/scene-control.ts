import { useMemo, useState } from 'react';
import type { ResolvedLiveProject } from '@setcast/core';
import type { Art } from '../browser/overrides.ts';
import { useArt } from '../browser/art.tsx';
import { useThemes, type ThemeSelection } from '../browser/themes.ts';
import type { Report } from '../browser/report.ts';
import { useLiveBranding } from './branding.ts';
import type { Tempo } from './tempo.tsx';

/** The scene the operator shows: theme, art, title, branding, clock and tempo. */
export function useSceneControl(initial: ResolvedLiveProject, report: Report) {
  const themes = useThemes(initial, report);
  const art = useArt(report);
  const [title, setTitle] = useState(initial.title);
  const [preset, setPreset] = useState<string | null>(null);
  const [clock, setClock] = useState(initial.live.clock);
  const [tempo, setTempo] = useState<Tempo>({ bpm: initial.bpm, beatOffset: initial.beatOffset });
  const branding = useLiveBranding(initial.branding, report);
  const project = useMemo(
    () => ({
      ...themes.project,
      ...tempo,
      background: selectedBackground(themes.project.background, art.art),
      title,
      branding: branding.value,
      live: { ...themes.project.live, clock },
    }),
    [themes.project, art.art, title, clock, tempo, branding.value],
  );
  const recall = (saved: ResolvedLiveProject, directory: string) => {
    themes.adopt({ ...saved, width: initial.width, height: initial.height, fps: initial.fps });
    art.setArt({ kind: 'project' });
    setTitle(saved.title);
    branding.set(saved.branding);
    setClock(saved.live.clock);
    setPreset(directory);
  };
  return {
    themes: manualThemes(themes, () => setPreset(null)),
    art,
    title,
    setTitle,
    branding,
    clock,
    setClock,
    project,
    tempo,
    setTempo,
    preset,
    recall,
  };
}

export type SceneControl = ReturnType<typeof useSceneControl>;

/** Choosing a theme by hand leaves the recalled scene preset behind. */
function manualThemes(themes: ThemeSelection<ResolvedLiveProject>, leave: () => void) {
  return {
    ...themes,
    step: (offset: number) => {
      leave();
      return themes.step(offset);
    },
    select: (name: string) => {
      leave();
      themes.select(name);
    },
  };
}

function selectedBackground(background: string | null, art: Art) {
  if (art.kind === 'none') return null;
  if (art.kind === 'file') return `${art.url}#${art.name}`;
  return background;
}
