import { useRef } from 'react';
import type { LiveInput } from './input.ts';
import { BeatControls } from './beat-controls.tsx';

export interface Tempo {
  bpm: number | null;
  beatOffset: number;
}

function ManualTempo({
  tempo,
  setTempo,
  time,
  running,
}: {
  tempo: Tempo;
  setTempo: (tempo: Tempo) => void;
  time: () => number;
  running: boolean;
}) {
  const tap = useTapTempo(time, setTempo);
  return (
    <div className="sc-live-tempo">
      <label>
        Tempo (BPM)
        <input
          aria-label="Tempo (BPM)"
          type="number"
          min="1"
          max="400"
          step="0.1"
          value={tempo.bpm ?? ''}
          onChange={(event) => {
            const bpm = event.currentTarget.valueAsNumber;
            if (!event.currentTarget.value) setTempo({ ...tempo, bpm: null });
            else if (Number.isFinite(bpm) && bpm > 0 && bpm <= 400) setTempo({ ...tempo, bpm });
          }}
        />
      </label>
      <button
        className="sc-button"
        onClick={tap}
        disabled={!running}
        title={running ? undefined : 'Start input to use the capture clock'}
      >
        Tap tempo
      </button>
      <button
        className="sc-button"
        disabled={!tempo.bpm || !running}
        onClick={() => setTempo({ ...tempo, beatOffset: time() })}
      >
        Downbeat now
      </button>
    </div>
  );
}

function useTapTempo(time: () => number, setTempo: (tempo: Tempo) => void) {
  const taps = useRef<number[]>([]);
  return () => {
    const now = time();
    const last = taps.current.at(-1);
    if (last === undefined || now - last > 2 || now <= last) taps.current = [];
    taps.current.push(now);
    taps.current = taps.current.slice(-8);
    if (taps.current.length < 2) return;
    const bpm = (60 * (taps.current.length - 1)) / (now - taps.current[0]!);
    if (bpm <= 400) setTempo({ bpm: Math.round(bpm * 10) / 10, beatOffset: now });
  };
}

export function LiveTempo({
  input,
  tempo,
  setTempo,
}: {
  input: LiveInput;
  tempo: Tempo;
  setTempo: (tempo: Tempo) => void;
}) {
  return (
    <>
      <ManualTempo
        tempo={tempo}
        setTempo={setTempo}
        running={input.snapshot.status.phase === 'running'}
        time={() => input.capture.audio?.capturedTime ?? 0}
      />
      <BeatControls input={input} setTempo={setTempo} />
    </>
  );
}
