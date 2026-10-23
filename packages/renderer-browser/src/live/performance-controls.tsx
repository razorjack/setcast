import { SequenceControls } from './sequence-controls.tsx';
import type { LiveSequence } from './sequence.ts';
import { useEffect, useRef, useState } from 'react';
import { SceneBank, type useSceneBank, type useSceneRecall } from './bank.tsx';
import type { LivePerformance } from './performance.ts';
import type { useMidi } from './midi.ts';
import { MidiControls } from './midi-controls.tsx';

interface Props {
  sequence: LiveSequence;
  available: boolean;
  performance: LivePerformance;
  midi: ReturnType<typeof useMidi>;
  bank: ReturnType<typeof useSceneBank>;
  recall: ReturnType<typeof useSceneRecall>;
  running: boolean;
  active: string | null;
  report: (message: string) => void;
}

export function PerformanceControls(props: Props) {
  const { performance, midi } = props;
  return (
    <section className="sc-performance" aria-label="Performance">
      <div className="sc-performance-faders">
        <PerformanceFader
          name="Intensity"
          value={performance.target.intensity}
          max={2}
          disabled={Boolean(performance.transition)}
          change={(intensity) => performance.change({ intensity })}
        />
        <PerformanceFader
          name="Brightness"
          value={performance.target.brightness}
          max={1}
          disabled={Boolean(performance.transition)}
          change={(brightness) => performance.change({ brightness })}
        />
        <button
          className="sc-button"
          aria-pressed={performance.blackout}
          onClick={performance.toggleBlackout}
        >
          {performance.blackout ? 'Restore output' : 'Blackout'}
        </button>
      </div>
      <SceneBank {...props} />
      <SequenceControls {...props} />
      <MidiControls midi={midi} />
    </section>
  );
}

interface FaderProps {
  name: string;
  value: number;
  max: number;
  disabled: boolean;
  change: (value: number) => void;
}
function PerformanceFader({ name, value, max, disabled, change }: FaderProps) {
  const [draft, setDraft] = useState<number | null>(null);
  const pending = useRef<number | null>(null);
  const currentChange = useRef(change);
  currentChange.current = change;
  const commit = () => {
    if (pending.current !== null) currentChange.current(pending.current);
    pending.current = null;
    setDraft(null);
  };
  useEffect(() => {
    const timer = setInterval(() => {
      if (pending.current === null) return;
      currentChange.current(pending.current);
      pending.current = null;
    }, 100);
    return () => clearInterval(timer);
  }, []);
  return (
    <label>
      {name}
      <output>{Math.round((draft ?? value) * 100)}%</output>
      <input
        aria-label={name}
        type="range"
        min={0}
        max={max}
        step={0.01}
        value={draft ?? value}
        disabled={disabled}
        onChange={(event) => {
          pending.current = Number(event.target.value);
          setDraft(pending.current);
        }}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </label>
  );
}
