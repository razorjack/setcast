import { openBrowser, RenderInternals } from '@remotion/renderer';
import type { RendererDiagnosticOptions } from '@setcast/core';
import {
  RendererDiagnostics,
  diagnoseLocalServer,
  diagnoseBrowserRuntime,
  diagnosticCommand,
  diagnoseCodecs,
  drawDiagnosticCanvas,
  verifyDiagnosticImage,
  probeDiagnosticWebGL,
} from '@setcast/core/node';
import { capabilities } from './capabilities.ts';
import { graphicsOptions } from './graphics.ts';
import { hardwareEncoder } from './hardware.ts';
import { PACKAGE_ROOT } from './paths.ts';

export async function diagnose(options: RendererDiagnosticOptions = {}) {
  const session = new RendererDiagnostics(capabilities, options);
  await diagnoseLocalServer(session);
  await diagnoseBrowser(session);
  const command = (binary: 'ffmpeg' | 'ffprobe', args: string[]) =>
    packagedCommand(binary, args, session.options);
  await diagnoseCodecs(session, command);
  await session.check(
    'hardware.encode',
    ['hardwareEncoding'],
    'Use software encoding, or install a compatible GPU/driver. Remotion uses VideoToolbox on macOS and NVENC on Linux/Windows.',
    async () => {
      const encoder = hardwareEncoder(process.platform);
      if (!encoder)
        throw new Error(`No hardware H.264 encoder is configured for ${process.platform}.`);
      await command('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-filter_complex',
        'nullsrc=s=256x256,format=yuv420p',
        '-frames:v',
        '1',
        '-pix_fmt',
        'yuv420p',
        '-c:v',
        encoder,
        '-b:v',
        '1M',
        '-f',
        'null',
        '-',
      ]);
      return { message: `Encoded a frame with ${encoder}.`, details: { encoder } };
    },
  );
  return session.report();
}

async function packagedCommand(
  binary: 'ffmpeg' | 'ffprobe',
  args: string[],
  options: RendererDiagnosticOptions,
) {
  options.signal?.throwIfAborted();
  const task = RenderInternals.callFf({
    bin: binary,
    args,
    indent: false,
    logLevel: 'error',
    binariesDirectory: null,
    cancelSignal: undefined,
    options: { timeout: options.timeoutMs, killSignal: 'SIGKILL', maxBuffer: 128 * 1024 },
  });
  const stop = () => {
    task.kill('SIGKILL');
  };
  options.signal?.addEventListener('abort', stop, { once: true });
  try {
    return (await task).stdout;
  } finally {
    options.signal?.removeEventListener('abort', stop);
  }
}

async function installedBrowser(options: RendererDiagnosticOptions) {
  // A missing-browser callback rejects Remotion's process-global ensureBrowser queue. Isolate
  // this read-only query so a failed diagnostic cannot poison a host's later render session.
  const source = `
    import { ensureBrowser } from '@remotion/renderer';
    try {
      const result = await ensureBrowser({ logLevel: 'error', onBrowserDownload() {
        throw new Error('The pinned Remotion browser is missing or has a different version.');
      }});
      process.stdout.write(JSON.stringify(result));
    } catch (error) { process.stderr.write(error.message); process.exitCode = 1; }
  `;
  const status = JSON.parse(
    await diagnosticCommand(
      process.execPath,
      ['--input-type=module', '-e', source],
      options,
      PACKAGE_ROOT,
    ),
  );
  if (!status.path) throw new Error('Remotion did not locate an installed browser.');
  return status.path as string;
}

async function diagnoseBrowser(session: RendererDiagnostics) {
  await diagnoseBrowserRuntime(
    session,
    async (registerClose) => {
      const path = await installedBrowser(session.options);
      const browser = await openBrowser('chrome', {
        browserExecutable: path,
        chromiumOptions: graphicsOptions(session.options.gl),
        logLevel: 'error',
      });
      registerClose(() => browser.close({ silent: true }));
      const page = await browser.newPage({
        context: () => null,
        logLevel: 'error',
        indent: false,
        pageIndex: 0,
        onBrowserLog: null,
        onLog: () => {},
      });
      await page.setViewport({ width: 64, height: 64, deviceScaleFactor: 1 });
      return {
        details: { executable: path },
        prepare: () => page.evaluate(drawDiagnosticCanvas),
        capture: async (format) =>
          (await page._client().send('Page.captureScreenshot', { format })).value.data,
        verify: async (dataUrl) => {
          await page.evaluate(verifyDiagnosticImage, dataUrl);
        },
        graphics: () => page.evaluate(probeDiagnosticWebGL),
      };
    },
    'Run a Remotion still/render once with network access if its pinned browser is missing. Otherwise check browser system libraries, sandbox permissions or GPU drivers.',
  );
}
