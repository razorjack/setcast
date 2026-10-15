import type { RenderMediaOptions } from '@remotion/renderer';
import type { ResolvedProject } from '@setcast/core';

export interface Variant {
  name: string;
  render?: Partial<RenderMediaOptions>;
  project?: Partial<ResolvedProject>;
}

export const variants: Variant[] = [
  { name: 'baseline' },
  { name: 'serial', render: { disallowParallelEncoding: true } },
  { name: 'concurrency-1', render: { concurrency: 1 } },
  { name: 'concurrency-2', render: { concurrency: 2 } },
  { name: 'concurrency-8', render: { concurrency: 8 } },
  { name: 'jpeg-92', render: { jpegQuality: 92 } },
  { name: 'jpeg-90', render: { jpegQuality: 90 } },
  { name: 'veryfast', render: { x264Preset: 'veryfast', hardwareAcceleration: 'disable' } },
  {
    name: 'hardware-12m',
    render: { crf: null, videoBitrate: '12M', hardwareAcceleration: 'required' },
  },
  { name: 'fps-30', project: { fps: 30 } },
  { name: 'fps-24', project: { fps: 24 } },
  { name: 'scale-75', render: { scale: 0.75 } },
  {
    name: 'jpeg-92-veryfast',
    render: { jpegQuality: 92, x264Preset: 'veryfast', hardwareAcceleration: 'disable' },
  },
];
