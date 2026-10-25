import type { RendererFeature } from '../renderer-capabilities.ts';
import type { RendererCheck } from '../renderer-diagnostics.ts';
import { RendererDiagnostics, type DiagnosticEvidence } from './renderer-diagnostics.ts';

type Details = NonNullable<RendererCheck['details']>;
export interface DiagnosticBrowser {
  details: Details;
  prepare(): Promise<Details>;
  capture(format: 'png' | 'jpeg' | 'webp'): Promise<string>;
  verify(dataUrl: string): Promise<void>;
  graphics(): Promise<Details>;
}
type RegisterClose = (close: () => Promise<void>) => void;

/** The adapter owns launch flags and browser APIs; this helper owns the probe/report sequence. */
export async function diagnoseBrowserRuntime(
  session: RendererDiagnostics,
  open: (registerClose: RegisterClose) => Promise<DiagnosticBrowser>,
  hint: string,
) {
  const probes = new BrowserChecks(session, hint);
  session.options.signal?.addEventListener('abort', probes.stop, { once: true });
  try {
    await probes.run(open);
  } finally {
    session.options.signal?.removeEventListener('abort', probes.stop);
    await probes.close?.();
  }
}

class BrowserChecks {
  close: (() => Promise<void>) | undefined;
  private expired = false;
  private session: RendererDiagnostics;
  private hint: string;
  constructor(session: RendererDiagnostics, hint: string) {
    this.session = session;
    this.hint = hint;
  }
  stop = () => {
    void this.close?.().catch(() => {});
  };

  async check(
    id: string,
    features: readonly RendererFeature[],
    task: () => Promise<DiagnosticEvidence>,
  ) {
    this.expired = false;
    const timer = setTimeout(() => {
      this.expired = true;
      this.stop();
    }, this.session.options.timeoutMs);
    try {
      return await this.session.check(id, features, this.hint, async () => {
        const evidence = await task();
        if (this.expired)
          throw new Error(`Browser probe exceeded ${this.session.options.timeoutMs} ms.`);
        return evidence;
      });
    } finally {
      clearTimeout(timer);
    }
  }

  registerClose: RegisterClose = (release) => {
    this.close = release;
    if (this.expired || this.session.options.signal?.aborted) {
      this.stop();
      this.session.options.signal?.throwIfAborted();
      throw new Error(`Browser launch exceeded ${this.session.options.timeoutMs} ms.`);
    }
  };

  async run(open: (registerClose: RegisterClose) => Promise<DiagnosticBrowser>) {
    let browser: DiagnosticBrowser | undefined;
    const { session } = this;
    const started = await this.check('browser.launch', session.capabilities.features, async () => {
      browser = await open(this.registerClose);
      return { message: 'Started the installed browser.', details: browser.details };
    });
    const captureFeatures = session.capabilities.features.filter((feature) => feature !== 'gpu');
    if (!started || !browser) {
      session.skip('browser.capture', captureFeatures, 'Browser launch failed.');
      session.skip('browser.webgl', ['gpu'], 'Browser launch failed.');
      return;
    }
    await this.capture(browser, captureFeatures);
    await this.check('browser.webgl', ['gpu'], async () => ({
      message: 'WebGL 2 compiled, drew and read back a fragment shader.',
      details: await browser!.graphics(),
    }));
  }

  async capture(runtime: DiagnosticBrowser, features: RendererFeature[]) {
    await this.check('browser.capture', features, async () => {
      const details = await runtime.prepare();
      for (const format of ['png', 'jpeg'] as const)
        await runtime.verify(`data:image/${format};base64,${await runtime.capture(format)}`);
      return { message: 'PNG and JPEG screenshots preserve CSS and Canvas 2D pixels.', details };
    });
    if (this.session.capabilities.runtime.ffmpeg === 'packaged')
      await this.check('browser.webp', ['webp'], async () => {
        await runtime.verify(`data:image/webp;base64,${await runtime.capture('webp')}`);
        return { message: 'WebP screenshot preserves fixture pixels.' };
      });
  }
}
