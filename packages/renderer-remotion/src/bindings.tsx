import type { RendererBindings } from '@setcast/core/react';
import { continueRender, delayRender, Img, OffthreadVideo, staticFile } from 'remotion';

export const remotionBindings: RendererBindings = {
  name: 'remotion',
  Img: (props) => <Img {...props} />,
  Video: ({ src, className, style }) => (
    <OffthreadVideo src={src} className={className} style={style} />
  ),
  hold: (label) => {
    const handle = delayRender(label);
    return () => continueRender(handle);
  },
  asset: staticFile,
};
