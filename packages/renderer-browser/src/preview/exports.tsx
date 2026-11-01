import { useEffect, useState } from 'react';
import type { PreviewExportJob, PreviewExportsState } from './jobs-contract.ts';
import type { RangeSelection } from './timeline.tsx';

export function PreviewExports({
  revision,
  range,
  invalid,
  queue,
}: {
  revision: number;
  range: RangeSelection;
  invalid: boolean;
  queue: ExportQueue;
}) {
  if (queue.unavailable) return null;
  return (
    <section className="sp-exports">
      <h2>Exports</h2>
      <button
        disabled={!queue.state || queue.pending || invalid}
        onClick={() => void queue.send('', { revision, first: range.first, last: range.last })}
      >
        Export selected range
      </button>
      {queue.error && <p role="alert">{queue.error}</p>}
      {queue.state && (
        <>
          <p>H.264 + AAC or PNG reference · Saves to {queue.state.directory}</p>
          <p>One export at a time. Project edits cancel unfinished jobs.</p>
          <ol>
            {queue.state.jobs.map((job) => (
              <ExportJob
                key={job.id}
                job={job}
                revision={revision}
                disabled={queue.pending || invalid}
                send={queue.send}
              />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
function ExportJob({
  job,
  revision,
  disabled,
  send,
}: {
  job: PreviewExportJob;
  revision: number;
  disabled: boolean;
  send: (path: string, body?: object) => Promise<void>;
}) {
  const active = job.status === 'running' || job.status === 'queued';
  return (
    <li data-export-id={job.id} data-export-status={job.status}>
      <strong>
        {job.kind === 'reference' ? `Reference ${job.first}` : `${job.first}–${job.last}`} ·{' '}
        {job.status}
      </strong>
      <span>
        {job.title} · {job.fps} fps
      </span>
      <JobProgress job={job} />
      {job.error && <p role="status">{job.error}</p>}
      {active && (
        <button disabled={disabled} onClick={() => void send(`/${job.id}/cancel`)}>
          Cancel export
        </button>
      )}
      {!active && job.status !== 'complete' && (
        <button
          disabled={disabled || job.revision !== revision}
          onClick={() => void send(`/${job.id}/resume`)}
        >
          {job.kind === 'reference' ? 'Retry reference' : 'Resume export'}
        </button>
      )}
      {job.status === 'complete' && (
        <a href={`/exports/${job.id}/file`} download>
          Download {job.kind === 'reference' ? 'PNG' : 'MP4'}
        </a>
      )}
      <details>
        <summary>Export details</summary>
        <p>{job.filename}</p>
        <pre>{JSON.stringify(job.runtime, null, 2)}</pre>
        {job.referenceRuntime && <pre>{JSON.stringify(job.referenceRuntime, null, 2)}</pre>}
      </details>
    </li>
  );
}

function JobProgress({ job }: { job: PreviewExportJob }) {
  if (!job.progress) return null;
  return (
    <>
      <progress aria-label="Export stage progress" max={1} value={job.progress.progress} />
      <span>
        {job.progress.stage} · {Math.round(job.progress.progress * 100)}%
        {job.progress.reusedFrames ? ` · ${job.progress.reusedFrames} frames reused` : ''}
      </span>
    </>
  );
}
export function useExportQueue() {
  const queue = useQueuePolling();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const send = async (path: string, body: object = {}) => {
    if (!queue.state || pending) return;
    setPending(true);
    setError(null);
    try {
      await exportRequest(queue.state.token, path, body);
      const refreshed = await fetch('/exports');
      if (!refreshed.ok)
        throw new Error('Cannot refresh the export queue. Check that preview is still running.');
      queue.setState(await refreshed.json());
    } catch (cause) {
      setError(String(cause));
    } finally {
      setPending(false);
    }
  };
  return { ...queue, error: error ?? queue.error, pending, send };
}
export type ExportQueue = ReturnType<typeof useExportQueue>;

interface ExportFrameOptions {
  queue: ExportQueue;
  revision: number;
  frame: number;
  invalid: boolean;
  showing: boolean;
  setShowing: (value: boolean) => void;
}
export function ExportFrameControls({
  queue,
  revision,
  frame,
  invalid,
  showing,
  setShowing,
}: ExportFrameOptions) {
  if (queue.unavailable) return null;
  const job = queue.state?.jobs.findLast(
    (job) => job.kind === 'reference' && job.revision === revision && job.first === frame,
  );
  return (
    <section>
      <h2>Export frame</h2>
      <p>
        Capture this frame with the exporter's pinned Chromium. Interactive playback uses your
        browser.
      </p>
      <button
        disabled={
          !queue.state ||
          queue.pending ||
          invalid ||
          job?.status === 'queued' ||
          job?.status === 'running'
        }
        onClick={() => {
          setShowing(true);
          void queue.send('', { kind: 'reference', revision, first: frame, last: frame });
        }}
      >
        Capture export frame
      </button>
      {job && (
        <p role="status">
          Frame {frame} · {job.status}
        </p>
      )}
      {job?.status === 'complete' && (
        <ExportFrameDisplay job={job} showing={showing} setShowing={setShowing} />
      )}
    </section>
  );
}
function useQueuePolling() {
  const [state, setState] = useState<PreviewExportsState | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let timer = 0;
    const poll = async () => {
      try {
        const response = await fetch('/exports', { signal: controller.signal });
        if (response.status === 404) {
          setUnavailable(true);
          return;
        }
        if (!response.ok)
          throw new Error(`Export queue returned ${response.status}. Restart preview and retry.`);
        const next = await response.json();
        if (controller.signal.aborted) return;
        setState(next);
        setError(null);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(`Cannot refresh exports: ${String(cause)}`);
      }
      timer = window.setTimeout(() => void poll(), 500);
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  return { state, setState, unavailable, error };
}
async function exportRequest(token: string, path: string, body: object) {
  const response = await fetch(`/exports${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Setcast-Export': token },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(
      [result.message ?? `Export request returned ${response.status}.`, result.hint]
        .filter(Boolean)
        .join(' '),
    );
  }
}

function ExportFrameDisplay({
  job,
  showing,
  setShowing,
}: Pick<ExportFrameOptions, 'showing' | 'setShowing'> & { job: PreviewExportJob }) {
  return (
    <>
      <label>
        <input
          type="checkbox"
          checked={showing}
          onChange={(event) => setShowing(event.target.checked)}
        />
        Show export frame
      </label>
      <p>Chromium {job.referenceRuntime?.chromium ?? 'unknown'} · PNG · paused frame only</p>
    </>
  );
}
