import { formatTime } from '../../time.ts';
import { useFrame } from '../frame.tsx';

export function Header() {
  const { timeSeconds, composition } = useFrame();
  const { clockOffset } = composition.project;
  return (
    <header className="sc-header">
      <span className="sc-set-title">{composition.project.title}</span>
      <span className="sc-clock">
        {formatTime(clockOffset + timeSeconds)}
        <span className="sc-clock-total">
          {' '}
          / {formatTime(clockOffset + composition.durationSeconds)}
        </span>
      </span>
    </header>
  );
}
