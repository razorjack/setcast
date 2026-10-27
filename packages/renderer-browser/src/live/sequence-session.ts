import { useEffect, useRef, useState } from 'react';
import type { ResolvedLiveProject } from '@setcast/core';
import type { LiveInput } from './input.ts';
import type { LivePerformance } from './performance.ts';
import type { SceneRecall } from './bank.tsx';
import { LiveSequence } from './sequence.ts';
import type { Report } from '../browser/report.ts';

export function useSequence(
  initial: ResolvedLiveProject,
  input: LiveInput,
  options: {
    recall: SceneRecall;
    performance: LivePerformance;
    project: ResolvedLiveProject;
    report: Report;
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
    sequence.listening.reset();
    sequence.index = -1;
    sequence.elapsed = 0;
  }, [sequence, input.capture.audio]);
  useEffect(
    () => sequence.listening.reset(),
    [sequence, input.settings.gain, input.settings.channels],
  );
  useEffect(() => {
    advanceSequence(sequence, input, options.performance.blackout);
  }, [sequence, input, options.performance.blackout]);
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

function advanceSequence(sequence: LiveSequence, input: LiveInput, blackout: boolean) {
  const audio = input.capture.audio;
  const available = input.snapshot.status.available && !blackout;
  if (!available) sequence.listening.reset();
  else if (audio && sequence.mode === 'energy') {
    const time = Math.floor(audio.time * 10) / 10;
    sequence.listening.update(time, audio.featuresAt(time), sequence.energy);
  }
  sequence.tick(audio?.capturedTime ?? 0, available);
}
