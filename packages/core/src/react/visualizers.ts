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

export function defineVisualizer<C>(visualizer: Visualizer<C>): Visualizer<C> {
  if (completesSchemaOnlyEntry(visualizer.name)) visualizers.replace(visualizer);
  else visualizers.add(visualizer);
  return visualizer;
}

/** `@setcast/core` registers a name with its schema alone; this entry fills in the component. */
function completesSchemaOnlyEntry(name: string): boolean {
  if (!visualizers.has(name)) return false;
  return !(visualizers.get(name) as Visualizer).component;
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
