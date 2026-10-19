import { formatTime } from '@setcast/core';
import type { PlaybackSnapshot } from './playback.ts';
import type { Transport } from '../transport.ts';

export function Controls({
  snapshot,
  transport,
  audio,
  fullscreen,
  clean,
}: {
  snapshot: PlaybackSnapshot;
  transport: Transport;
  audio: HTMLAudioElement;
  fullscreen: () => void;
  clean: () => void;
}) {
  let state = snapshot.playing ? 'Playing' : 'Paused';
  if (snapshot.waiting) state = 'Preparing';
  return (
    <footer className="sc-player-controls">
      <div className="sc-player-transport">
        <strong className="sc-player-brand">SETCAST</strong>
        <button
          className="sc-player-play"
          disabled={Boolean(snapshot.error)}
          onClick={() => (snapshot.playing ? transport.pause() : transport.play())}
        >
          {snapshot.playing ? 'Pause' : 'Play'}
        </button>
        <span className="sc-player-time">
          {formatTime(snapshot.time)} <span>/ {formatTime(transport.duration)}</span>
        </span>
        <span className="sc-player-status" role="status">
          {state}
        </span>
        <Volume audio={audio} />
        <button onClick={clean}>Hide controls</button>
        <button onClick={fullscreen}>Fullscreen</button>
      </div>
      <input
        aria-label="Seek"
        className="sc-player-seek"
        type="range"
        min="0"
        max={transport.duration}
        step="any"
        value={snapshot.time}
        onChange={(event) => transport.seek(event.currentTarget.valueAsNumber)}
      />
    </footer>
  );
}

function Volume({ audio }: { audio: HTMLAudioElement }) {
  return (
    <label className="sc-player-volume">
      Volume{' '}
      <input
        aria-label="Volume"
        type="range"
        min="0"
        max="1"
        step="0.01"
        defaultValue="1"
        onChange={(event) => {
          audio.volume = event.currentTarget.valueAsNumber;
        }}
      />
    </label>
  );
}
