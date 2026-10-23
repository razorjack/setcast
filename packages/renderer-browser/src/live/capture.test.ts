import { afterEach, expect, test, vi } from 'vite-plus/test';
import { LiveCapture } from './capture.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function captureEnvironment() {
  const track = {
    muted: false,
    label: 'Interface',
    stop: vi.fn(),
    onended: null,
    onmute: null,
    onunmute: null,
  };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const media = {
    getUserMedia: vi.fn(async () => stream),
    enumerateDevices: vi.fn(async () => [
      { kind: 'audioinput', deviceId: 'interface', label: 'Interface' },
    ]),
  };
  const context = {
    state: 'running',
    sampleRate: 48000,
    destination: {},
    onstatechange: null,
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {
      context.state = 'closed';
    }),
    audioWorklet: { addModule: vi.fn(async () => {}) },
    createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
  };
  const node = {
    port: { onmessage: (_event: { data: unknown }) => {}, postMessage: vi.fn(), close: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
    onprocessorerror: null,
  };
  vi.stubGlobal('navigator', { mediaDevices: media });
  vi.stubGlobal(
    'AudioContext',
    class {
      constructor() {
        return context;
      }
    },
  );
  vi.stubGlobal(
    'AudioWorkletNode',
    class {
      constructor() {
        return node;
      }
    },
  );
  return { track, stream, media, context, node };
}

test('capture uses the requested device with speech processing disabled and releases resources', async () => {
  const environment = captureEnvironment();
  const capture = new LiveCapture();
  await capture.start({ device: 'Interface', channels: [3, 4], gain: 1 });
  expect(environment.media.getUserMedia).toHaveBeenCalledWith({
    audio: {
      deviceId: { exact: 'interface' },
      channelCount: { ideal: 32 },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
    video: false,
  });
  environment.node.port.onmessage({
    data: {
      start: 0,
      left: new Float32Array(1024),
      right: new Float32Array(1024),
      count: 4,
      peaks: [0, 0, 0.2, 0.3],
      revision: 0,
      dropped: 0,
    },
  });
  expect(capture.status).toMatchObject({ phase: 'running', selected: [3, 4], channels: 4 });
  capture.stop();
  expect(environment.track.stop).toHaveBeenCalledOnce();
  expect(environment.context.close).toHaveBeenCalledOnce();
  expect(environment.node.port.close).toHaveBeenCalledOnce();
  expect(capture.audio).toBeNull();
});

test('cancelling while permission is pending stops the eventual stream', async () => {
  const environment = captureEnvironment();
  const permission = Promise.withResolvers<typeof environment.stream>();
  environment.media.getUserMedia.mockReturnValue(permission.promise);
  const capture = new LiveCapture();
  const starting = capture.start({ channels: null, gain: 1 });
  await vi.waitFor(() => expect(environment.media.getUserMedia).toHaveBeenCalledOnce());
  capture.stop();
  permission.resolve(environment.stream);
  await starting;
  expect(environment.track.stop).toHaveBeenCalledOnce();
  expect(environment.context.audioWorklet.addModule).not.toHaveBeenCalled();
  expect(capture.status.phase).toBe('stopped');
});

test('failed worklet startup releases the device and reports the original failure', async () => {
  const environment = captureEnvironment();
  environment.context.audioWorklet.addModule.mockRejectedValue(
    new Error('Cannot load capture module'),
  );
  const capture = new LiveCapture();
  await capture.start({ channels: null, gain: 1 });
  expect(capture.status).toMatchObject({ phase: 'error', message: 'Cannot load capture module' });
  expect(environment.track.stop).toHaveBeenCalledOnce();
  expect(environment.context.close).toHaveBeenCalledOnce();
});

test('named inputs request permission before resolving labels hidden by the browser', async () => {
  const environment = captureEnvironment();
  environment.media.enumerateDevices.mockResolvedValueOnce([
    { kind: 'audioinput', deviceId: '', label: '' },
  ]);
  const capture = new LiveCapture();
  await capture.start({ device: 'Interface', channels: null, gain: 1 });
  expect(environment.media.getUserMedia).toHaveBeenCalledTimes(2);
  expect(environment.media.getUserMedia).toHaveBeenLastCalledWith(
    expect.objectContaining({
      audio: expect.objectContaining({ deviceId: { exact: 'interface' } }),
    }),
  );
  expect(environment.track.stop).toHaveBeenCalledOnce();
  capture.stop();
});

function packet(start = 0) {
  return {
    data: {
      start,
      left: new Float32Array(1024),
      right: new Float32Array(1024),
      count: 2,
      peaks: [0, 0],
      revision: 0,
      dropped: 0,
    },
  };
}

test('mute marks input unavailable until an unmuted fresh packet arrives', async () => {
  const environment = captureEnvironment();
  const capture = new LiveCapture();
  await capture.start({ channels: null, gain: 1 });
  environment.node.port.onmessage(packet(1024));
  expect(capture.status.available).toBe(true);
  (environment.track.onmute as unknown as () => void)();
  environment.node.port.onmessage(packet(2048));
  expect(capture.status.available).toBe(false);
  (environment.track.onunmute as unknown as () => void)();
  expect(capture.status.available).toBe(false);
  environment.node.port.onmessage(packet(3072));
  expect(capture.status).toMatchObject({ available: true, message: null });
  capture.stop();
});

test('missing packets fail explicitly after confirmation, including initial starvation', async () => {
  vi.useFakeTimers();
  const environment = captureEnvironment();
  const capture = new LiveCapture();
  await capture.start({ channels: null, gain: 1 });
  capture.checkHealth(performance.now() + 1600);
  capture.checkHealth(performance.now() + 1700);
  await vi.advanceTimersByTimeAsync(99);
  expect(capture.status.phase).toBe('starting');
  await vi.advanceTimersByTimeAsync(1);
  expect(capture.status).toMatchObject({
    phase: 'error',
    available: false,
    message: expect.stringContaining('packets stopped'),
  });
  expect(environment.track.stop).toHaveBeenCalledOnce();
  expect(environment.node.port.close).toHaveBeenCalledOnce();
});

test('an initially muted track waits for fresh unmuted PCM, including ordinary silence', async () => {
  const environment = captureEnvironment();
  environment.track.muted = true;
  const capture = new LiveCapture();
  await capture.start({ channels: null, gain: 1 });
  environment.node.port.onmessage(packet());
  expect(capture.status).toMatchObject({ phase: 'running', available: false });
  (environment.track.onunmute as unknown as () => void)();
  environment.node.port.onmessage(packet(1024));
  capture.checkHealth();
  expect(capture.status).toMatchObject({ phase: 'running', available: true, message: null });
  capture.stop();
});

test('queued current PCM cancels a suspected starvation without hiding gaps', async () => {
  vi.useFakeTimers();
  const environment = captureEnvironment();
  const capture = new LiveCapture();
  await capture.start({ channels: null, gain: 1 });
  environment.node.port.onmessage(packet());
  capture.checkHealth(performance.now() + 1600);
  const resumed = packet(96000);
  resumed.data.dropped = 71680;
  environment.node.port.onmessage(resumed);
  await vi.advanceTimersByTimeAsync(100);
  expect(capture.status).toMatchObject({ phase: 'running', available: true, dropped: 71680 });
  expect(environment.track.stop).not.toHaveBeenCalled();
  capture.stop();
});

test('stale routing packets cannot cancel starvation confirmation', async () => {
  vi.useFakeTimers();
  const environment = captureEnvironment();
  const capture = new LiveCapture();
  await capture.start({ channels: null, gain: 1 });
  environment.node.port.onmessage(packet());
  capture.route([1, 2], 1);
  capture.checkHealth(performance.now() + 1600);
  environment.node.port.onmessage(packet(1024));
  await vi.advanceTimersByTimeAsync(100);
  expect(capture.status.phase).toBe('error');
  expect(environment.track.stop).toHaveBeenCalledOnce();
});

test('capture restart cancels the previous session starvation confirmation', async () => {
  vi.useFakeTimers();
  const environment = captureEnvironment();
  const capture = new LiveCapture();
  await capture.start({ channels: null, gain: 1 });
  environment.node.port.onmessage(packet());
  capture.checkHealth(performance.now() + 1600);
  await capture.start({ channels: null, gain: 1 });
  environment.node.port.onmessage(packet());
  await vi.advanceTimersByTimeAsync(100);
  expect(capture.status.phase).toBe('running');
  expect(environment.track.stop).toHaveBeenCalledOnce();
  capture.stop();
});
