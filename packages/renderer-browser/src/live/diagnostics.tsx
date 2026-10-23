import { useEffect, useRef, useState } from 'react';
import type { LiveInput } from './input.ts';
import { FrameRateSampler } from './frame-rate.ts';

interface Sample {
  seconds: number;
  fps: number;
  dropped: number;
  cached: number;
  hidden: boolean;
  available: boolean;
  heapBytes: number | null;
}

export function useDiagnostics(input: LiveInput) {
  const latest = useRef(input);
  latest.current = input;
  const samples = useRef<Sample[]>([]);
  const [sample, setSample] = useState<Sample | null>(null);
  useEffect(() => {
    const rates = new FrameRateSampler();
    let request = 0;
    const tick = () => {
      const current = latest.current;
      const fps = rates.sample({
        now: performance.now(),
        frame: current.snapshot.frame,
        source: current.capture.audio,
        available: current.snapshot.status.available,
        hidden: document.hidden,
      });
      if (fps === null) setSample(null);
      if (typeof fps === 'number') {
        const next = diagnosticSample(current, fps);
        samples.current.push(next);
        if (samples.current.length > 7200) samples.current.shift();
        setSample(next);
      }
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, []);
  return { samples, sample };
}

function diagnosticSample(current: LiveInput, fps: number): Sample {
  return {
    seconds: current.capture.audio?.capturedTime ?? 0,
    fps,
    dropped: current.snapshot.status.dropped,
    cached: current.capture.audio?.cachedMoments ?? 0,
    hidden: document.hidden,
    available: current.snapshot.status.available,
    heapBytes:
      (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
        ?.usedJSHeapSize ?? null,
  };
}

export function LiveDiagnostics({
  input,
  fps,
  diagnostics,
}: {
  input: LiveInput;
  fps: number;
  diagnostics: ReturnType<typeof useDiagnostics>;
}) {
  const { samples, sample } = diagnostics;
  const download = () =>
    downloadJson('setcast-diagnostics.json', {
      browser: navigator.userAgent,
      targetFps: fps,
      status: input.snapshot.status,
      pcmCapacity: input.capture.audio?.capacity,
      samples: samples.current,
    });
  return (
    <details className="sc-live-diagnostics">
      <summary>
        Session diagnostics{sample ? ` · ${sample.fps.toFixed(1)} / ${fps} FPS` : ''}
      </summary>
      <p>
        Rendered frame updates, skipped analysis samples and cache use. Last two hours retained.
        This does not measure physical audio/display latency.
      </p>
      <button className="sc-button" onClick={download}>
        Download diagnostics
      </button>
    </details>
  );
}

export function downloadJson(name: string, contents: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(contents, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
