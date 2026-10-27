import { scenePad, type ResolvedLiveProject } from '@setcast/core';
import { useSequence } from './sequence-session.ts';
import { usePreparedScene } from './prepared-scene.ts';
import { usePerformance, type LivePerformance } from './performance.ts';
import { useSceneBank, useSceneRecall, type SceneBank, type SceneRecall } from './bank.tsx';
import { useSessionJournal } from './journal.tsx';
import { useMidi, type MidiAction } from './midi.ts';
import type { SceneControl } from './scene-control.ts';
import type { LiveInput } from './input.ts';
import { useAnnouncements } from './announcements.ts';
import type { Report } from '../player/report.ts';

/** What the operator plays during the set: levels, scene recall, the sequence, MIDI and the journal. */
export function useLiveShow(
  initial: ResolvedLiveProject,
  input: LiveInput,
  scene: SceneControl,
  report: Report,
) {
  const performance = usePerformance(initial, input, {
    running: input.snapshot.status.phase === 'running',
    time: () => input.capture.audio?.capturedTime ?? 0,
    recall: scene.recall,
    // The journal needs the performance for its snapshots, so it is created below; ramps
    // only start after both exist.
    record: (event) => journal.performance(event),
  });
  const { prepared, ready } = usePreparedScene(scene, performance);
  const bank = useSceneBank(report);
  const sceneRecall = useSceneRecall({
    performance,
    tempo: scene.tempo,
    report,
    audio: input.capture.audio,
  });
  const journal = useSessionJournal({
    input,
    report,
    art: prepared.art,
    performance: () => performance.ramp,
    selection: { ...prepared.selection, input: input.settings },
  });
  const { sequence, manualRecall } = useSequence(initial, input, {
    recall: sceneRecall,
    performance,
    project: scene.project,
    report,
  });
  const announcements = useAnnouncements(input, journal);
  const dispatch = midiDispatch({ input, scene, performance, bank, recall: manualRecall });
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

export type LiveShow = ReturnType<typeof useLiveShow>;

function midiDispatch({
  input,
  scene,
  performance,
  bank,
  recall,
}: {
  input: LiveInput;
  scene: SceneControl;
  performance: LivePerformance;
  bank: SceneBank;
  recall: SceneRecall;
}) {
  return (action: MidiAction, value: number) => {
    if (action === 'intensity') performance.change({ intensity: value * 2 });
    else if (action === 'brightness') performance.change({ brightness: value });
    else if (action === 'blackout') performance.toggleBlackout();
    else if (action === 'branding') scene.branding.toggle('visible');
    else if (action === 'messages') scene.branding.toggle('messages');
    else recallPad(scenePad(action), { input, bank, recall });
  };
}

function recallPad(
  pad: number | null,
  { input, bank, recall }: { input: LiveInput; bank: SceneBank; recall: SceneRecall },
) {
  if (pad === null || input.snapshot.status.phase !== 'running') return;
  const selected = bank.scenes[pad];
  if (selected) void recall.start(selected.preset);
}
