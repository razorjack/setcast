import type { FramePreview, Inspection } from './frame-preview.ts';
import { useReadiness } from './frame-preview.ts';

export function Inspector({ session }: { session: FramePreview }) {
  const status = useReadiness(session.driver);
  const inspection = session.inspection;
  let label = 'Ready';
  if (session.busy) label = `Preparing · ${status.phase}`;
  if (session.error) label = 'Failed';
  return (
    <>
      <section>
        <h2>Frame readiness</h2>
        <p role="status" className="sp-status" data-phase={session.busy ? status.phase : 'ready'}>
          {label}
        </p>
        {status.labels.length > 0 && (
          <ul className="sp-holds">
            {status.labels.map((label, index) => (
              <li key={index} title={label}>
                {label.slice(0, 160)}
              </li>
            ))}
          </ul>
        )}
        {inspection && <FrameDetails inspection={inspection} />}
      </section>
      {inspection && (
        <>
          <AudioInspector inspection={inspection} />
          <MixInspector inspection={inspection} />
        </>
      )}
    </>
  );
}
function AudioInspector({ inspection }: { inspection: Inspection }) {
  const audio = inspection.frame.audio;
  return (
    <section>
      <h2>Rendered audio features</h2>
      <div className="sp-bands">
        {(['bass', 'mids', 'highs', 'rms', 'onset'] as const).map((band) => (
          <label key={band}>
            {band}
            <meter min="0" max="1" value={audio[band]} />
            <output>{audio[band].toFixed(3)}</output>
          </label>
        ))}
      </div>
      <svg className="sp-spectrum" viewBox="0 0 256 72" role="img" aria-label="64 frequency bins">
        {audio.bins.map((level, index) => (
          <rect key={index} x={index * 4} y={72 - level * 72} width="3" height={level * 72} />
        ))}
      </svg>
    </section>
  );
}
function MixInspector({ inspection }: { inspection: Inspection }) {
  const { mix, modulation, composition } = inspection.frame;
  return (
    <section>
      <h2>Scene &amp; timeline</h2>
      <dl>
        <dt>Theme</dt>
        <dd>{composition.project.theme}</dd>
        <dt>Section</dt>
        <dd>{mix.mixSection?.kind ?? 'None'}</dd>
        <dt>Current plays</dt>
        <dd>{mix.currentPlayCount}</dd>
      </dl>
      <ul className="sp-credits">
        {mix.currentPlays.map(({ play, recording }) => (
          <li key={play.id}>
            <strong>{recording.title}</strong>
            <span>
              {play.id}
              {mix.focusPlays.some((current) => current.play.id === play.id) ? ' · focused' : ''}
            </span>
          </li>
        ))}
      </ul>
      <details>
        <summary>Modulation values</summary>
        <pre>{JSON.stringify(modulation, null, 2)}</pre>
      </details>
    </section>
  );
}

function FrameDetails({ inspection }: { inspection: Inspection }) {
  return (
    <>
      <dl>
        <dt>Inspected frame</dt>
        <dd>{inspection.frame.frame}</dd>
        <dt>Time</dt>
        <dd>{inspection.frame.timeSeconds.toFixed(6)} s</dd>
        <dt>PCM windows</dt>
        <dd>{inspection.windows} / 2</dd>
      </dl>
      {inspection.timings && (
        <dl>
          {Object.entries(inspection.timings).map(([phase, milliseconds]) => (
            <div key={phase}>
              <dt>{phase.replace('Ms', '')}</dt>
              <dd>{milliseconds.toFixed(1)} ms</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
