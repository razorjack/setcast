import { createElement } from 'react';
import { Img, useFrame } from '@setcast/core/react';

export default function Marker({ config }) {
  const { frame } = useFrame();
  return createElement(
    'div',
    {
      'data-plugin-fixture': config.label,
      'data-frame': frame,
      style: { position: 'absolute', inset: 0, zIndex: 100, pointerEvents: 'none' },
    },
    createElement('div', {
      style: {
        position: 'absolute',
        left: 16 + (frame % 10),
        top: 16,
        width: 32,
        height: 32,
        background: '#00ff00',
      },
    }),
    config.image
      ? createElement(Img, {
          src: config.image,
          style: {
            position: 'absolute',
            left: 64,
            top: 16,
            width: 32,
            height: 32,
          },
        })
      : null,
    createElement(
      'span',
      { style: { position: 'absolute', left: 110, top: 16, color: 'white' } },
      config.label,
    ),
  );
}
