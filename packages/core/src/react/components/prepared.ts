import { useEffect } from 'react';
import { useHoldUntil } from '../renderer.tsx';

/** Values prepared once per key, such as fitted art, kept for every later frame. */
export class PreparedCache<T> {
  readonly name: string;
  private readonly preparing = new Map<string, Promise<T>>();
  private readonly prepared = new Map<string, T>();
  private readonly users = new Map<string, number>();
  private readonly dispose: (value: T) => void;
  private readonly capacity: number;

  /** `name` labels the frames held while a value is prepared. */
  constructor(name: string, dispose: (value: T) => void = () => {}, capacity = 4) {
    this.name = name;
    this.dispose = dispose;
    this.capacity = capacity;
  }

  retain(key: string): () => void {
    this.users.set(key, (this.users.get(key) ?? 0) + 1);
    let retained = true;
    return () => {
      if (!retained) return;
      retained = false;
      const count = (this.users.get(key) ?? 1) - 1;
      if (count) this.users.set(key, count);
      else this.users.delete(key);
      this.trim();
    };
  }

  prepare(key: string, make: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return Promise.resolve(cached);
    const pending = this.preparing.get(key);
    if (pending) return pending;
    const value = Promise.resolve()
      .then(make)
      .then((ready) => {
        this.prepared.set(key, ready);
        this.trim();
        return ready;
      })
      .finally(() => this.preparing.delete(key));
    this.preparing.set(key, value);
    return value;
  }

  get(key: string): T | undefined {
    const value = this.prepared.get(key);
    if (value !== undefined) {
      this.prepared.delete(key);
      this.prepared.set(key, value);
    }
    return value;
  }

  private trim(): void {
    let inactive = [...this.prepared.keys()].filter((key) => !this.users.has(key)).length;
    for (const [key, value] of this.prepared) {
      if (inactive <= this.capacity) break;
      if (this.users.has(key)) continue;
      this.prepared.delete(key);
      this.dispose(value);
      inactive--;
    }
  }
}

/**
 * Prepares the value for `request` once per key and holds the frame until it is ready. Null when
 * there is no request, and until the value is ready.
 */
export function usePrepared<Request, T>(
  cache: PreparedCache<T>,
  request: Request | null,
  keyOf: (request: Request) => string,
  make: (request: Request) => Promise<T>,
): T | null {
  const key = request === null ? null : keyOf(request);
  useEffect(() => (key === null ? undefined : cache.retain(key)), [cache, key]);
  const ready = useHoldUntil(`${cache.name}:${key ?? 'none'}`, () =>
    request === null || key === null ? Promise.resolve() : cache.prepare(key, () => make(request)),
  );
  if (key === null || !ready) return null;
  return cache.get(key) ?? null;
}
