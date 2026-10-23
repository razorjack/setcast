import { useEffect, useRef, useState } from 'react';
import type { useDiagnostics } from './diagnostics.tsx';
import type { LiveInput } from './input.ts';
import { adaptQuality, fullQuality } from './quality.ts';
import { useOutputDisplay } from './display.ts';

export function useOutput(
  input: LiveInput,
  diagnostics: ReturnType<typeof useDiagnostics>,
  {
    fps,
    report,
    cleanOutput,
  }: { fps: number; report: (message: string) => void; cleanOutput: () => void },
) {
  const display = useOutputDisplay(report, cleanOutput);
  const [fallback, setFallback] = useState<'black' | 'ambient'>('black');
  const [adaptive, setAdaptive] = useState(true);
  const [quality, setQuality] = useState(fullQuality);
  const sample = diagnostics.sample;
  const consumed = useRef(sample);
  const available = input.snapshot.status.available;
  useEffect(() => {
    const fresh = sample !== consumed.current;
    consumed.current = sample;
    if (!adaptive) {
      setQuality(fullQuality());
      return;
    }
    if (!sample || !sample.available || !available || sample.hidden) {
      setQuality((previous) => adaptQuality(previous, 0, fps, false));
      return;
    }
    if (fresh) setQuality((previous) => adaptQuality(previous, sample.fps, fps, true));
  }, [sample, fps, available, adaptive]);
  return {
    display,
    fallback,
    setFallback,
    adaptive,
    setAdaptive,
    renderScale: adaptive ? quality.scale : 1,
    black: !available && fallback === 'black',
  };
}

export function OutputControls({ output }: { output: ReturnType<typeof useOutput> }) {
  const { display } = output;
  return (
    <details className="sc-output-settings">
      <summary>Output setup{display.active ? ' · Fullscreen' : ' · Windowed'}</summary>
      <div className="sc-output-options">
        <DisplayControls display={display} />
        <label>
          On input loss
          <select
            aria-label="On input loss"
            value={output.fallback}
            onChange={(event) => output.setFallback(event.target.value as 'black' | 'ambient')}
          >
            <option value="black">Black output</option>
            <option value="ambient">Quiet scene</option>
          </select>
        </label>
        <label className="sc-live-check">
          <input
            type="checkbox"
            checked={output.adaptive}
            onChange={(event) => output.setAdaptive(event.target.checked)}
          />
          Adaptive GPU resolution
        </label>
        <span>GPU resolution: {Math.round(output.renderScale * 100)}% of scene setting</span>
      </div>
      {!display.supported && (
        <p>
          Display selection is unavailable. Move the output window to the display, then enter
          fullscreen.
        </p>
      )}
      <p>
        Fullscreen exits keep the output clean. Press H in the output window to reveal controls.
      </p>
    </details>
  );
}

function DisplayControls({ display }: { display: ReturnType<typeof useOutputDisplay> }) {
  return (
    <>
      <button
        className="sc-button"
        disabled={!display.supported}
        onClick={() => void display.discover()}
      >
        Find displays
      </button>
      <label>
        Output display
        <select
          aria-label="Output display"
          value={display.selected}
          onChange={(event) => display.select(event.target.value)}
        >
          <option value="">Current display</option>
          {display.screens.map((screen, index) => (
            <option key={screen.key} value={screen.key}>
              {screen.label || `Display ${index + 1}`} · {screen.width}×{screen.height}
            </option>
          ))}
        </select>
      </label>
      <button className="sc-button" onClick={() => void display.enter()}>
        Restore fullscreen
      </button>
    </>
  );
}
