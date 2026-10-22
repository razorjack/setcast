import type { ResolvedLiveProject } from '@setcast/core';
import { usePreparedScene } from './prepared-scene.ts';
import { usePerformance } from './performance.ts';
import { useSceneBank, useSceneRecall } from './bank.tsx';
import { useSessionJournal } from './journal.tsx';
import { useMidi, type MidiAction } from './midi.ts';
import type { useLiveScene } from './player.tsx';
import type { LiveInput } from './input.ts';

export function useLivePerformance(
  initial: ResolvedLiveProject,
  input: LiveInput,
  scene: ReturnType<typeof useLiveScene>,
  report: (message: string) => void,
) {
  const performance = usePerformance(initial, input, {
    running: input.snapshot.status.phase === 'running',
    time: () => input.capture.audio?.capturedTime ?? 0,
    recall: scene.recall,
    record: (event) => journal.performance(event),
  });
  const { prepared, ready } = usePreparedScene(scene, performance);
  const bank = useSceneBank(report);
  const recall = useSceneRecall({
    performance,
    tempo: scene.tempo,
    report,
    capture: input.capture.audio,
  });
  const journal = useSessionJournal({
    input,
    report,
    art: prepared.art,
    performance: () => performance.ramp,
    selection: { ...prepared.selection, input: input.settings },
  });
  const dispatch = (action: MidiAction, value: number) => {
    if (action === 'intensity') performance.change({ intensity: value * 2 });
    else if (action === 'brightness') performance.change({ brightness: value });
    else if (action === 'blackout') performance.toggleBlackout();
    else if (input.snapshot.status.phase === 'running') {
      const selected = bank.scenes[Number(action.slice(6)) - 1];
      if (selected) void recall.recall(selected.preset);
    }
  };
  const midi = useMidi(dispatch, report);
  return {
    performance,
    bank,
    recall,
    journal,
    midi,
    ready,
    activePreset: prepared.selection.preset ?? null,
  };
}
