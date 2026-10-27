import { useEffect, useRef, useState } from 'react';
import { ALL_FORMATS, CanvasSink, Input, UrlSource } from 'mediabunny';
import { resolveFit } from '@setcast/core';
import { useFrame, useHoldUntil, type VideoProps } from '@setcast/core/react';

export function ExportVideo({ src, style, className, fit, loop }: VideoProps) {
  const { frame, fps, composition } = useFrame();
  const decoder = useRef<VideoDecoder | null>(null);
  const [image, setImage] = useState<{ src: string; width: number; height: number } | null>(null);
  useEffect(
    () => () => {
      decoder.current?.input.dispose();
      decoder.current = null;
    },
    [src],
  );
  const ready = useHoldUntil(`video:${src}:${frame}`, async () => {
    if (!decoder.current) decoder.current = await openVideo(src);
    setImage(await decodeFrame(decoder.current, src, { frame, fps, loop }));
  });
  if (!ready || !image) return null;
  const objectFit = fit ? resolveFit(fit, image, composition) : undefined;
  return (
    <>
      {objectFit === 'contain' && (
        <img
          src={image.src}
          className={className}
          style={{
            ...style,
            objectFit: 'cover',
            filter: 'blur(30px) brightness(0.6)',
            scale: '1.1',
          }}
        />
      )}
      <img
        src={image.src}
        className={className}
        style={{ ...style, ...(objectFit ? { objectFit } : {}) }}
      />
    </>
  );
}

async function decodeFrame(
  decoder: VideoDecoder,
  src: string,
  { frame, fps, loop }: { frame: number; fps: number; loop?: boolean },
) {
  const { sink, duration } = decoder;
  const length = Math.max(1, Math.round(duration * fps));
  const time = loop
    ? (frame % length) / fps
    : Math.min(frame / fps, Math.max(0, duration - 0.000001));
  const decoded = await sink.getCanvas(time);
  if (!decoded) throw new Error(`No decoded video frame for ${src} at ${time}s.`);
  const canvas = document.createElement('canvas');
  canvas.width = decoded.canvas.width;
  canvas.height = decoded.canvas.height;
  canvas.getContext('2d')!.drawImage(decoded.canvas, 0, 0);
  const image = {
    src: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
  };
  return image;
}

interface VideoDecoder {
  input: Input;
  duration: number;
  sink: CanvasSink;
}

async function openVideo(src: string): Promise<VideoDecoder> {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new UrlSource(src, { maxCacheSize: 16 * 1024 * 1024 }),
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode()))
      throw new Error(`Cannot decode video ${src}. Re-export it as H.264 MP4 or WebM.`);
    const duration = await track.computeDuration();
    return { input, duration, sink: new CanvasSink(track, { poolSize: 1 }) };
  } catch (error) {
    input.dispose();
    throw error;
  }
}
