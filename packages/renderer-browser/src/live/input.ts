import { useCallback, useEffect, useState } from 'react';
import { errorMessage, silentAnalyzer, type ResolvedLiveProject } from '@setcast/core';
import { LiveCapture } from './capture.ts';

export function useLiveInput(initial: ResolvedLiveProject) {
  const [capture] = useState(() => new LiveCapture());
  const [settings, setSettings] = useState(initial.live.input);
  const [snapshot, setSnapshot] = useState(() => ({
    status: capture.status,
    analyzer: capture.audio ?? silentAnalyzer,
    frame: 0,
  }));
  useEffect(() => {
    let request = 0;
    const tick = () => {
      capture.checkHealth();
      const time = Math.max(0, (capture.audio?.time ?? 0) - settings.delay);
      setSnapshot((previous) => ({
        status: capture.status,
        analyzer: capture.status.available ? capture.audio! : silentAnalyzer,
        frame: capture.audio ? Math.floor(time * initial.fps) : previous.frame,
      }));
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [capture, initial.fps, settings.delay]);
  useEffect(() => () => capture.stop(), [capture]);

  const configure = (next: typeof settings) => {
    if (capture.status.phase === 'running' && next.device !== settings.device) capture.stop();
    const reroute =
      next.gain !== settings.gain || String(next.channels) !== String(settings.channels);
    if (capture.status.phase === 'running' && reroute) {
      capture.route(next.channels ?? capture.status.selected!, next.gain);
    }
    setSettings(next);
  };
  return { capture, settings, configure, snapshot };
}

export type LiveInput = ReturnType<typeof useLiveInput>;

export function useInputDevices(report: (message: string) => void, phase: string) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices) return;
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((device) => device.kind === 'audioinput'));
    } catch (error) {
      report(`Cannot list audio inputs: ${errorMessage(error)}. Check browser permissions.`);
    }
  }, [report]);
  useEffect(() => {
    void refresh();
    navigator.mediaDevices?.addEventListener('devicechange', refresh);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', refresh);
  }, [refresh]);
  useEffect(() => {
    if (phase === 'running') void refresh();
  }, [phase, refresh]);
  return { devices, refresh };
}
