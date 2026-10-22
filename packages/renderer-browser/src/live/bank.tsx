import { useCallback, useEffect, useRef, useState } from 'react';
import type { ResolvedLiveProject } from '@setcast/core';
import type { LivePerformance } from './performance.ts';
import type { Tempo } from './tempo.tsx';

interface SceneListing {
  preset: string;
  title: string;
}
export function useSceneBank(report: (message: string) => void) {
  const [scenes, setScenes] = useState<SceneListing[]>([]);
  const latest = useRef(0);
  const refresh = useCallback(() => {
    const request = ++latest.current;
    void sceneRequest<SceneListing[]>('/scenes.json').then(
      (list) => {
        if (request === latest.current) setScenes(list);
      },
      (error: unknown) => report(String(error)),
    );
  }, [report]);
  useEffect(() => {
    refresh();
    window.addEventListener('setcast-scenes-changed', refresh);
    return () => window.removeEventListener('setcast-scenes-changed', refresh);
  }, [refresh]);
  return { scenes, refresh };
}

async function sceneRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.message ?? 'Cannot recall scenes. Check the saved scene directories.');
  return result;
}

export function useSceneRecall(options: {
  capture: object | null;
  performance: LivePerformance;
  tempo: Tempo;
  report: (message: string) => void;
}) {
  const [duration, setDuration] = useState(1);
  const [quantized, setQuantized] = useState(true);
  const request = useSceneRequest(options.capture, options.report);
  const cancelPending = () => {
    request.cancel();
    if (options.performance.transition?.phase === 'queued') options.performance.cancel();
  };
  const recall = async (preset: string) => {
    const project = await request.load(preset);
    if (!project) return false;
    return options.performance.queue(preset, project, { ...options.tempo, duration, quantized });
  };
  return {
    duration,
    setDuration,
    quantized,
    setQuantized,
    loading: request.loading,
    recall,
    cancelPending,
  };
}

function useSceneRequest(capture: object | null, report: (message: string) => void) {
  const [loading, setLoading] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const cancel = () => {
    controller.current?.abort();
    setLoading(null);
  };
  useEffect(() => {
    setLoading(null);
    return () => controller.current?.abort();
  }, [capture]);
  const load = async (preset: string) => {
    cancel();
    const current = new AbortController();
    controller.current = current;
    setLoading(preset);
    try {
      const project = await sceneRequest<ResolvedLiveProject>(
        `/scene.json?preset=${encodeURIComponent(preset)}`,
        AbortSignal.any([current.signal, AbortSignal.timeout(15_000)]),
      );
      return current.signal.aborted ? null : project;
    } catch (error) {
      if (!current.signal.aborted)
        report(`Cannot load scene ${preset}: ${String(error)}. Check the saved scene and retry.`);
      return null;
    } finally {
      if (controller.current === current) setLoading(null);
    }
  };
  return { loading, load, cancel };
}

export function SceneBank({
  bank,
  recall,
  performance,
  running,
  active,
}: {
  bank: ReturnType<typeof useSceneBank>;
  recall: ReturnType<typeof useSceneRecall>;
  performance: LivePerformance;
  running: boolean;
  active: string | null;
}) {
  return (
    <div className="sc-performance-bank">
      <SceneTiming recall={recall} refresh={bank.refresh} />
      <div className="sc-scene-pads">
        {bank.scenes.map((scene, index) => (
          <button
            key={scene.preset}
            className="sc-button"
            aria-pressed={active === scene.preset}
            disabled={
              !running ||
              Boolean(performance.transition && performance.transition.phase !== 'queued')
            }
            onClick={() => void recall.recall(scene.preset)}
            title={scene.preset}
          >
            <span>{index + 1}</span>
            {scene.title}
            {(recall.loading === scene.preset || performance.transition?.preset === scene.preset) &&
              ' · Queued'}
          </button>
        ))}
      </div>
      {!bank.scenes.length && (
        <p>Use Save scene to add the current look. Saved live scenes appear here.</p>
      )}
      {!running && <p>Start input to recall scenes on the capture clock.</p>}
      {performance.transition && ['queued', 'out'].includes(performance.transition.phase) && (
        <button className="sc-button" onClick={performance.cancel}>
          Cancel transition
        </button>
      )}
    </div>
  );
}

function SceneTiming({
  recall,
  refresh,
}: {
  recall: ReturnType<typeof useSceneRecall>;
  refresh: () => void;
}) {
  return (
    <div className="sc-performance-timing">
      <strong>Scenes</strong>
      <label>
        Fade through black{' '}
        <select
          aria-label="Scene transition"
          value={recall.duration}
          onChange={(event) => recall.setDuration(Number(event.target.value))}
        >
          <option value={0}>Cut</option>
          <option value={0.5}>0.5 s</option>
          <option value={1}>1 s</option>
          <option value={2}>2 s</option>
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={recall.quantized}
          onChange={(event) => recall.setQuantized(event.target.checked)}
        />
        Start on next bar
      </label>
      <button className="sc-button" onClick={refresh}>
        Refresh scenes
      </button>
    </div>
  );
}
