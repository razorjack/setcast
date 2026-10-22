import { SequenceControls } from './sequence-controls.tsx';
import type { LiveSequence } from './sequence.ts';
import { useEffect, useRef, useState } from 'react';
import { SceneBank, type useSceneBank, type useSceneRecall } from './bank.tsx';
import type { LivePerformance } from './performance.ts';
import type { useMidi, MidiAction } from './midi.ts';

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

function MidiControls({ midi }: { midi: ReturnType<typeof useMidi> }) {
  return (
    <details className="sc-performance-midi">
      <summary>
        MIDI controls
        {midi.selected && !midi.devices.some((device) => device.id === midi.selected)
          ? ' · Disconnected'
          : ''}
      </summary>
      <p>
        Default channel 1: CC 1 intensity, CC 7 brightness, notes 36–43 scenes, note 44 blackout,
        note 45 branding, note 46 messages. Learn replaces a mapping; Reset adds new defaults to
        saved mappings. Audio stays in the output window.
      </p>
      {!midi.connected && (
        <button
          className="sc-button"
          disabled={midi.connecting}
          onClick={() => void midi.connect()}
        >
          Connect MIDI
        </button>
      )}
      {midi.connected && <MidiMappingControls midi={midi} />}
      {midi.learning && <p role="status">Move or press the controller for {midi.learning}.</p>}
    </details>
  );
}

function MidiMappingControls({ midi }: { midi: ReturnType<typeof useMidi> }) {
  const [target, setTarget] = useState<MidiAction>('intensity');
  const choices: MidiAction[] = [
    'intensity',
    'brightness',
    'blackout',
    'branding',
    'messages',
    ...Array.from({ length: 8 }, (_, index) => `scene-${index + 1}` as const),
  ];
  return (
    <div className="sc-performance-timing">
      <label>
        MIDI input
        <select
          aria-label="MIDI input"
          value={midi.selected}
          onChange={(event) => midi.select(event.target.value)}
        >
          <option value="">Choose input</option>
          {midi.devices.map((device) => (
            <option key={device.id} value={device.id}>
              {device.name ?? device.id}
            </option>
          ))}
        </select>
      </label>
      <label>
        Control
        <select value={target} onChange={(event) => setTarget(event.target.value as MidiAction)}>
          {choices.map((choice) => (
            <option key={choice}>{choice}</option>
          ))}
        </select>
      </label>
      <button
        className="sc-button"
        disabled={!midi.selected}
        onClick={() => midi.learn(midi.learning ? null : target)}
      >
        {midi.learning ? 'Cancel learning' : 'Learn MIDI'}
      </button>
      <button className="sc-button" onClick={midi.reset}>
        Reset MIDI mappings
      </button>
    </div>
  );
}
