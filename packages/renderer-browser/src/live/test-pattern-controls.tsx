import { TEST_PATTERNS, type TestPatternConfig } from '@setcast/core';
import type { LiveTestPattern } from './test-pattern.ts';

const help = {
  alignment: 'Check framing, crop and the inset guide on the camera or projector.',
  grayscale:
    'Check shadow and highlight separation in the camera image. Labels are signal percentages before level and brightness.',
  detail:
    'Check focus and moiré. Cell size is in composition pixels; window scaling changes the displayed size.',
  motion:
    'Compare motion at the camera settings you intend to use. Motion follows the capture clock; 0 freezes the bar.',
};

export function TestPatternControls({ testPattern }: { testPattern: LiveTestPattern }) {
  const { config, change, active, show } = testPattern;
  return (
    <details className="sc-test-pattern-settings">
      <summary>Camera test patterns · {active ? config.pattern : 'Off'}</summary>
      <div className="sc-output-options">
        <label className="sc-live-check">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => show(event.target.checked)}
          />
          Show test pattern
        </label>
        <label>
          Test image
          <select
            aria-label="Test image"
            value={config.pattern}
            onChange={(event) =>
              change({ pattern: event.target.value as TestPatternConfig['pattern'] })
            }
          >
            {TEST_PATTERNS.map((pattern) => (
              <option key={pattern} value={pattern}>
                {pattern}
              </option>
            ))}
          </select>
        </label>
        <PatternNumber
          label="Pattern level"
          value={config.level}
          min={0.1}
          max={1}
          step={0.05}
          change={(level) => change({ level })}
        />
        <PatternOptions config={config} change={change} />
      </div>
      <p>{help[config.pattern]}</p>
      <p>
        Brightness, blackout and input-loss fallback still apply. Choose Quiet scene in Output setup
        for a static test without input.
      </p>
      <PatternTransfer testPattern={testPattern} />
    </details>
  );
}

function PatternOptions({
  config,
  change,
}: {
  config: TestPatternConfig;
  change: LiveTestPattern['change'];
}) {
  if (config.pattern === 'motion')
    return (
      <PatternNumber
        label="Pattern speed (cycles/s)"
        value={config.speed}
        min={0}
        max={1}
        step={0.05}
        change={(speed) => change({ speed })}
      />
    );
  if (config.pattern === 'detail')
    return (
      <PatternNumber
        label="Pattern detail (px)"
        value={config.detailSize}
        min={1}
        max={64}
        step={1}
        change={(detailSize) => change({ detailSize })}
      />
    );
  if (config.pattern === 'alignment')
    return (
      <PatternNumber
        label="Pattern inset"
        value={config.safeArea}
        min={0}
        max={0.25}
        step={0.01}
        change={(safeArea) => change({ safeArea })}
      />
    );
  return null;
}

function PatternNumber({
  label,
  value,
  min,
  max,
  step,
  change,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  change: (value: number) => void;
}) {
  return (
    <label>
      {label} <output>{value}</output>
      <input
        aria-label={label}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => change(Number(event.target.value))}
      />
    </label>
  );
}

function PatternTransfer({ testPattern }: { testPattern: LiveTestPattern }) {
  return (
    <div className="sc-performance-timing">
      <button className="sc-button" onClick={testPattern.download}>
        Export test pattern settings
      </button>
      <label className="sc-button">
        Import test pattern settings
        <input
          className="sc-venue-file"
          aria-label="Import test pattern settings"
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void testPattern.upload(file);
            event.target.value = '';
          }}
        />
      </label>
    </div>
  );
}
