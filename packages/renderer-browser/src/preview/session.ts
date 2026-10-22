import { useEffect, useRef, useState } from 'react';
import type { RenderFrame } from '@setcast/core/react';
import type { ExportDriver } from '../export/scene.tsx';
import type { FrameTimings } from '../export/metrics.ts';
import { PreviewQueue, previewFrame } from './queue.ts';

export interface Inspection {
  frame: RenderFrame;
  timings?: FrameTimings;
  windows: number;
}
export function useFramePreview(count: number, fps: number) {
  const [driver, setDriver] = useState<ExportDriver | null>(null);
  const [requested, setRequested] = useState(() =>
    previewFrame(Number(new URLSearchParams(location.search).get('frame')), count),
  );
  const [playing, setPlaying] = useState(false);
  const { inspection, error, busy } = useFrameRequest(driver, requested);
  useEffect(() => {
    if (error) setPlaying(false);
  }, [error]);
  useFramePlayback({ playing, busy, error, requested, count, fps, setPlaying, setRequested });
  const seek = (frame: number) => {
    setPlaying(false);
    setRequested(previewFrame(frame, count));
  };
  return {
    driver,
    setDriver,
    requested,
    inspection,
    error,
    playing,
    setPlaying,
    busy: busy || inspection?.frame.frame !== requested,
    seek,
  };
}
export type FramePreview = ReturnType<typeof useFramePreview>;

export function useReadiness(driver: ExportDriver | null) {
  const [status, setStatus] = useState({ phase: 'initializing', labels: [] as string[] });
  useEffect(() => {
    if (!driver) return;
    const timer = setInterval(
      () => setStatus({ phase: driver.phase, labels: driver.readiness.labels }),
      100,
    );
    return () => clearInterval(timer);
  }, [driver]);
  return status;
}

function useFramePlayback(options: {
  playing: boolean;
  busy: boolean;
  error: string | null;
  requested: number;
  count: number;
  fps: number;
  setPlaying: (value: boolean) => void;
  setRequested: (value: number) => void;
}) {
  const { playing, busy, error, requested, count, fps, setPlaying, setRequested } = options;
  useEffect(() => {
    if (!playing || busy || error) return;
    if (requested === count - 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setRequested(requested + 1), 1000 / fps);
    return () => clearTimeout(timer);
  }, [playing, busy, error, requested, count, fps, setPlaying, setRequested]);
}
async function renderPreviewFrame(driver: ExportDriver, frame: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      driver.frame(frame),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `Frame ${frame} did not become ready within 60 seconds. Check the readiness labels and retry the frame.`,
              ),
            ),
          60_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function useFrameRequest(driver: ExportDriver | null, requested: number) {
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const queue = useRef<PreviewQueue | null>(null);
  useEffect(() => {
    if (!driver) return;
    queue.current = new PreviewQueue(
      (frame) => renderPreviewFrame(driver, frame),
      () => {
        setInspection({
          frame: driver.resolved!,
          timings: driver.timings,
          windows: driver.windows ?? 0,
        });
        setBusy(false);
      },
      (error) => {
        setError(String(error));
        setBusy(false);
      },
    );
    return () => {
      queue.current?.close();
      queue.current = null;
      driver.close();
    };
  }, [driver]);
  useEffect(() => {
    if (!driver) return;
    setBusy(true);
    queue.current!.request(requested);
    const url = new URL(location.href);
    url.searchParams.set('frame', String(requested));
    history.replaceState(null, '', url);
  }, [driver, requested]);
  return { inspection, error, busy };
}
