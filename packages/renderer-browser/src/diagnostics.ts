import { chromium } from 'playwright';
import type { RendererDiagnosticOptions } from '@setcast/core';
import {
  RendererDiagnostics,
  diagnoseLocalServer,
  diagnosticCommand,
  diagnoseCodecs,
  diagnoseBrowserRuntime,
  drawDiagnosticCanvas,
  verifyDiagnosticImage,
  probeDiagnosticWebGL,
} from '@setcast/core/node';
import { capabilities } from './capabilities.ts';
import { captureBrowserArgs } from './export/graphics.ts';

export async function diagnose(options: RendererDiagnosticOptions = {}) {
  const session = new RendererDiagnostics(capabilities, options);
  await diagnoseLocalServer(session);
  await diagnoseBrowserRuntime(
    session,
    async (registerClose) => {
      const browser = await chromium.launch({
        args: captureBrowserArgs(session.options.gl),
        timeout: session.options.timeoutMs,
      });
      registerClose(() => browser.close());
      const page = await browser.newPage({
        viewport: { width: 64, height: 64 },
        deviceScaleFactor: 1,
      });
      page.setDefaultTimeout(session.options.timeoutMs);
      return {
        details: { version: browser.version() },
        prepare: () => page.evaluate(drawDiagnosticCanvas),
        capture: async (format) => {
          if (format === 'webp') throw new Error('Browser WebP uses FFmpeg.');
          return (
            await page.screenshot({ type: format, timeout: session.options.timeoutMs })
          ).toString('base64');
        },
        verify: (dataUrl) => page.evaluate(verifyDiagnosticImage, dataUrl),
        graphics: () => page.evaluate(probeDiagnosticWebGL),
      };
    },
    'Run `setcast browser-install` if Chromium is missing. Otherwise check browser system libraries, sandbox permissions or GPU drivers.',
  );
  await diagnoseCodecs(session, (binary, args) => diagnosticCommand(binary, args, session.options));
  return session.report();
}
