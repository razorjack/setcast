import type { RenderFrame } from '../frame.tsx';
import type { Shader, Uniforms } from './ShaderCanvas.tsx';
import { cssColor, drawingSize, shaderContext, shaderProgram } from './shader-gl.ts';

export function createPainter<C>(canvas: HTMLCanvasElement, shader: Shader<C>) {
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
    draw(frame: RenderFrame, config: C, resolution: number): boolean {
      if (gl.isContextLost()) return false;
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
      return !gl.isContextLost();
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
