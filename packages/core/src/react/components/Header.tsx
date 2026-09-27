import { formatTime } from '../../time.ts';
import { useFrame } from '../frame.tsx';

export function Header() {
  const { timeSeconds, composition } = useFrame();
  const { clockOffset, clockTotal } = composition.project;
  const total = clockTotal ?? clockOffset + composition.durationSeconds;
  return (
    <header className="sc-header">
      <span className="sc-set-title">{composition.project.title}</span>
      <span className="sc-clock">
        {formatTime(clockOffset + timeSeconds)}
        <span className="sc-clock-total"> / {formatTime(total)}</span>
      </span>
    </header>
  );
}
