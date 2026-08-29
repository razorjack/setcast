import { useHoldUntil, type RendererBindings, type VideoProps } from '@setcast/core/react';
import {
  continueRender,
  delayRender,
  Img,
  Loop,
  OffthreadVideo,
  staticFile,
  useVideoConfig,
} from 'remotion';
import { mediaDuration } from './duration.ts';

/** A video's length never changes mid-render, so one read per source is enough. */
const durations = new Map<string, number>();

/** Length of `src` in frames, or null while it is unknown. Holds the frame until it is read. */
function useLoopFrames(src: string | null, fps: number): number | null {
  const ready = useHoldUntil(`duration:${src ?? ''}`, async () => {
    if (src && !durations.has(src)) durations.set(src, await mediaDuration(src));
  });
  if (!src || !ready) return null;

  const seconds = durations.get(src);
  return seconds ? Math.max(1, Math.round(seconds * fps)) : null;
}

/**
 * OffthreadVideo draws the current frame into an `<img>`, so one CSS rule covers image and video
 * backgrounds alike. It cannot repeat by itself; `<Loop>` does, once the length is known.
 */
function RemotionVideo({ src, className, style, loop, muted }: VideoProps) {
  const { fps } = useVideoConfig();
  const frames = useLoopFrames(loop ? src : null, fps);
  const video = <OffthreadVideo src={src} className={className} style={style} muted={muted} />;
  return frames ? (
    <Loop durationInFrames={frames} layout="none">
      {video}
    </Loop>
  ) : (
    video
  );
}

export const remotionBindings: RendererBindings = {
  name: 'remotion',
  // Pass props explicitly: Remotion Studio's visual mode rejects unknown <img> attributes.
  Img: ({ src, className, style }) => <Img src={src} className={className} style={style} />,
  Video: RemotionVideo,
  hold: (label) => {
    const handle = delayRender(label);
    return () => continueRender(handle);
  },
  asset: staticFile,
};
