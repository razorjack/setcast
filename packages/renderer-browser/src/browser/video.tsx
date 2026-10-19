import { createContext, useContext, useEffect, useRef, useState, type RefObject } from 'react';
import { resolveFit, type BackgroundFit } from '@setcast/core';
import { useFrame, type VideoProps } from '@setcast/core/react';
import type { Transport } from '../transport.ts';

export const TransportContext = createContext<{ transport: Transport; running: boolean } | null>(
  null,
);

export function BrowserVideo(props: VideoProps) {
  const { src, className, style, fit, muted, loop = false } = props;
  const { transport, running } = useContext(TransportContext)!;
  const {
    timeSeconds,
    composition: { width, height },
  } = useFrame();
  const video = useRef<HTMLVideoElement>(null);
  const { objectFit, ready } = useVideoReady({ video, transport, src, fit, width, height });
  useEffect(() => {
    synchronizeVideo(video.current!, { timeSeconds, loop, running }, transport);
  }, [timeSeconds, transport, loop, running, ready]);

  return (
    <>
      {objectFit === 'contain' && (
        <BrowserVideo
          {...props}
          fit="cover"
          muted
          style={{ ...style, filter: 'blur(30px) brightness(0.6)', scale: '1.1' }}
        />
      )}
      <video
        ref={video}
        src={src}
        className={className}
        style={{ ...style, ...(fit ? { objectFit } : {}) }}
        loop={loop}
        muted={muted}
        playsInline
        preload="auto"
      />
    </>
  );
}

function useVideoReady({
  video,
  transport,
  src,
  fit,
  width,
  height,
}: {
  video: RefObject<HTMLVideoElement | null>;
  transport: Transport;
  src: string;
  fit?: BackgroundFit;
  width: number;
  height: number;
}) {
  const [objectFit, setFit] = useState<'contain' | 'cover'>('cover');
  const [ready, setReady] = useState(0);
  useEffect(() => {
    const element = video.current!;
    const release = transport.hold(`video:${src}`);
    const loaded = () => {
      setReady((revision) => revision + 1);
      setFit(
        resolveFit(
          fit ?? 'cover',
          { width: element.videoWidth, height: element.videoHeight },
          { width, height },
        ),
      );
      release();
    };
    const failed = () => {
      release();
      transport.fail(
        new Error(`Cannot play background video ${src}. Re-export it as a supported MP4 or WebM.`),
      );
    };
    element.addEventListener('loadeddata', loaded);
    element.addEventListener('error', failed);
    if (element.readyState >= 2) loaded();
    return () => {
      release();
      element.pause();
      element.removeEventListener('loadeddata', loaded);
      element.removeEventListener('error', failed);
    };
  }, [video, transport, src, fit, width, height]);
  return { objectFit, ready };
}

function synchronizeVideo(
  element: HTMLVideoElement,
  { timeSeconds, loop, running }: { timeSeconds: number; loop: boolean; running: boolean },
  transport: Transport,
) {
  if (!Number.isFinite(element.duration) || element.duration <= 0) return;
  const target = loop
    ? timeSeconds % element.duration
    : Math.min(timeSeconds, Math.max(0, element.duration - 0.001));
  if (Math.abs(element.currentTime - target) > (running ? 0.12 : 0.001))
    element.currentTime = target;
  if (!running) {
    element.pause();
    return;
  }
  if (element.paused)
    void element.play().catch((error: unknown) => {
      if (
        !transport.media.paused &&
        !(error instanceof DOMException && error.name === 'AbortError')
      )
        transport.fail(error);
    });
}
