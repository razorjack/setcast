import type { ComponentType } from 'react';
import type { z } from 'zod';
import { SetcastError } from '../errors.ts';
import { resolveVisualizerConfig, visualizers, type VisualizerSpec } from '../visualizers.ts';
import { Radial, RadialConfigSchema } from './components/Radial.tsx';
import { Spectrum, SpectrumConfigSchema } from './components/Spectrum.tsx';

export { visualizers };

/** A spec plus the component that draws it. Registering one completes a schema-only entry. */
export interface Visualizer<C = unknown> extends VisualizerSpec {
  schema: z.ZodType<C>;
  component: ComponentType<{ config: C }>;
}

export function defineVisualizer<C>(v: Visualizer<C>): Visualizer<C> {
  const known = visualizers.has(v.name) ? (visualizers.get(v.name) as Visualizer) : null;
  if (known && !known.component) visualizers.replace(v);
  else visualizers.add(v);
  return v;
}

export function resolveVisualizer(config: { name: string } & Record<string, unknown>) {
  const resolved = resolveVisualizerConfig(config);
  const { component } = visualizers.get(resolved.name) as Visualizer;
  if (!component) {
    throw new SetcastError(
      `Visualizer "${resolved.name}" has no component`,
      'It was registered with a schema only. Register it with `defineVisualizer` from @setcast/core/react.',
    );
  }
  return { Component: component, config: resolved };
}

defineVisualizer({ name: 'spectrum', schema: SpectrumConfigSchema, component: Spectrum });
defineVisualizer({ name: 'radial', schema: RadialConfigSchema, component: Radial });
