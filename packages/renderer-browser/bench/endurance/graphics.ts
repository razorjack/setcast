import type { Page } from 'playwright';
import { graphicsArgs } from '../../src/export/graphics.ts';
import type { EnduranceConfig } from './config.ts';

export function liveGraphicsArgs(graphics: EnduranceConfig['graphics']) {
  return graphics === 'swiftshader'
    ? ['--use-gl=angle', '--use-angle=swiftshader']
    : graphicsArgs('auto');
}

export async function liveGraphicsIdentity(page: Page, requested: EnduranceConfig['graphics']) {
  await page.locator('.sc-live-scene[data-ready=true]').waitFor();
  const context = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '.sc-live-scene[data-ready=true] canvas[data-gpu-state=ready]',
    );
    const gl = canvas?.getContext('webgl2');
    if (!gl) return null;
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      version: String(gl.getParameter(gl.VERSION)),
      shadingLanguage: String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)),
      vendor: String(gl.getParameter(gl.VENDOR)),
      renderer: String(gl.getParameter(gl.RENDERER)),
      unmaskedVendor: extension ? String(gl.getParameter(extension.UNMASKED_VENDOR_WEBGL)) : null,
      unmaskedRenderer: extension
        ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL))
        : null,
    };
  });
  if (requested === 'swiftshader' && !/SwiftShader/i.test(context?.unmaskedRenderer ?? ''))
    throw new Error(
      'SwiftShader qualification requires an active shader canvas reporting SwiftShader. Check browser support and include a GPU visualizer in the first scene.',
    );
  return { requested, context };
}
