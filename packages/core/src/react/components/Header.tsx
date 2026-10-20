import { formatTime } from '../../time.ts';
import { useFrame } from '../frame.tsx';

export function Header() {
  const { timeSeconds, composition } = useFrame();
  const { clockOffset, clockTotal } = composition.project;
  const { project, durationSeconds } = composition;
  const live = 'live' in project;
  const showClock = !live || project.live.clock;
  const total = durationSeconds === null ? null : (clockTotal ?? clockOffset + durationSeconds);
  if (!project.title && !showClock) return null;
  return (
    <header className="sc-header">
      <span className="sc-set-title">{composition.project.title}</span>
      {showClock && (
        <span className="sc-clock">
          {formatTime(clockOffset + timeSeconds)}
          {total !== null && <span className="sc-clock-total"> / {formatTime(total)}</span>}
        </span>
      )}
    </header>
  );
}
