export class FrameReadiness {
  private pending = new Map<symbol, string>();
  revision = 0;
  committed = -1;
  effected = -1;
  error: Error | null = null;

  hold = (label: string) => {
    const token = Symbol(label);
    this.pending.set(token, label);
    this.revision++;
    return () => {
      if (this.pending.delete(token)) this.revision++;
    };
  };

  async settle(frame: number, timeout = 30_000) {
    const deadline = performance.now() + timeout;
    let quiet = 0;
    let revision = this.revision;
    while (quiet < 3) {
      if (this.error) throw this.error;
      if (performance.now() > deadline)
        throw new Error(
          `Frame ${frame} timed out waiting for ${[...this.pending.values()].join(', ') || 'React commit and paint'}. Check the named assets.`,
        );
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const ready = this.pending.size === 0 && this.committed === frame && this.effected === frame;
      quiet = ready && this.revision === revision ? quiet + 1 : 0;
      revision = this.revision;
    }
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode()));
    if (this.error) throw this.error;
  }
}
