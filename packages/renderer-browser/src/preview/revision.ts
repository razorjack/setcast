import { useEffect, useState } from 'react';
import type { ResolvedProject } from '@setcast/core';

export function usePreviewRevision() {
  const [state, setState] = useState<{
    revision: number;
    project?: ResolvedProject;
    error: string | null;
  }>({ revision: -1, error: null });
  useEffect(() => {
    const abort = new AbortController();
    let revision = -1;
    let timer = 0;
    const poll = async () => {
      try {
        const response = await fetch(`/preview.json?revision=${revision}`, {
          signal: abort.signal,
        });
        if (!response.ok)
          throw new Error(`Preview server returned ${response.status}. Restart setcast preview.`);
        const next = (await response.json()) as typeof state;
        if (abort.signal.aborted) return;
        revision = next.revision;
        setState((previous) => ({ ...previous, ...next }));
      } catch (error) {
        if (abort.signal.aborted) return;
        setState((previous) => ({
          ...previous,
          error: `Cannot refresh preview: ${String(error)}. Check that setcast preview is still running.`,
        }));
      }
      timer = window.setTimeout(() => void poll(), 1000);
    };
    void poll();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, []);
  return state;
}
