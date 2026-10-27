import type { FramePreview } from './frame-preview.ts';
import { useShortcuts } from '../player/keyboard.ts';

type TransportProps = { session: FramePreview; count: number; fps: number };
export function PreviewTransport({ session, count, fps }: TransportProps) {
  const { requested, seek, playing, setPlaying, error } = session;
  const toggle = () => {
    if (!error) setPlaying(!playing);
  };
  useShortcuts({
    ArrowLeft: () => seek(requested - 1),
    ArrowRight: () => seek(requested + 1),
    Home: () => seek(0),
    End: () => seek(count - 1),
    ' ': toggle,
  });
  return (
    <footer className="sp-transport">
      <input
        className="sp-scrubber"
        type="range"
        aria-label="Frame timeline"
        min="0"
        max={count - 1}
        step="1"
        value={requested}
        onChange={(event) => seek(event.target.valueAsNumber)}
      />
      <div className="sp-transport-row">
        <FrameNavigation session={session} count={count} toggle={toggle} />
        <FramePosition session={session} count={count} fps={fps} />
      </div>
      <p>
        Silent frame inspection. ← / → step · Home / End jump · Space plays. Use setcast play for
        audio.
      </p>
    </footer>
  );
}
function FrameNavigation({
  session,
  count,
  toggle,
}: {
  session: FramePreview;
  count: number;
  toggle: () => void;
}) {
  const { requested, seek, playing, error } = session;
  return (
    <>
      <button aria-label="First frame" disabled={requested === 0} onClick={() => seek(0)}>
        │←
      </button>
      <button
        aria-label="Previous frame"
        disabled={requested === 0}
        onClick={() => seek(requested - 1)}
      >
        ←
      </button>
      <button
        className="sp-play"
        disabled={Boolean(error) || requested === count - 1}
        onClick={toggle}
      >
        {playing ? 'Pause frames' : 'Play frames'}
      </button>
      <button
        aria-label="Next frame"
        disabled={requested === count - 1}
        onClick={() => seek(requested + 1)}
      >
        →
      </button>
      <button
        aria-label="Last frame"
        disabled={requested === count - 1}
        onClick={() => seek(count - 1)}
      >
        →│
      </button>
    </>
  );
}
function FramePosition({ session, count, fps }: TransportProps) {
  return (
    <>
      <label>
        Frame
        <input
          aria-label="Frame number"
          type="number"
          min="0"
          max={count - 1}
          step="1"
          value={session.requested}
          onChange={(event) => {
            if (Number.isFinite(event.target.valueAsNumber))
              session.seek(event.target.valueAsNumber);
          }}
        />
      </label>
      <span className="sp-time">
        {(session.requested / fps).toFixed(3)} s <span>/ {((count - 1) / fps).toFixed(3)} s</span>
      </span>
    </>
  );
}
