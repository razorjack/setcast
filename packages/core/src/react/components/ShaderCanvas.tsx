import { useLayoutEffect, useRef, useState } from 'react';
import { useFrame, type RenderFrame } from '../frame.tsx';
import { useRenderer } from '../renderer.tsx';
import type { GpuCanvasConfig } from '../../gpu.ts';
import { ShaderSession } from './shader-session.ts';

export type Uniforms = Record<string, WebGLUniformLocation | null>;

/**
 * A full-frame fragment shader drawn once per frame from the RenderFrame and its config alone.
 * The canvas supplies `u_size` (drawing-buffer pixels) and `u_color` (straight RGBA from CSS `color`).
 */
export interface Shader<C> {
  /** The visualizer name, used for the `sc-<name>` class and in error messages. */
  name: string;
  fragment: string;
  uniforms: readonly string[];
  apply(gl: WebGL2RenderingContext, uniforms: Uniforms, frame: RenderFrame, config: C): void;
}

export function ShaderCanvas<C extends GpuCanvasConfig>({
  shader,
  config,
}: {
  shader: Shader<C>;
  config: C;
}) {
  const frame = useFrame();
  const bindings = useRenderer();
  const latest = useRef({ frame, config, bindings });
  latest.current = { frame, config, bindings };
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const session = useRef<ShaderSession<C> | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useLayoutEffect(() => {
    const active = new ShaderSession(canvasRef.current!, shader, {
      current: () => ({
        frame: latest.current.frame,
        config: latest.current.config,
        resolution: latest.current.config.resolution * (latest.current.bindings.renderScale ?? 1),
      }),
      hold: (label) => latest.current.bindings.hold(label),
      diagnostic: (event) => latest.current.bindings.diagnostic?.(event),
      fail: setError,
    });
    session.current = active;
    return () => {
      active.dispose();
      session.current = null;
    };
  }, [shader]);
  useLayoutEffect(() => {
    session.current?.draw();
  });
  if (error) throw error;
  return <canvas ref={canvasRef} className={`sc-${shader.name}`} aria-hidden="true" />;
}
