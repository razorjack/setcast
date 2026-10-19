import { framesWithinMix } from '@setcast/core';

export interface PlaybackMedia {
  currentTime: number;
  paused: boolean;
  ended: boolean;
  seeking: boolean;
  readyState: number;
  play: () => Promise<void>;
  pause: () => void;
}

export function playbackFrame(seconds: number, durationMicroseconds: number, fps: number): number {
  return Math.max(
    0,
    Math.min(framesWithinMix(durationMicroseconds, fps) - 1, Math.floor(seconds * fps)),
  );
}

/** Playback intent survives preparation pauses, but an explicit pause always cancels it. */
export class Transport {
  readonly media: PlaybackMedia;
  readonly duration: number;
  wanted = false;
  error: string | null = null;
  private blocked = true;
  private starting = false;
  private endRequested = false;
  private revision = 0;
  private readonly holds = new Set<symbol>();
  constructor(media: PlaybackMedia, duration: number) {
    this.media = media;
    this.duration = duration;
  }
  get waiting() {
    return this.blocked || this.holds.size > 0 || this.media.seeking || this.media.readyState < 3;
  }

  play() {
    if (this.endRequested || this.media.ended || this.media.currentTime >= this.duration)
      this.seek(0);
    this.error = null;
    this.wanted = true;
    this.synchronize();
  }

  pause() {
    this.wanted = false;
    this.revision++;
    this.media.pause();
  }

  seek(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > this.duration) {
      throw new RangeError(
        `Seek ${seconds} is outside this set. Choose seconds from 0 to ${this.duration}.`,
      );
    }
    this.revision++;
    this.media.pause();
    this.blocked = true;
    this.endRequested = seconds === this.duration;
    this.media.currentTime = seconds;
    if (this.endRequested) this.wanted = false;
  }

  hold = (_label: string): (() => void) => {
    const token = Symbol();
    this.holds.add(token);
    this.media.pause();
    return () => {
      this.holds.delete(token);
    };
  };

  update(ready: boolean) {
    this.blocked = !ready;
    if (this.media.ended || this.media.currentTime >= this.duration) this.pause();
    this.synchronize();
  }

  fail(error: unknown) {
    this.error = error instanceof Error ? error.message : String(error);
    this.pause();
  }

  private synchronize() {
    if (!this.wanted || this.waiting) {
      this.media.pause();
      return;
    }
    if (!this.media.paused || this.starting) return;
    this.starting = true;
    const revision = this.revision;
    void this.media
      .play()
      .then(
        () => {
          if (revision !== this.revision || !this.wanted || this.waiting) this.media.pause();
        },
        (error: unknown) => {
          if (revision === this.revision) this.fail(error);
        },
      )
      .finally(() => {
        this.starting = false;
      });
  }
}
