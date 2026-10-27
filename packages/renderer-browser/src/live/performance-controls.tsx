import { useEffect, useRef, useState } from 'react';
import { ScenePads } from './bank.tsx';
import { MidiControls } from './midi-controls.tsx';
import { SequenceControls } from './sequence-controls.tsx';
import type { LiveShow } from './show.ts';

interface Props {
  show: LiveShow;
  available: boolean;
  running: boolean;
}

export function PerformanceControls({ show, available, running }: Props) {
  const { performance } = show;
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
      <ScenePads
        bank={show.bank}
        recall={show.recall}
        performance={performance}
        running={running}
        active={show.activePreset}
      />
      <SequenceControls
        sequence={show.sequence}
        bank={show.bank}
        available={available}
        active={show.activePreset}
      />
      <MidiControls midi={show.midi} />
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
