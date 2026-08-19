import type { RendererBindings } from '@setcast/core/react';
import { continueRender, delayRender, Img, OffthreadVideo, staticFile } from 'remotion';

export const remotionBindings: RendererBindings = {
  name: 'remotion',
  // Pass props explicitly: Remotion Studio's visual mode rejects unknown <img> attributes.
  Img: ({ src, className, style }) => <Img src={src} className={className} style={style} />,
  Video: ({ src, className, style }) => (
    <OffthreadVideo src={src} className={className} style={style} />
  ),
  hold: (label) => {
    const handle = delayRender(label);
    return () => continueRender(handle);
  },
  asset: staticFile,
};
