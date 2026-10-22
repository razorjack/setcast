import { fieldFragment, fieldVertex } from './field-shader.ts';

export function fieldContext(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    // Export readiness can span several compositor frames after the draw.
    preserveDrawingBuffer: true,
  });
  if (!gl) {
    throw new Error(
      'Visualizer "field" needs WebGL 2, but no context is available. Enable browser graphics acceleration, choose a working output.gl backend, or use spectrum/radial.',
    );
  }
  gl.disable(gl.DITHER);
  return gl;
}

export function fieldProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const program = gl.createProgram();
  if (!program)
    throw new Error('Cannot allocate the field shader program. Close other GPU tabs and retry.');
  try {
    attachShader(gl, program, gl.VERTEX_SHADER, fieldVertex);
    attachShader(gl, program, gl.FRAGMENT_SHADER, fieldFragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(
        `Cannot link the field shader: ${gl.getProgramInfoLog(program)}. Try another output.gl backend.`,
      );
    }
    return program;
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  }
}

function attachShader(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  type: number,
  source: string,
) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Cannot allocate a field shader. Close other GPU tabs and retry.');
  try {
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(
        `Cannot compile the field shader: ${gl.getShaderInfoLog(shader)}. Try another output.gl backend.`,
      );
    }
    gl.attachShader(program, shader);
  } finally {
    gl.deleteShader(shader);
  }
}

/** Resolve modern CSS colors through the browser, caching the one-pixel readback until changed. */
export function fieldColor() {
  const context = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true })!;
  let previous = '';
  let rgba = [1, 1, 1, 1];
  return (color: string) => {
    if (color === previous) return rgba;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    rgba = Array.from(context.getImageData(0, 0, 1, 1).data, (channel) => channel / 255);
    previous = color;
    return rgba;
  };
}
