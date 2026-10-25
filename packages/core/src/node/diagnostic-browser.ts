/** Self-contained functions: adapters evaluate these in their own pinned browser. */
export function drawDiagnosticCanvas() {
  document.body.style.cssText = 'margin:0;background:rgb(12,34,56)';
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  canvas.style.cssText = 'position:absolute;left:0;top:0;width:32px;height:32px';
  document.body.append(canvas);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable.');
  context.fillStyle = 'rgb(64,128,192)';
  context.fillRect(0, 0, 32, 32);
  return { userAgent: navigator.userAgent };
}

export async function verifyDiagnosticImage(dataUrl: string) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  for (const [x, y, expected] of [
    [16, 16, [64, 128, 192]],
    [48, 48, [12, 34, 56]],
  ] as const) {
    const pixel = context.getImageData(x, y, 1, 1).data;
    if (expected.some((value, index) => Math.abs(pixel[index]! - value) > 5) || pixel[3] !== 255)
      throw new Error(
        `Screenshot pixel at ${x},${y} is ${[...pixel].join(',')}, expected ${expected.join(',')}.`,
      );
  }
  if (image.width !== 64 || image.height !== 64) throw new Error('Screenshot dimensions differ.');
}

export function probeDiagnosticWebGL() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 8;
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
  if (!gl) throw new Error('WebGL 2 context creation failed.');
  const vertex = gl.createShader(gl.VERTEX_SHADER)!;
  const fragment = gl.createShader(gl.FRAGMENT_SHADER)!;
  const program = gl.createProgram()!;
  try {
    gl.shaderSource(
      vertex,
      `#version 300 es
      void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
        gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`,
    );
    gl.shaderSource(
      fragment,
      `#version 300 es
      precision highp float; out vec4 color;
      void main() { color = vec4(0.25, 0.5, 0.75, 1.0); }`,
    );
    for (const shader of [vertex, fragment]) {
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compilation failed.');
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) ?? 'Shader linking failed.');
    gl.useProgram(program);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const pixel = new Uint8Array(4);
    gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    if ([64, 128, 191, 255].some((value, index) => Math.abs(pixel[index]! - value) > 1))
      throw new Error(`WebGL readback returned unexpected pixels: ${[...pixel].join(',')}.`);
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: String(gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)),
      vendor: String(gl.getParameter(debug?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR)),
      version: String(gl.getParameter(gl.VERSION)),
    };
  } finally {
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
