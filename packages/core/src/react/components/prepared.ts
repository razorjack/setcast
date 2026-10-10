import { useHoldUntil } from '../renderer.tsx';

/** Values prepared once per key, such as fitted art, kept for every later frame. */
export class PreparedCache<T> {
  readonly name: string;
  private readonly preparing = new Map<string, Promise<T>>();
  private readonly prepared = new Map<string, T>();

  /** `name` labels the frames held while a value is prepared. */
  constructor(name: string) {
    this.name = name;
  }

  prepare(key: string, make: () => Promise<T>): Promise<T> {
    const pending = this.preparing.get(key);
    if (pending) return pending;
    const value = make().then((ready) => {
      this.prepared.set(key, ready);
      return ready;
    });
    this.preparing.set(key, value);
    return value;
  }

  get(key: string): T | undefined {
    return this.prepared.get(key);
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
  const ready = useHoldUntil(`${cache.name}:${key ?? 'none'}`, () =>
    request === null || key === null ? Promise.resolve() : cache.prepare(key, () => make(request)),
  );
  if (key === null || !ready) return null;
  return cache.get(key) ?? null;
}
