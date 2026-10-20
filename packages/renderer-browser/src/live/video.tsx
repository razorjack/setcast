import { useEffect, useRef, useState, type RefObject } from 'react';
import { resolveFit } from '@setcast/core';
import { useFrame, useRenderer, type VideoProps } from '@setcast/core/react';

/** Background video runs silently while capture continues, including during asset preparation. */
export function LiveVideo({ src, fit, style, className, loop }: VideoProps) {
  const video = useRef<HTMLVideoElement>(null);
  const objectFit = useLiveVideo(video, src, fit);
  return (
    <video
      ref={video}
      src={src}
      className={className}
      style={{ ...style, objectFit }}
      loop={loop}
      muted
      playsInline
      preload="auto"
    />
  );
}

function useLiveVideo(
  video: RefObject<HTMLVideoElement | null>,
  src: string,
  fit: VideoProps['fit'],
) {
  const { composition } = useFrame();
  const { width, height } = composition;
  const { hold } = useRenderer();
  const [objectFit, setFit] = useState<'cover' | 'contain'>('cover');
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    const element = video.current!;
    const release = hold(`video:${src}`);
    const loaded = () => {
      setFit(
        resolveFit(
          fit ?? 'cover',
          { width: element.videoWidth, height: element.videoHeight },
          { width, height },
        ),
      );
      void element.play().catch((cause: unknown) => {
        setError(
          new Error(`Cannot play background video ${src}. Choose a supported MP4 or WebM.`, {
            cause,
          }),
        );
      });
      release();
    };
    const failed = () => {
      release();
      setError(new Error(`Cannot load background video ${src}. Choose a supported MP4 or WebM.`));
    };
    element.addEventListener('loadeddata', loaded);
    element.addEventListener('error', failed);
    if (element.readyState >= 2) loaded();
    return () => {
      element.removeEventListener('loadeddata', loaded);
      element.removeEventListener('error', failed);
      element.pause();
      release();
    };
  }, [video, src, fit, width, height, hold]);
  if (error) throw error;
  return objectFit;
}
