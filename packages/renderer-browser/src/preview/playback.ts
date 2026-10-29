import { useEffect, useState, type RefObject } from 'react';
import { framesWithinMix, toSeconds, type ResolvedProject } from '@setcast/core';
import { Transport, playbackFrame } from '../transport.ts';
import { assetUrl } from '../player/url.ts';
import { previewFrame } from './queue.ts';
import type { FramePreview } from './frame-preview.ts';

type Mode = 'audio' | 'frames';
export interface PreviewPreferences {
  mode: Mode;
  volume: number;
}
interface AudioState {
  playing: boolean;
  waiting: boolean;
  error: string | null;
}

export function usePreviewPlayback(
  project: ResolvedProject,
  frames: FramePreview,
  preferences: RefObject<PreviewPreferences>,
) {
  const [audio] = useState(() =>
    Object.assign(new Audio(), { volume: preferences.current.volume }),
  );
  const [transport] = useState(() => new Transport(audio, toSeconds(project.mix.duration)));
  const settings = usePlaybackPreferences(preferences, audio);
  usePreviewAudio(audio, transport, project.audio);
  const state = useAudioClock(project, transport, frames);
  const pause = () => {
    frames.setPlaying(false);
    const wasPlaying = transport.wanted;
    transport.pause();
    if (wasPlaying)
      frames.seek(playbackFrame(audio.currentTime, project.mix.duration, project.fps));
  };
  const setPlaying = (playing: boolean) => {
    if (!playing) return pause();
    if (frames.busy || frames.error || !frames.driver) return;
    if (settings.mode === 'frames') return frames.setPlaying(true);
    if (state.error) return;
    if (playbackFrame(audio.currentTime, project.mix.duration, project.fps) !== frames.requested)
      transport.seek(frames.requested / project.fps);
    transport.update(true);
    transport.play();
  };
  return {
    ...frames,
    ...settings,
    playing: settings.mode === 'audio' ? state.playing : frames.playing,
    audioError: frames.error ? null : state.error,
    audioWaiting: settings.mode === 'audio' && state.playing && state.waiting,
    setPlaying,
    seek: (frame: number) => {
      pause();
      const next = previewFrame(frame, framesWithinMix(project.mix.duration, project.fps));
      transport.seek(next / project.fps);
      frames.seek(next);
    },
    setMode: (next: Mode) => {
      pause();
      settings.setMode(next);
    },
  };
}
export type MusicalPreview = ReturnType<typeof usePreviewPlayback>;

function usePlaybackPreferences(
  preferences: RefObject<PreviewPreferences>,
  audio: HTMLAudioElement,
) {
  const [value, setValue] = useState(preferences.current);
  return {
    ...value,
    setMode: (mode: Mode) => {
      preferences.current = { ...preferences.current, mode };
      setValue(preferences.current);
    },
    setVolume: (volume: number) => {
      audio.volume = volume;
      preferences.current = { ...preferences.current, volume };
      setValue(preferences.current);
    },
  };
}

function usePreviewAudio(audio: HTMLAudioElement, transport: Transport, path: string) {
  useEffect(() => {
    audio.src = assetUrl(path);
    audio.preload = 'auto';
    audio.hidden = true;
    audio.dataset.setcastPreviewAudio = '';
    document.body.append(audio);
    const failed = () =>
      transport.fail(new Error(`Cannot play ${path}. Check the source audio and retry the frame.`));
    audio.addEventListener('error', failed);
    return () => {
      transport.pause();
      audio.removeEventListener('error', failed);
      audio.removeAttribute('src');
      audio.load();
      audio.remove();
    };
  }, [audio, transport, path]);
}

function useAudioClock(project: ResolvedProject, transport: Transport, frames: FramePreview) {
  const [state, setState] = useState<AudioState>({ playing: false, waiting: false, error: null });
  const { request, error } = frames;
  useEffect(() => {
    if (error) transport.fail(error);
  }, [transport, error]);
  useEffect(() => {
    let scheduled = 0;
    const tick = () => {
      const wasPlaying = transport.wanted;
      transport.update(true);
      if (wasPlaying)
        request(playbackFrame(transport.media.currentTime, project.mix.duration, project.fps));
      const next = {
        playing: transport.wanted,
        waiting: transport.waiting,
        error: transport.error,
      };
      setState((previous) =>
        previous.playing === next.playing &&
        previous.waiting === next.waiting &&
        previous.error === next.error
          ? previous
          : next,
      );
      scheduled = requestAnimationFrame(tick);
    };
    scheduled = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(scheduled);
  }, [project, transport, request]);
  return state;
}
