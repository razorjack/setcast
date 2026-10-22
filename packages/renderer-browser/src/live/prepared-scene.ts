import { useCallback, useMemo, useState } from 'react';
import type { ResolvedLiveProject } from '@setcast/core';
import type { useLiveScene } from './player.tsx';
import type { LivePerformance } from './performance.ts';

/** Only a scene that reached output belongs in the replay journal. */
export function usePreparedScene(
  scene: ReturnType<typeof useLiveScene>,
  performance: LivePerformance,
) {
  const {
    project,
    preset,
    art: { art },
  } = scene;
  const requested = useMemo(
    () => ({
      project,
      art,
      selection: {
        theme: project.theme,
        preset: preset ?? undefined,
        title: project.title,
        branding: project.branding,
        clock: project.live.clock,
        bpm: project.bpm,
        beatOffset: project.beatOffset,
      },
    }),
    [project, preset, art],
  );
  const [prepared, setPrepared] = useState(requested);
  const ready = useCallback(
    (visible: ResolvedLiveProject) => {
      if (visible !== requested.project) return;
      setPrepared(requested);
      performance.ready();
    },
    [requested, performance],
  );
  return { prepared, ready };
}
