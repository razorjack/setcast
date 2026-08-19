import { formatTime } from '../../time.ts';
import { useFrame } from '../frame.tsx';

export function Header() {
  const { timeSeconds, composition } = useFrame();
  return (
    <header className="sc-header">
      <span className="sc-set-title">{composition.project.title}</span>
      <span className="sc-clock">
        {formatTime(timeSeconds)}
        <span className="sc-clock-total"> / {formatTime(composition.durationSeconds)}</span>
      </span>
    </header>
  );
}
