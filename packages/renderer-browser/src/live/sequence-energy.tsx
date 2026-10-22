import { useState } from 'react';
import { EnergySelectionSchema, type EnergySelection } from '@setcast/core';
import type { LiveSequence } from './sequence.ts';

export function SequenceEnergy({ sequence }: { sequence: LiveSequence }) {
  return (
    <div className="sc-sequence-energy" data-energy-band={sequence.listening.band ?? 'listening'}>
      <label>
        Selection
        <select
          aria-label="Scene selection"
          value={sequence.mode}
          onChange={(event) =>
            sequence.configure(sequence.scenes, sequence.loop, {
              mode: event.target.value as 'ordered' | 'energy',
              energy: sequence.energy,
            })
          }
        >
          <option value="ordered">Ordered</option>
          <option value="energy">Audio energy</option>
        </select>
      </label>
      {sequence.mode === 'energy' && (
        <>
          <p role="status">
            Energy: {sequence.listening.band ?? 'listening'} · {sequence.listening.level.toFixed(2)}
            <meter
              aria-label="Smoothed audio energy"
              min={0}
              max={1}
              value={sequence.listening.level}
            />
          </p>
          <p>
            After minimum dwell, choose a matching scene. “Any” is a fallback. Without a match, keep
            the current scene.
          </p>
          <EnergySettings sequence={sequence} />
        </>
      )}
    </div>
  );
}
function EnergySettings({ sequence }: { sequence: LiveSequence }) {
  const [error, setError] = useState<string | null>(null);
  const change = (key: keyof EnergySelection, value: number) => {
    const parsed = EnergySelectionSchema.safeParse({ ...sequence.energy, [key]: value });
    if (!parsed.success) {
      setError(parsed.error.issues[0]!.message);
      return;
    }
    setError(null);
    sequence.configure(sequence.scenes, sequence.loop, {
      mode: sequence.mode,
      energy: parsed.data,
    });
  };
  return (
    <details>
      <summary>Energy thresholds and timing</summary>
      <div className="sc-performance-timing">
        {(
          [
            ['low', 'Low threshold', 0.01, 0.95, 0.01],
            ['high', 'High threshold', 0.02, 1, 0.01],
            ['hysteresis', 'Energy hysteresis', 0, 0.2, 0.01],
            ['smooth', 'Energy smoothing (s)', 0.1, 30, 0.1],
            ['sustain', 'Energy sustain (s)', 1, 60, 1],
          ] as const
        ).map(([key, label, min, max, step]) => (
          <label key={key}>
            {label}
            <input
              aria-label={label}
              type="number"
              min={min}
              max={max}
              step={step}
              value={sequence.energy[key]}
              onChange={(event) => change(key, event.currentTarget.valueAsNumber)}
            />
          </label>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
export function SceneEnergy({ sequence, index }: { sequence: LiveSequence; index: number }) {
  return (
    <label>
      Energy
      <select
        aria-label={`Scene ${index + 1} energy`}
        value={sequence.scenes[index]!.energy ?? 'any'}
        onChange={(event) =>
          sequence.configure(
            sequence.scenes.map((scene, row) =>
              row === index
                ? { ...scene, energy: event.target.value as 'low' | 'medium' | 'high' | 'any' }
                : scene,
            ),
            sequence.loop,
          )
        }
      >
        <option value="any">Any</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>
    </label>
  );
}
