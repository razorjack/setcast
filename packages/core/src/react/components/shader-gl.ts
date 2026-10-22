/** One triangle that covers the viewport; fragment shaders draw the whole picture. */
const fullFrameVertex = `#version 300 es
void main() {
  vec2 point = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(point * 2.0 - 1.0, 0.0, 1.0);
}
`;

export function shaderContext(canvas: HTMLCanvasElement, name: string): WebGL2RenderingContext {
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
      `Visualizer "${name}" needs WebGL 2, but no context is available. Enable browser graphics acceleration, choose a working output.gl backend, or use spectrum/radial.`,
    );
  }
  gl.disable(gl.DITHER);
  return gl;
}

export function shaderProgram(
  gl: WebGL2RenderingContext,
  name: string,
  fragment: string,
): WebGLProgram {
  const program = gl.createProgram();
  if (!program)
    throw new Error(`Cannot allocate the ${name} shader program. Close other GPU tabs and retry.`);
  try {
    attachShader(gl, program, { type: gl.VERTEX_SHADER, source: fullFrameVertex, name });
    attachShader(gl, program, { type: gl.FRAGMENT_SHADER, source: fragment, name });
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(
        `Cannot link the ${name} shader: ${gl.getProgramInfoLog(program)}. Try another output.gl backend.`,
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
  shader: { type: number; source: string; name: string },
) {
  const compiled = gl.createShader(shader.type);
  if (!compiled)
    throw new Error(`Cannot allocate a ${shader.name} shader. Close other GPU tabs and retry.`);
  try {
    gl.shaderSource(compiled, shader.source);
    gl.compileShader(compiled);
    if (!gl.getShaderParameter(compiled, gl.COMPILE_STATUS)) {
      throw new Error(
        `Cannot compile the ${shader.name} shader: ${gl.getShaderInfoLog(compiled)}. Try another output.gl backend.`,
      );
    }
    gl.attachShader(program, compiled);
  } finally {
    gl.deleteShader(compiled);
  }
}

/** Resolve modern CSS colors through the browser, caching the one-pixel readback until changed. */
export function cssColor() {
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

/** Drawing-buffer pixels for a CSS box, scaled by `resolution` and capped at `limit` per side. */
export function drawingSize(width: number, height: number, resolution: number, limit: number) {
  const ratio = Math.min(resolution, limit / Math.max(width, height, 1));
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}
