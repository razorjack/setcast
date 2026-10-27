import type { ResolvedLiveProject } from '@setcast/core';
import { useSequence } from './sequence-session.ts';
import { usePreparedScene } from './prepared-scene.ts';
import { usePerformance } from './performance.ts';
import { useSceneBank, useSceneRecall, type SceneBank, type SceneRecall } from './bank.tsx';
import { useSessionJournal } from './journal.tsx';
import { useMidi, type MidiAction } from './midi.ts';
import type { useLiveScene } from './player.tsx';
import type { LiveInput } from './input.ts';
import { useAnnouncements } from './announcements.ts';
import type { Report } from '../browser/report.ts';

export function useLivePerformance(
  initial: ResolvedLiveProject,
  input: LiveInput,
  scene: ReturnType<typeof useLiveScene>,
  report: Report,
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
  const { sequence, manualRecall } = useSequence(initial, input, {
    recall,
    performance,
    project: scene.project,
    report,
  });
  const announcements = useAnnouncements(input, journal);
  const dispatch = performanceMidi({ input, scene, performance, bank, recall: manualRecall });
  const midi = useMidi(dispatch, report, initial.live.midi);
  return {
    announcements,
    performance,
    bank,
    recall: manualRecall,
    sequence,
    journal,
    midi,
    ready,
    activePreset: prepared.selection.preset ?? null,
  };
}

function performanceMidi({
  input,
  scene,
  performance,
  bank,
  recall,
}: {
  input: LiveInput;
  scene: ReturnType<typeof useLiveScene>;
  performance: ReturnType<typeof usePerformance>;
  bank: SceneBank;
  recall: SceneRecall;
}) {
  const dispatch = (action: MidiAction, value: number) => {
    if (action === 'intensity') performance.change({ intensity: value * 2 });
    else if (action === 'brightness') performance.change({ brightness: value });
    else if (action === 'blackout') performance.toggleBlackout();
    else if (action === 'branding') scene.branding.toggle('visible');
    else if (action === 'messages') scene.branding.toggle('messages');
    else if (input.snapshot.status.phase === 'running') {
      const selected = bank.scenes[Number(action.slice(6)) - 1];
      if (selected) void recall.recall(selected.preset);
    }
  };
  return dispatch;
}
