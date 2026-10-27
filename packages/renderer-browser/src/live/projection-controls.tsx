import { ProfileImport } from './profile-import.tsx';
import { ProjectionSchema, type Projection } from '@setcast/core';
import type { LiveProjection } from './projection-settings.ts';
import { CornerEditor, FractionInput } from './projection-editor.tsx';

type Settings = LiveProjection;
export function ProjectionControls({ projection }: { projection: Settings }) {
  const { config, change } = projection;
  return (
    <details className="sc-projection-settings">
      <summary>Projector setup · {config.enabled ? 'Enabled' : 'Off'}</summary>
      <div className="sc-performance-timing">
        <label>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(event) => {
              change({ ...config, enabled: event.target.checked });
            }}
          />
          Enable projection correction
        </label>
        <label>
          <input
            type="checkbox"
            checked={projection.pattern}
            onChange={(event) => projection.setPattern(event.target.checked)}
          />
          Show calibration pattern
        </label>
        <button
          className="sc-button"
          onClick={() => change(ProjectionSchema.parse({ enabled: config.enabled }))}
        >
          Reset geometry
        </button>
      </div>
      <p>
        Match the numbered corners to the screen. Crop trims the source; masks cover fixed output
        areas. To calibrate without input, choose Quiet scene in Output setup.
      </p>
      <div className="sc-projection-layout">
        <CornerEditor config={config} change={change} />
        <div>
          <CropControls config={config} change={change} />
          <MaskControls config={config} change={change} />
        </div>
      </div>
      <VenueControls projection={projection} />
    </details>
  );
}

function CropControls({ config, change }: { config: Projection; change: Settings['change'] }) {
  return (
    <fieldset>
      <legend>Source crop (%)</legend>
      <div className="sc-projection-numbers">
        {(['top', 'right', 'bottom', 'left'] as const).map((edge) => (
          <FractionInput
            key={edge}
            label={`Crop ${edge}`}
            value={config.crop[edge]}
            change={(amount) => change({ ...config, crop: { ...config.crop, [edge]: amount } })}
          />
        ))}
      </div>
    </fieldset>
  );
}
function MaskControls({ config, change }: { config: Projection; change: Settings['change'] }) {
  const update = (index: number, key: keyof Projection['masks'][number], amount: number) =>
    change({
      ...config,
      masks: config.masks.map((mask, row) => (row === index ? { ...mask, [key]: amount } : mask)),
    });
  return (
    <fieldset>
      <legend>Output masks (%)</legend>
      {config.masks.map((mask, index) => (
        <div key={index} className="sc-projection-mask-row">
          <div className="sc-projection-numbers">
            {(['left', 'top', 'width', 'height'] as const).map((key) => (
              <FractionInput
                key={key}
                label={`Mask ${index + 1} ${key}`}
                value={mask[key]}
                change={(amount) => update(index, key, amount)}
              />
            ))}
          </div>
          <button
            className="sc-button"
            onClick={() =>
              change({ ...config, masks: config.masks.filter((_, row) => row !== index) })
            }
          >
            Remove mask {index + 1}
          </button>
        </div>
      ))}
      <button
        className="sc-button"
        disabled={config.masks.length >= 8}
        onClick={() =>
          change({
            ...config,
            masks: [...config.masks, { left: 0.4, top: 0.4, width: 0.2, height: 0.2 }],
          })
        }
      >
        Add mask
      </button>
    </fieldset>
  );
}
function VenueControls({ projection }: { projection: Settings }) {
  return (
    <fieldset>
      <legend>Venue profiles</legend>
      <div className="sc-performance-timing">
        <label>
          Venue name
          <input
            aria-label="Venue name"
            maxLength={80}
            value={projection.name}
            onChange={(event) => projection.setName(event.target.value)}
          />
        </label>
        <button className="sc-button" onClick={projection.save}>
          Save venue
        </button>
        <select
          aria-label="Load saved venue"
          value=""
          onChange={(event) => {
            const venue = projection.venues.saved.find(
              (entry) => entry.name === event.target.value,
            );
            if (venue) projection.apply(venue);
          }}
        >
          <option value="">Load saved venue</option>
          {projection.venues.saved.map((venue) => (
            <option key={venue.name}>{venue.name}</option>
          ))}
        </select>
        <VenueTransfer projection={projection} />
        <button
          className="sc-button"
          disabled={!projection.venues.saved.some((venue) => venue.name === projection.name)}
          onClick={() => projection.venues.remove(projection.name)}
        >
          Remove saved venue
        </button>
      </div>
      <p>
        Saved in this browser for this localhost address. Export a backup for another machine.
        Saving an existing name replaces that profile.
      </p>
    </fieldset>
  );
}

function VenueTransfer({ projection }: { projection: Settings }) {
  return (
    <>
      <button className="sc-button" onClick={projection.download}>
        Export venue
      </button>
      <ProfileImport label="Import venue" upload={projection.upload} />
    </>
  );
}
