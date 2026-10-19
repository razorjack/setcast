import { useEffect, useRef, useState, type RefObject } from 'react';
import type { AudioAnalyzer, ResolvedProject } from '@setcast/core';
import { playbackFrame, Transport } from '../transport.ts';
import type { AnalysisWindows } from '../windows.ts';
import { openAnalysis } from './decode.ts';
import { assetUrl } from './url.ts';

export interface PlaybackSnapshot {
  frame: number;
  time: number;
  analyzer: AudioAnalyzer | null;
  playing: boolean;
  running: boolean;
  waiting: boolean;
  error: string | null;
  windows: number;
}

export function usePlayback(project: ResolvedProject) {
  const [audio] = useState(() => new Audio());
  const [transport] = useState(() => new Transport(audio, project.mix.duration / 1_000_000));
  const windows = useRef<AnalysisWindows | null>(null);
  const [snapshot, setSnapshot] = useState<PlaybackSnapshot>({
    frame: 0,
    time: 0,
    analyzer: null,
    playing: false,
    running: false,
    waiting: true,
    error: null,
    windows: 0,
  });

  useSource(audio, transport, project.audio, windows);
  useClock({ audio, project, transport, windows, setSnapshot });
  return { audio, transport, snapshot };
}

function useSource(
  audio: HTMLAudioElement,
  transport: Transport,
  path: string,
  windows: RefObject<AnalysisWindows | null>,
) {
  useEffect(() => {
    let disposed = false;
    let close = () => {};
    audio.src = assetUrl(path);
    audio.preload = 'auto';
    audio.hidden = true;
    audio.dataset.setcastAudio = '';
    document.body.append(audio);
    const failed = () =>
      transport.fail(
        new Error(`Cannot play ${path}. Try current Chrome or re-export the audio as WAV.`),
      );
    audio.addEventListener('error', failed);
    void openAnalysis(audio.src, transport.duration).then(
      (analysis) => {
        if (disposed) {
          analysis.dispose();
          return;
        }
        close = analysis.dispose;
        windows.current = analysis.windows;
      },
      (error: unknown) => {
        if (!disposed) transport.fail(error);
      },
    );
    return () => {
      disposed = true;
      transport.pause();
      audio.removeEventListener('error', failed);
      audio.removeAttribute('src');
      audio.load();
      audio.remove();
      close();
      windows.current = null;
    };
  }, [audio, path, transport, windows]);
}

function useClock({
  audio,
  project,
  transport,
  windows,
  setSnapshot,
}: {
  audio: HTMLAudioElement;
  project: ResolvedProject;
  transport: Transport;
  windows: RefObject<AnalysisWindows | null>;
  setSnapshot: React.Dispatch<React.SetStateAction<PlaybackSnapshot>>;
}) {
  useEffect(() => {
    let request = 0;
    let pending: Promise<void> | null = null;
    const tick = () => {
      const frame = playbackFrame(audio.currentTime, project.mix.duration, project.fps);
      const time = frame / project.fps;
      const analyzer = windows.current?.at(time) ?? null;
      transport.update(analyzer !== null);
      if (windows.current && !transport.error) {
        const preparation = analyzer
          ? windows.current.prefetch(time, transport.duration)
          : windows.current.prepare(time);
        if (preparation !== pending) {
          pending = preparation;
          void preparation.catch((error: unknown) => transport.fail(error));
        }
      }
      setSnapshot((previous) => ({
        frame: analyzer ? frame : previous.frame,
        time: audio.currentTime,
        analyzer: analyzer ?? previous.analyzer,
        playing: transport.wanted,
        running: !audio.paused,
        waiting: !analyzer || transport.waiting,
        error: transport.error,
        windows: windows.current?.size ?? 0,
      }));
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [audio, project, transport, windows, setSnapshot]);
}
