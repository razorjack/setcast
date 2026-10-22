import { useLayoutEffect, useRef, useState } from 'react';
import { useFrame, type RenderFrame } from '../frame.tsx';
import { useRenderer } from '../renderer.tsx';
import { cssColor, drawingSize, shaderContext, shaderProgram } from './shader-gl.ts';

export type Uniforms = Record<string, WebGLUniformLocation | null>;

/**
 * A full-frame fragment shader drawn once per frame from the RenderFrame and its config alone.
 * The canvas supplies `u_size` (drawing-buffer pixels) and `u_color` (premultiplied CSS `color`).
 */
export interface Shader<C> {
  /** The visualizer name, used for the `sc-<name>` class and in error messages. */
  name: string;
  fragment: string;
  uniforms: readonly string[];
  apply(gl: WebGL2RenderingContext, uniforms: Uniforms, frame: RenderFrame, config: C): void;
}

export function ShaderCanvas<C extends { resolution: number }>({
  shader,
  config,
}: {
  shader: Shader<C>;
  config: C;
}) {
  const frame = useFrame();
  const { renderScale = 1 } = useRenderer();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painter = useRef<ReturnType<typeof createPainter<C>> | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useLayoutEffect(() => {
    const canvas = canvasRef.current!;
    const lost = () =>
      setError(
        new Error(
          `Visualizer "${shader.name}" lost its WebGL context. Reload the player or retry the export with fewer capture workers or a lower ${shader.name} resolution.`,
        ),
      );
    const active = createPainter(canvas, shader);
    canvas.addEventListener('webglcontextlost', lost);
    painter.current = active;
    return () => {
      canvas.removeEventListener('webglcontextlost', lost);
      active.dispose();
      painter.current = null;
    };
  }, [shader]);
  useLayoutEffect(() => {
    painter.current?.draw(frame, config, config.resolution * renderScale);
  });
  if (error) throw error;
  return <canvas ref={canvasRef} className={`sc-${shader.name}`} aria-hidden="true" />;
}

function createPainter<C>(canvas: HTMLCanvasElement, shader: Shader<C>) {
  const gl = shaderContext(canvas, shader.name);
  const program = shaderProgram(gl, shader.name, shader.fragment);
  const uniforms: Uniforms = Object.fromEntries(
    ['size', 'color', ...shader.uniforms].map((name) => [
      name,
      gl.getUniformLocation(program, `u_${name}`),
    ]),
  );
  const color = cssColor();
  const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
  const limit = Math.min(4096, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number, ...viewport);
  return {
    draw(frame: RenderFrame, config: C, resolution: number) {
      if (gl.isContextLost())
        throw new Error(
          `Visualizer "${shader.name}" lost its WebGL context. Reload the player or retry the export.`,
        );
      const size = drawingSize(canvas.clientWidth, canvas.clientHeight, resolution, limit);
      if (canvas.width !== size.width) canvas.width = size.width;
      if (canvas.height !== size.height) canvas.height = size.height;
      gl.viewport(0, 0, size.width, size.height);
      gl.useProgram(program);
      gl.uniform2f(uniforms.size!, size.width, size.height);
      gl.uniform4fv(uniforms.color!, color(getComputedStyle(canvas).color));
      shader.apply(gl, uniforms, frame, config);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.flush();
    },
    dispose() {
      gl.deleteProgram(program);
      // Scene switching otherwise retains inactive contexts until browser garbage collection.
      queueMicrotask(() => {
        if (!canvas.isConnected) gl.getExtension('WEBGL_lose_context')?.loseContext();
      });
    },
  };
}
