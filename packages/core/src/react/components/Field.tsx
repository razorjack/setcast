import { useLayoutEffect, useRef, useState } from 'react';
import { level } from '../../audio.ts';
import { FieldConfigSchema, type FieldConfig } from '../../visualizers.ts';
import { useFrame, type RenderFrame } from '../frame.tsx';
import { fieldColor, fieldContext, fieldProgram } from './field-gl.ts';
import { fieldPhases, fieldSize } from './field-motion.ts';

export { FieldConfigSchema, type FieldConfig };

export function Field({ config }: { config: FieldConfig }) {
  const frame = useFrame();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painter = useRef<ReturnType<typeof createField> | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useLayoutEffect(() => {
    const canvas = canvasRef.current!;
    const lost = () =>
      setError(
        new Error(
          'Visualizer "field" lost its WebGL context. Reload the player or retry the export with fewer capture workers or a lower field resolution.',
        ),
      );
    const active = createField(canvas);
    canvas.addEventListener('webglcontextlost', lost);
    painter.current = active;
    return () => {
      canvas.removeEventListener('webglcontextlost', lost);
      active.dispose();
      painter.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    painter.current?.draw(frame, config);
  });
  if (error) throw error;
  return <canvas ref={canvasRef} className="sc-field" aria-hidden="true" />;
}

function createField(canvas: HTMLCanvasElement) {
  const gl = fieldContext(canvas);
  const program = fieldProgram(gl);
  const uniforms = Object.fromEntries(
    ['size', 'phase', 'audio', 'color', 'scale'].map((name) => [
      name,
      gl.getUniformLocation(program, `u_${name}`),
    ]),
  );
  const color = fieldColor();
  const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
  const limit = Math.min(4096, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number, ...viewport);
  return {
    draw(frame: RenderFrame, config: FieldConfig) {
      if (gl.isContextLost())
        throw new Error(
          'Visualizer "field" lost its WebGL context. Reload the player or retry the export.',
        );
      const size = fieldSize(canvas.clientWidth, canvas.clientHeight, config.resolution, limit);
      if (canvas.width !== size.width) canvas.width = size.width;
      if (canvas.height !== size.height) canvas.height = size.height;
      gl.viewport(0, 0, size.width, size.height);
      gl.useProgram(program);
      gl.uniform2f(uniforms.size!, size.width, size.height);
      gl.uniform4fv(uniforms.phase!, fieldPhases(frame.timeSeconds, config.speed, config.seed));
      gl.uniform3f(
        uniforms.audio!,
        level(frame.audio.bass, config.gain, 0),
        level(frame.audio.mids, config.gain, 0),
        level(frame.audio.highs, config.gain, 0),
      );
      gl.uniform4fv(uniforms.color!, color(getComputedStyle(canvas).color));
      gl.uniform1f(uniforms.scale!, config.scale);
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
