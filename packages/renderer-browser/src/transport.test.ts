import { describe, expect, test, vi } from 'vite-plus/test';
import { playbackFrame, Transport, type PlaybackMedia } from './transport.ts';

function setup() {
  const media: PlaybackMedia = {
    currentTime: 0,
    paused: true,
    ended: false,
    seeking: false,
    readyState: 4,
    play: vi.fn(async () => {
      media.paused = false;
    }),
    pause: vi.fn(() => {
      media.paused = true;
    }),
  };
  return { media, transport: new Transport(media, 30) };
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test('frame sampling follows the audio clock, skips missed callbacks and holds the last valid frame', () => {
  expect([0, 0.01, 0.1, 20, 1, 30].map((time) => playbackFrame(time, 30_000_000, 30))).toEqual([
    0, 0, 3, 600, 30, 899,
  ]);
  expect(playbackFrame(0.066667, 66_667, 30)).toBe(1);
  expect(playbackFrame(0.066668, 66_668, 30)).toBe(2);
});

describe('transport', () => {
  test('waits for preparation, preserves intent through buffering, and honors explicit pause', async () => {
    const { media, transport } = setup();
    transport.play();
    expect(media.play).not.toHaveBeenCalled();
    transport.update(true);
    await flush();
    expect(media.paused).toBe(false);
    media.currentTime = 12;
    transport.update(false);
    expect(media.paused).toBe(true);
    expect(transport.wanted).toBe(true);
    transport.pause();
    transport.update(true);
    await flush();
    expect(media.paused).toBe(true);
    expect(media.currentTime).toBe(12);
  });

  test('seeks prepare the destination before resuming and independent holds cannot release each other', async () => {
    const { media, transport } = setup();
    transport.update(true);
    transport.play();
    await flush();
    transport.seek(18);
    expect(media.currentTime).toBe(18);
    expect(media.paused).toBe(true);
    const first = transport.hold('art');
    const second = transport.hold('fonts');
    first();
    first();
    transport.update(true);
    await flush();
    expect(media.paused).toBe(true);
    second();
    transport.update(true);
    await flush();
    expect(media.paused).toBe(false);
    expect(() => transport.seek(NaN)).toThrow(/Seek NaN/);
    expect(() => transport.seek(31)).toThrow(/0 to 30/);
  });

  test('ended playback stops at the endpoint and play starts a prepared replay', async () => {
    const { media, transport } = setup();
    media.currentTime = 30;
    transport.update(true);
    expect(transport.wanted).toBe(false);
    transport.play();
    expect(media.currentTime).toBe(0);
    expect(media.paused).toBe(true);
    transport.update(true);
    await flush();
    expect(media.paused).toBe(false);
  });

  test('a late play completion cannot undo a pause or seek', async () => {
    const { media, transport } = setup();
    let complete = () => {};
    media.play = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          complete = () => {
            media.paused = false;
            resolve();
          };
        }),
    );
    transport.update(true);
    transport.play();
    transport.seek(8);
    transport.pause();
    complete();
    await flush();
    expect(media.paused).toBe(true);
    expect(media.currentTime).toBe(8);
    expect(transport.wanted).toBe(false);
  });

  test('seeking to the end replays even when a codec clamps the native clock before the probed duration', async () => {
    const { media, transport } = setup();
    transport.seek(30);
    media.currentTime = 29.97;
    media.ended = false;
    transport.update(true);
    transport.play();
    expect(media.currentTime).toBe(0);
    expect(media.paused).toBe(true);
    transport.update(true);
    await flush();
    expect(media.paused).toBe(false);
  });

  test('playback rejection stops retrying and exposes the failure', async () => {
    const { media, transport } = setup();
    media.play = vi.fn(async () => {
      throw new Error('autoplay denied');
    });
    transport.update(true);
    transport.play();
    await flush();
    transport.update(true);
    expect(transport.error).toBe('autoplay denied');
    expect(media.play).toHaveBeenCalledOnce();
    expect(transport.wanted).toBe(false);
  });
});
