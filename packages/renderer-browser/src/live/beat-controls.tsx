import { useEffect, useState } from 'react';
import type { LiveInput } from './input.ts';
import type { Tempo } from './tempo.tsx';
import { BeatTracker } from './beat-tracker.ts';
import { validBeatRange, type BeatRange, type BeatTrackingConfig } from '@setcast/core';

export function BeatControls({
  input,
  setTempo,
  initial,
}: {
  input: LiveInput;
  setTempo: (tempo: Tempo) => void;
  initial?: BeatTrackingConfig;
}) {
  const { enabled, setEnabled, range, tracker, changeRange } = useBeatTracker(input, initial);
  const available = input.snapshot.status.available;
  return (
    <details className="sc-beat-tracking" data-beat-state={enabled ? tracker.state : 'off'}>
      <summary>Beat tracking · {enabled ? tracker.state : 'Off'}</summary>
      <label className="sc-live-check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />{' '}
        Estimate beats from input
      </label>
      <BeatRangeControls range={range} change={changeRange} />
      {enabled && <BeatStatus tracker={tracker} />}
      <button
        className="sc-button"
        disabled={!enabled || !available || !validBeatRange(range) || tracker.state !== 'locked'}
        onClick={() => {
          if (tracker.state !== 'locked' || !tracker.estimate) return;
          setTempo({ bpm: tracker.estimate.bpm, beatOffset: tracker.estimate.beatOffset });
          setEnabled(false);
        }}
      >
        Use detected beat grid
      </button>
      <p>
        Detection does not change the output. Apply a locked estimate, then use Downbeat now to
        align bars. Tap tempo and manual BPM remain available.
      </p>
    </details>
  );
}

function BeatRangeControls({
  range,
  change,
}: {
  range: BeatRange;
  change: (range: BeatRange) => void;
}) {
  return (
    <div className="sc-beat-range">
      {(['min', 'max'] as const).map((key) => (
        <label key={key}>
          {key === 'min' ? 'Minimum' : 'Maximum'} BPM
          <input
            aria-label={`${key === 'min' ? 'Minimum' : 'Maximum'} detected BPM`}
            type="number"
            min="40"
            max="240"
            value={Number.isFinite(range[key]) ? range[key] : ''}
            onChange={(event) => change({ ...range, [key]: event.currentTarget.valueAsNumber })}
          />
        </label>
      ))}
      {!validBeatRange(range) && <p role="alert">Choose 40–240 BPM, at least 10 BPM apart.</p>}
    </div>
  );
}

function BeatStatus({ tracker }: { tracker: BeatTracker }) {
  const estimate = tracker.estimate;
  return (
    <div role="status">
      <p>
        {estimate
          ? `${estimate.bpm.toFixed(1)} BPM · evidence ${(estimate.confidence * 100).toFixed(0)}%`
          : 'Listening'}{' '}
        · {tracker.reason}
      </p>
      <meter aria-label="Beat evidence" min="0" max="1" value={estimate?.confidence ?? 0} />
    </div>
  );
}

function useBeatTracker(input: LiveInput, initial?: BeatTrackingConfig) {
  const [enabled, setEnabled] = useState(false);
  const [range, setRange] = useState<BeatRange>(initial?.range ?? { min: 90, max: 180 });
  const [tracker] = useState(() => {
    const tracker = new BeatTracker();
    tracker.configure(range);
    return tracker;
  });
  const audio = input.capture.audio;
  const available = input.snapshot.status.available;
  useEffect(() => {
    tracker.reset();
  }, [tracker, audio, enabled, input.settings.gain, input.settings.channels]);
  useEffect(() => {
    if (enabled && available && audio && validBeatRange(range)) tracker.update(audio);
    else tracker.reset();
  });
  const changeRange = (next: BeatRange) => {
    setRange(next);
    if (validBeatRange(next)) tracker.configure(next);
    else tracker.reset();
  };
  return { enabled, setEnabled, range, tracker, changeRange };
}
