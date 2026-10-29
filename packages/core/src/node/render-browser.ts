import type { RenderRuntime } from '../export/export.ts';

/** Evaluated in the active capture browser; keep this function self-contained. */
export function observeRenderBrowser(): Extract<RenderRuntime, { kind: 'browser' }> {
  const result: Extract<RenderRuntime, { kind: 'browser' }> = {
    kind: 'browser',
    userAgent: navigator.userAgent,
    capture: 'jpeg-screenshot',
    graphics: null,
    graphicsError: null,
  };
  const gl = document.createElement('canvas').getContext('webgl2');
  try {
    if (!gl) throw new Error('WebGL 2 is unavailable.');
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    result.graphics = {
      renderer: String(gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)),
      vendor: String(gl.getParameter(debug?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR)),
      version: String(gl.getParameter(gl.VERSION)),
    };
  } catch (error) {
    result.graphicsError = String(error);
  } finally {
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
  return result;
}
