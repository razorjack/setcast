import { writeFile } from 'node:fs/promises';
import { expect, test, vi } from 'vite-plus/test';
import { fixture } from '../diagnostics/renderer-diagnostics.fixture.ts';
import { RendererDiagnostics, diagnosticCommand } from './renderer-diagnostics.ts';
import { diagnoseCodecs } from './diagnostic-codecs.ts';
import { diagnoseBrowserRuntime, type DiagnosticBrowser } from './diagnostic-browser-runtime.ts';

test('persistent cache is unavailable when its ffprobe prerequisite fails', async () => {
  const session = new RendererDiagnostics(
    { ...fixture, features: [...fixture.features, 'cache'] },
    { require: ['cache'] },
  );
  await diagnoseCodecs(session, async (binary) => {
    if (binary === 'ffprobe') throw new Error('ffprobe missing');
    return 'fake ffmpeg version';
  });
  expect(session.report().features.cache).toBe('unavailable');
  expect(session.report().ready).toBe(false);
});

test('optional tool failure does not fail a still-only setup and all missing tools are reported', async () => {
  const session = new RendererDiagnostics(fixture, { require: ['still'] });
  await session.check('capture', ['still'], '', async () => ({ message: 'captured' }));
  await diagnoseCodecs(session, async (binary) => {
    throw new Error(`${binary} missing`);
  });
  const report = session.report();
  expect(report.ready).toBe(true);
  expect(report.exitCode).toBe(0);
  expect(report.features).toMatchObject({
    still: 'ready',
    video: 'unavailable',
    resume: 'unavailable',
  });
  expect(report.checks.filter((check) => check.status === 'fail').map((check) => check.id)).toEqual(
    ['ffmpeg', 'ffprobe'],
  );
  expect(report.checks.find((check) => check.id === 'video.encode')?.status).toBe('skipped');
});

test('browser resources close after page initialization fails', async () => {
  const session = new RendererDiagnostics(fixture);
  let closed = false;
  await diagnoseBrowserRuntime(
    session,
    async (release) => {
      release(async () => {
        closed = true;
      });
      throw new Error('Could not open page');
    },
    'fix the browser',
  );
  expect(closed).toBe(true);
  expect(session.report().features.video).toBe('unavailable');
  expect(session.checks[0]).toMatchObject({ status: 'fail', hint: 'fix the browser' });
});

test('a failed GPU probe preserves successful capture and closes its browser', async () => {
  const session = new RendererDiagnostics(fixture, { require: ['still'] });
  let closed = 0;
  const browser: DiagnosticBrowser = {
    details: {},
    prepare: async () => ({}),
    capture: async () => '',
    verify: async () => {},
    graphics: async () => {
      throw new Error('No WebGL 2');
    },
  };
  await diagnoseBrowserRuntime(
    session,
    async (release) => {
      release(async () => {
        closed++;
      });
      return browser;
    },
    'check drivers',
  );
  expect(session.report()).toMatchObject({
    ready: true,
    features: { still: 'ready', gpu: 'unavailable' },
  });
  expect(closed).toBe(1);
});

test('diagnostic commands kill timed-out processes and honor cancellation', async () => {
  await expect(
    diagnosticCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 30 }),
  ).rejects.toMatchObject({ killed: true, signal: 'SIGKILL' });
  const controller = new AbortController();
  controller.abort(new Error('cancel probe'));
  const session = new RendererDiagnostics(fixture, { signal: controller.signal });
  let ran = false;
  await expect(
    session.check('never', ['video'], '', async () => {
      ran = true;
      return { message: 'wrong' };
    }),
  ).rejects.toThrow('cancel probe');
  expect(ran).toBe(false);
  expect(session.checks).toEqual([]);
});

test('browser timeout closes an active page and reports unavailable capture', async () => {
  vi.useFakeTimers();
  try {
    const session = new RendererDiagnostics(fixture, { require: ['still'], timeoutMs: 1000 });
    const pending = Promise.withResolvers<Record<string, string>>();
    let closed = false;
    const task = diagnoseBrowserRuntime(
      session,
      async (release) => {
        release(async () => {
          closed = true;
          pending.reject(new Error('Browser closed'));
        });
        return {
          details: {},
          prepare: () => pending.promise,
          capture: async () => '',
          verify: async () => {},
          graphics: async () => {
            throw new Error('Browser closed');
          },
        };
      },
      'restart the browser',
    );
    await vi.advanceTimersByTimeAsync(1001);
    await task;
    expect(closed).toBe(true);
    expect(session.report()).toMatchObject({ ready: false, features: { still: 'unavailable' } });
  } finally {
    vi.useRealTimers();
  }
});

test('a browser returned after the deadline is closed before any page work starts', async () => {
  vi.useFakeTimers();
  try {
    const session = new RendererDiagnostics(fixture, { timeoutMs: 1000 });
    let closed = false;
    let prepared = false;
    const task = diagnoseBrowserRuntime(
      session,
      async (release) => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        release(async () => {
          closed = true;
        });
        prepared = true;
        throw new Error('Should never reach page initialization');
      },
      'fix startup',
    );
    await vi.advanceTimersByTimeAsync(2000);
    await task;
    expect(closed).toBe(true);
    expect(prepared).toBe(false);
    expect(session.checks[0]?.message).toContain('exceeded');
  } finally {
    vi.useRealTimers();
  }
});

test('missing ffprobe blocks resume without invalidating video encoding', async () => {
  const session = new RendererDiagnostics(fixture);
  await diagnoseCodecs(session, async (binary, args) => {
    if (binary === 'ffprobe') throw new Error('ffprobe missing');
    if (args[0] === '-version') return 'fixture version';
    const destination = args.at(-1)!;
    if (destination !== '-') await writeFile(destination, 'fixture');
    return '';
  });
  expect(session.report()).toMatchObject({
    ready: true,
    features: {
      video: 'ready',
      resume: 'unavailable',
      webp: 'unchecked',
    },
  });
});

test('an unavailable adapter video filter fails encoding diagnostics before claiming video readiness', async () => {
  const session = new RendererDiagnostics(fixture, { require: ['video'] });
  await diagnoseCodecs(
    session,
    async (_binary, args) => {
      if (args[0] === '-version') return 'fixture version';
      if (args.includes('required-color-filter'))
        throw new Error('No such filter: required-color-filter');
      throw new Error('The required filter was not passed to the encoder probe');
    },
    'required-color-filter',
  );
  expect(session.report().features.video).toBe('unavailable');
  expect(session.checks.find((check) => check.id === 'video.encode')?.message).toContain(
    'No such filter: required-color-filter',
  );
});
