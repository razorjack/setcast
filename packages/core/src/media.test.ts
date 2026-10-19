import { beforeEach, expect, test, vi } from 'vite-plus/test';

const mock = vi.hoisted(() => ({
  metadata: vi.fn(),
  compute: vi.fn(),
  audio: vi.fn(),
  video: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  UrlSource: class {},
  FilePathSource: class {},
  Input: class {
    getDurationFromMetadata = mock.metadata;
    computeDuration = mock.compute;
    getPrimaryAudioTrack = mock.audio;
    getPrimaryVideoTrack = mock.video;
    dispose = mock.dispose;
  },
}));

const { mediaDuration, audioChannels, videoInfo } = await import('./media.ts');
const { audioDuration, probeAudio } = await import('./node/media.ts');
const track = {
  getDurationFromMetadata: mock.metadata,
  computeDuration: mock.compute,
  numberOfChannels: 2,
  displayWidth: 640,
  displayHeight: 360,
};

beforeEach(() => {
  vi.resetAllMocks();
  mock.metadata.mockResolvedValue(1.272);
  mock.compute.mockResolvedValue(1.2345);
  mock.audio.mockResolvedValue(track);
  mock.video.mockResolvedValue(track);
});

test.each([mediaDuration, audioDuration])(
  '%s prefers metadata and disposes its input',
  async (read) => {
    expect(await read('test.mp3')).toBe(1.272);
    expect(mock.compute).not.toHaveBeenCalled();
    expect(mock.dispose).toHaveBeenCalledOnce();
  },
);

test.each([mediaDuration, audioDuration])(
  '%s computes missing duration and disposes on failure',
  async (read) => {
    mock.metadata.mockResolvedValue(null);
    expect(await read('test.mp3')).toBe(1.2345);
    mock.compute.mockRejectedValue(new Error('decode failed'));
    await expect(read('test.mp3')).rejects.toThrow('decode failed');
    expect(mock.dispose).toHaveBeenCalledTimes(2);
  },
);

test.each([0, -1, NaN, Infinity])(
  'rejects invalid audio duration %s without replacing metadata',
  async (duration) => {
    mock.metadata.mockResolvedValue(duration);
    await expect(probeAudio({ audio: 'test.mp3' }, '/')).rejects.toMatchObject({
      message: 'Cannot read test.mp3 as audio',
      cause: expect.objectContaining({ message: expect.stringContaining('finite and positive') }),
    });
    expect(mock.compute).not.toHaveBeenCalled();
    expect(mock.dispose).toHaveBeenCalledOnce();
  },
);

test('URL channels retain mono fallback, but a local audio probe requires an audio track', async () => {
  expect(await audioChannels('test.mp3')).toBe(2);
  mock.audio.mockResolvedValue(null);
  expect(await audioChannels('test.mp3')).toBe(1);
  await expect(audioDuration('test.mp3')).rejects.toThrow('no audio track');
  expect(mock.dispose).toHaveBeenCalledTimes(3);
});

test('video probing retains display dimensions and releases missing or failed tracks', async () => {
  expect(await videoInfo('test.mp4')).toEqual({ duration: 1.272, width: 640, height: 360 });
  mock.metadata.mockResolvedValue(null);
  expect(await videoInfo('test.mp4')).toEqual({ duration: 1.2345, width: 640, height: 360 });
  mock.video.mockResolvedValue(null);
  await expect(videoInfo('test.mp4')).rejects.toThrow('no video track');
  mock.video.mockRejectedValue(new Error('bad container'));
  await expect(videoInfo('test.mp4')).rejects.toThrow('bad container');
  expect(mock.dispose).toHaveBeenCalledTimes(4);
});
