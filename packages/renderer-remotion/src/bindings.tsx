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
import { resolveFit } from '@setcast/core';
import { videoInfo, type VideoInfo } from './media.ts';

const videos = new Map<string, VideoInfo>();

function RemotionVideo({ src, className, style, loop, muted, fit }: VideoProps) {
  const { fps, width, height } = useVideoConfig();
  const ready = useHoldUntil(`video:${src}`, async () => {
    if (!videos.has(src)) videos.set(src, await videoInfo(src));
  });
  const info = ready ? videos.get(src) : undefined;
  if (!info) return null;
  const objectFit = fit ? resolveFit(fit, info, { width, height }) : undefined;
  const video = (
    <>
      {objectFit === 'contain' && (
        <OffthreadVideo
          src={src}
          className={className}
          muted
          style={{
            ...style,
            objectFit: 'cover',
            filter: 'blur(30px) brightness(0.6)',
            scale: '1.1',
          }}
        />
      )}
      <OffthreadVideo
        src={src}
        className={className}
        style={{ ...style, ...(objectFit ? { objectFit } : {}) }}
        muted={muted}
      />
    </>
  );
  return loop ? (
    <Loop durationInFrames={Math.max(1, Math.round(info.duration * fps))} layout="none">
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
