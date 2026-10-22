import { useEffect, useRef, useState } from 'react';
import type { LiveInput } from './input.ts';

interface Sample {
  seconds: number;
  fps: number;
  dropped: number;
  cached: number;
  hidden: boolean;
  heapBytes: number | null;
}

export function useDiagnostics(input: LiveInput) {
  const latest = useRef(input);
  latest.current = input;
  const samples = useRef<Sample[]>([]);
  const [sample, setSample] = useState<Sample | null>(null);
  useEffect(() => {
    let previous = performance.now();
    let frame = -1;
    let frames = 0;
    let request = 0;
    const tick = () => {
      const current = latest.current;
      if (current.snapshot.frame !== frame) frames++;
      frame = current.snapshot.frame;
      const now = performance.now();
      if (now - previous >= 1000) {
        const next = {
          seconds: current.capture.audio?.capturedTime ?? 0,
          fps: (frames * 1000) / (now - previous),
          dropped: current.snapshot.status.dropped,
          cached: current.capture.audio?.cachedMoments ?? 0,
          hidden: document.hidden,
          heapBytes:
            (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
              ?.usedJSHeapSize ?? null,
        };
        samples.current.push(next);
        if (samples.current.length > 7200) samples.current.shift();
        setSample(next);
        previous = now;
        frames = 0;
      }
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, []);
  return { samples, sample };
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
