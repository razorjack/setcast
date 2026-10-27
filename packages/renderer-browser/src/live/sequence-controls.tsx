import { SequenceEnergy, SceneEnergy } from './sequence-energy.tsx';
import type { LiveSequence } from './sequence.ts';
import type { SceneBank } from './bank.tsx';
import { downloadJson } from './diagnostics.tsx';

interface Props {
  sequence: LiveSequence;
  bank: SceneBank;
  available: boolean;
  active: string | null;
}
export function SequenceControls(props: Props) {
  const { sequence, bank } = props;
  let status = sequence.running ? 'Running' : 'Held';
  if (sequence.pending) status = 'Transitioning';
  return (
    <details
      className="sc-sequence"
      data-running={sequence.running}
      data-pending={sequence.pending}
      data-index={sequence.index}
    >
      <summary>Automatic sequence · {status}</summary>
      <SequenceActions {...props} />
      <SequenceEnergy sequence={sequence} />
      <ol className="sc-sequence-rows">
        {sequence.scenes.map((entry, index) => (
          <SequenceRow
            key={index}
            sequence={sequence}
            index={index}
            title={
              bank.scenes.find((scene) => scene.preset === entry.preset)?.title ?? entry.preset
            }
          />
        ))}
      </ol>
      <SequenceAdd {...props} />
      <p>
        Dwell starts after fade-in. Input loss and blackout pause dwell. Manual scene recall holds
        the sequence. Export settings to reuse in live.yaml.
      </p>
    </details>
  );
}
function SequenceActions({ sequence, available, active }: Props) {
  return (
    <div className="sc-performance-timing">
      <button
        className="sc-button"
        disabled={!sequence.running && (!available || sequence.pending || !sequence.scenes.length)}
        onClick={() => (sequence.running ? sequence.hold() : sequence.start(active))}
      >
        {sequence.running ? 'Hold sequence' : 'Run sequence'}
      </button>
      <button
        className="sc-button"
        disabled={!available || sequence.pending || !sequence.scenes.length}
        onClick={() => sequence.next()}
      >
        Next scene
      </button>
      <label>
        <input
          type="checkbox"
          checked={sequence.loop}
          onChange={(event) => sequence.configure(sequence.scenes, event.target.checked)}
        />
        Loop sequence
      </label>
      <button
        className="sc-button"
        disabled={!sequence.scenes.length}
        onClick={() =>
          downloadJson('sequence.json', {
            sequence: {
              scenes: sequence.scenes,
              loop: sequence.loop,
              mode: sequence.mode,
              energy: sequence.energy,
            },
          })
        }
      >
        Export sequence
      </button>
    </div>
  );
}
function SequenceAdd({ sequence, bank }: Props) {
  return (
    <label>
      Add scene{' '}
      <select
        aria-label="Add sequence scene"
        value=""
        disabled={sequence.scenes.length >= 64}
        onChange={(event) => {
          if (event.target.value)
            sequence.configure(
              [...sequence.scenes, { preset: event.target.value, seconds: 60 }],
              sequence.loop,
            );
        }}
      >
        <option value="">Choose saved scene</option>
        {bank.scenes.map((scene) => (
          <option key={scene.preset} value={scene.preset}>
            {scene.title}
          </option>
        ))}
      </select>
    </label>
  );
}
function SequenceRow({
  sequence,
  index,
  title,
}: {
  sequence: LiveSequence;
  index: number;
  title: string;
}) {
  const entry = sequence.scenes[index]!;
  return (
    <li data-active={sequence.index === index}>
      <span>{title}</span>
      <SceneEnergy sequence={sequence} index={index} />
      <label>
        Dwell (s)
        <input
          aria-label={`Scene ${index + 1} dwell`}
          type="number"
          min={5}
          max={3600}
          value={entry.seconds}
          onChange={(event) => changeDwell(sequence, index, Number(event.target.value))}
        />
      </label>
      <button
        className="sc-button"
        aria-label={`Move scene ${index + 1} up`}
        disabled={index === 0}
        onClick={() => moveUp(sequence, index)}
      >
        ↑
      </button>
      <button
        className="sc-button"
        aria-label={`Remove scene ${index + 1}`}
        onClick={() =>
          sequence.configure(
            sequence.scenes.filter((_, row) => row !== index),
            sequence.loop,
          )
        }
      >
        Remove
      </button>
    </li>
  );
}

function changeDwell(sequence: LiveSequence, index: number, seconds: number) {
  if (seconds >= 5 && seconds <= 3600)
    sequence.configure(
      sequence.scenes.map((scene, row) => (row === index ? { ...scene, seconds } : scene)),
      sequence.loop,
    );
}
function moveUp(sequence: LiveSequence, index: number) {
  const scenes = [...sequence.scenes];
  [scenes[index - 1], scenes[index]] = [scenes[index]!, scenes[index - 1]!];
  sequence.configure(scenes, sequence.loop);
}
