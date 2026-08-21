import type { ComponentType } from 'react';
import type { z } from 'zod';
import { Registry } from '../registry.ts';
import { resolveVisualizerConfig } from '../visualizers.ts';
import { Radial, RadialConfigSchema } from './components/Radial.tsx';
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

export function resolveVisualizer(config: { name: string } & Record<string, unknown>) {
  const resolved = resolveVisualizerConfig(config);
  return { Component: visualizers.get(resolved.name).component, config: resolved };
}

defineVisualizer({ name: 'spectrum', schema: SpectrumConfigSchema, component: Spectrum });
defineVisualizer({ name: 'radial', schema: RadialConfigSchema, component: Radial });
