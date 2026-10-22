import { useEffect, useRef, useState } from 'react';
import type { ResolvedLiveProject } from '@setcast/core';
import type { LiveInput } from './input.ts';
import type { LivePerformance } from './performance.ts';
import type { useSceneRecall } from './bank.tsx';
import { LiveSequence } from './sequence.ts';

export function useSequence(
  initial: ResolvedLiveProject,
  input: LiveInput,
  options: {
    recall: ReturnType<typeof useSceneRecall>;
    performance: LivePerformance;
    project: ResolvedLiveProject;
    report: (message: string) => void;
  },
) {
  const [, update] = useState(0);
  const actions = {
    recall: options.recall.recall,
    cancel: options.recall.cancelPending,
    report: options.report,
    changed: () => update((revision) => revision + 1),
  };
  const [sequence] = useState(() => new LiveSequence(initial.live.sequence, actions));
  sequence.options = actions;
  const previous = useRef(options.project);
  useEffect(() => {
    if (options.project !== previous.current && !sequence.pending && sequence.running)
      sequence.hold();
    previous.current = options.project;
  }, [options.project, sequence]);
  useEffect(() => {
    sequence.stop();
    sequence.index = -1;
    sequence.elapsed = 0;
  }, [sequence, input.capture.audio]);
  useEffect(() => {
    sequence.tick(
      input.capture.audio?.capturedTime ?? 0,
      input.snapshot.status.available && !options.performance.blackout,
    );
  }, [sequence, input.snapshot, input.capture.audio, options.performance]);
  const manualRecall = {
    ...options.recall,
    recall: (preset: string) => {
      sequence.stop();
      sequence.index = -1;
      sequence.elapsed = 0;
      return options.recall.recall(preset);
    },
  };
  return { sequence, manualRecall };
}
