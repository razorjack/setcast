import type { ComponentType } from 'react';
import type { z } from 'zod';
import { Registry } from '../registry.ts';
import { Spectrum, SpectrumConfigSchema } from './components/Spectrum.tsx';

export interface Visualizer<C = unknown> {
  name: string;
  schema: z.ZodType<C>;
  component: ComponentType<{ config: C }>;
}

export const visualizers = new Registry<Visualizer>('visualizer');

export function defineVisualizer<C>(v: Visualizer<C>): Visualizer<C> {
  visualizers.add(v as Visualizer);
  return v;
}

defineVisualizer({ name: 'spectrum', schema: SpectrumConfigSchema, component: Spectrum });
