import type { MusicalPreview } from './playback.ts';
import { useShortcuts } from '../player/keyboard.ts';

type TransportProps = { session: MusicalPreview; count: number; fps: number };
export function PreviewTransport({ session, count, fps }: TransportProps) {
  const { requested, seek, playing, setPlaying, error } = session;
  const toggle = () => {
    if (!error && (session.mode === 'frames' || !session.audioError)) setPlaying(!playing);
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
      <PlaybackOptions session={session} />
      <p>
        {session.mode === 'audio'
          ? 'Audio drives playback; preview may skip frames. Pause for exact inspection.'
          : 'Silent playback waits for every frame.'}{' '}
        ← / → step · Home / End jump · Space plays.
      </p>
    </footer>
  );
}
type NavigationProps = Pick<TransportProps, 'session' | 'count'> & { toggle: () => void };
function FrameNavigation({ session, count, toggle }: NavigationProps) {
  const { requested, seek, playing, error } = session;
  const playLabel = `${playing ? 'Pause' : 'Play'} ${session.mode === 'audio' ? 'mix' : 'frames'}`;
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
        disabled={
          Boolean(error) ||
          (session.mode === 'audio' && Boolean(session.audioError)) ||
          (!playing && (session.busy || requested === count - 1))
        }
        onClick={toggle}
      >
        {playLabel}
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

function PlaybackOptions({ session }: { session: MusicalPreview }) {
  return (
    <div className="sp-playback-options">
      <label>
        Playback{' '}
        <select
          aria-label="Playback mode"
          value={session.mode}
          onChange={(event) =>
            session.setMode(event.target.value === 'frames' ? 'frames' : 'audio')
          }
        >
          <option value="audio">With audio</option>
          <option value="frames">Frame sequence (silent)</option>
        </select>
      </label>
      <label>
        Volume{' '}
        <input
          aria-label="Preview volume"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={session.volume}
          onChange={(event) => session.setVolume(event.target.valueAsNumber)}
        />
      </label>
      {session.audioWaiting && <span role="status">Buffering audio…</span>}
      {session.audioError && (
        <p role="alert">{session.audioError} Silent frame inspection remains available.</p>
      )}
    </div>
  );
}
