import { useId } from 'react';
import { testPatternPhase, type TestPatternConfig } from '../../live/test-pattern.ts';

export interface TestPatternProps {
  config: TestPatternConfig;
  width: number;
  height: number;
  timeSeconds: number;
  /** Final output level, including blackout. Defaults to full brightness. */
  brightness?: number;
}

/** Output setup image, independent of themes, audio and renderer bindings. */
export function TestPattern({
  config,
  width,
  height,
  timeSeconds,
  brightness = 1,
}: TestPatternProps) {
  const id = useId();
  const phase = testPatternPhase(timeSeconds, config.speed);
  const size = Math.min(width, height);
  validateOutput(width, height, brightness);
  return (
    <div
      className="sc-calibration sc-test-pattern"
      data-pattern={config.pattern}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 2147483645,
        background: 'black',
        pointerEvents: 'none',
      }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          opacity: brightness * config.level,
        }}
        fontFamily="monospace"
        fontSize={size * 0.03}
        fill="white"
      >
        <PatternImage {...{ config, width, height, id, phase }} />
      </svg>
    </div>
  );
}

type PatternArea = Pick<TestPatternProps, 'width' | 'height' | 'config'>;

function validateOutput(width: number, height: number, brightness: number) {
  if (!(Number.isFinite(width) && width >= 4 && Number.isFinite(height) && height >= 4))
    throw new RangeError(
      `TestPattern received ${width}×${height}. Use finite composition dimensions of at least 4 pixels per side.`,
    );
  if (!Number.isFinite(brightness) || brightness < 0 || brightness > 1)
    throw new RangeError(
      `TestPattern received brightness=${brightness}. Use a finite output level from 0 to 1.`,
    );
}

function PatternImage({
  config,
  width,
  height,
  id,
  phase,
}: PatternArea & { id: string; phase: number }) {
  const size = Math.min(width, height);
  return (
    <>
      {config.pattern === 'alignment' ? (
        <Alignment {...{ width, height, config, id }} />
      ) : (
        <>
          <text x={width * 0.06} y={height * 0.1} fontSize={size * 0.045}>
            {config.pattern.toUpperCase()}
          </text>
          <text x={width * 0.06} y={height * 0.15} fill="#aaa">
            {width} × {height} · level {Math.round(config.level * 100)}%
          </text>
          {config.pattern === 'grayscale' && <Grayscale width={width} height={height} />}
          {config.pattern === 'detail' && <Detail {...{ width, height, config, id }} />}
          {config.pattern === 'motion' && <Motion {...{ width, height, config, phase }} />}
        </>
      )}
    </>
  );
}

function Alignment({ width, height, config, id }: PatternArea & { id: string }) {
  const unit = Math.min(width, height);
  return (
    <>
      <defs>
        <pattern id={id} width={width / 10} height={width / 10} patternUnits="userSpaceOnUse">
          <path
            d={`M${width / 10} 0H0V${width / 10}`}
            fill="none"
            stroke="#465156"
            strokeWidth={unit / 300}
          />
        </pattern>
      </defs>
      <rect width={width} height={height} fill="#101719" />
      <rect
        x={2}
        y={2}
        width={width - 4}
        height={height - 4}
        fill={`url(#${id})`}
        stroke="#b6d5dc"
        strokeWidth={3}
      />
      <path
        d={`M${width / 2} 0V${height}M0 ${height / 2}H${width}`}
        stroke="#dfae51"
        strokeWidth={unit / 200}
      />
      <FramingGuides {...{ width, height, config }} />
      <g fill="#dbe9ec" fontSize={unit * 0.04}>
        <text x={width * 0.03} y={height * 0.08}>
          1 · TOP LEFT
        </text>
        <text x={width * 0.97} y={height * 0.08} textAnchor="end">
          2 · TOP RIGHT
        </text>
        <text x={width * 0.97} y={height * 0.94} textAnchor="end">
          3 · BOTTOM RIGHT
        </text>
        <text x={width * 0.03} y={height * 0.94}>
          4 · BOTTOM LEFT
        </text>
      </g>
    </>
  );
}

function FramingGuides({ width, height, config }: PatternArea) {
  const unit = Math.min(width, height);
  const inset = config.safeArea;
  return (
    <>
      <circle
        cx={width / 2}
        cy={height / 2}
        r={unit * 0.2}
        stroke="#b6d5dc"
        strokeWidth={unit / 200}
        fill="none"
      />
      {inset > 0 && (
        <rect
          x={width * inset}
          y={height * inset}
          width={width * (1 - 2 * inset)}
          height={height * (1 - 2 * inset)}
          fill="none"
          stroke="#ddd"
          strokeWidth={unit / 400}
          strokeDasharray={`${unit / 80} ${unit / 80}`}
        />
      )}
    </>
  );
}

function Grayscale({ width, height }: Pick<PatternArea, 'width' | 'height'>) {
  return (
    <>
      <GraySteps
        width={width}
        top={height * 0.24}
        height={height * 0.25}
        levels={[0, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 1]}
      />
      <GraySteps
        width={width}
        top={height * 0.64}
        height={height * 0.1}
        levels={[0, 0.01, 0.02, 0.04, 0.06, 0.08, 0.1, 0.12]}
      />
      <GraySteps
        width={width}
        top={height * 0.82}
        height={height * 0.1}
        levels={[0.88, 0.9, 0.92, 0.94, 0.96, 0.98, 0.99, 1]}
      />
      <text x={width * 0.06} y={height * 0.59} fill="#aaa">
        SHADOWS / HIGHLIGHTS
      </text>
    </>
  );
}

function GraySteps({
  width,
  top,
  height,
  levels,
}: {
  width: number;
  top: number;
  height: number;
  levels: number[];
}) {
  const cell = (width * 0.88) / levels.length;
  return (
    <g transform={`translate(${width * 0.06} ${top})`}>
      {levels.map((level, index) => {
        const code = Math.round(level * 255);
        return (
          <g key={index} transform={`translate(${index * cell} 0)`}>
            <rect width={cell} height={height} fill={`rgb(${code} ${code} ${code})`} />
            <text x={cell / 2} y={-8} textAnchor="middle" fill="#aaa" fontSize={cell * 0.22}>
              {Math.round(level * 100)}%
            </text>
          </g>
        );
      })}
    </g>
  );
}

function Detail({ width, height, config, id }: PatternArea & { id: string }) {
  const pixel = config.detailSize;
  return (
    <>
      <DetailTiles id={id} pixel={pixel} />
      <g shapeRendering="crispEdges">
        <rect
          x={width * 0.06}
          y={height * 0.23}
          width={width * 0.42}
          height={height * 0.28}
          fill={`url(#${id}-vertical)`}
        />
        <rect
          x={width * 0.52}
          y={height * 0.23}
          width={width * 0.42}
          height={height * 0.28}
          fill={`url(#${id}-horizontal)`}
        />
        <rect
          x={width * 0.06}
          y={height * 0.57}
          width={width * 0.88}
          height={height * 0.28}
          fill={`url(#${id}-checker)`}
        />
      </g>
      <text x={width * 0.06} y={height * 0.94} fill="#aaa">
        {pixel} px cells · composition pixels
      </text>
    </>
  );
}

function DetailTiles({ id, pixel }: { id: string; pixel: number }) {
  return (
    <defs>
      <pattern
        id={`${id}-vertical`}
        width={pixel * 2}
        height={pixel * 2}
        patternUnits="userSpaceOnUse"
      >
        <rect width={pixel} height={pixel * 2} fill="white" />
      </pattern>
      <pattern
        id={`${id}-horizontal`}
        width={pixel * 2}
        height={pixel * 2}
        patternUnits="userSpaceOnUse"
      >
        <rect width={pixel * 2} height={pixel} fill="white" />
      </pattern>
      <pattern
        id={`${id}-checker`}
        width={pixel * 2}
        height={pixel * 2}
        patternUnits="userSpaceOnUse"
      >
        <path
          d={`M0 0h${pixel}v${pixel}H0zM${pixel} ${pixel}h${pixel}v${pixel}h-${pixel}z`}
          fill="white"
        />
      </pattern>
    </defs>
  );
}

function Motion({ width, height, config, phase }: PatternArea & { phase: number }) {
  const barWidth = width * 0.12;
  return (
    <>
      <rect x={0} y={height * 0.25} width={width} height={height * 0.5} fill="#181818" />
      {Array.from({ length: 9 }, (_, index) => (
        <path
          key={index}
          d={`M${(width * (index + 1)) / 10} ${height * 0.23}v${height * 0.54}`}
          stroke="#555"
          strokeWidth={1}
        />
      ))}
      <rect
        className="sc-test-motion"
        x={phase * (width + barWidth) - barWidth}
        y={height * 0.32}
        width={barWidth}
        height={height * 0.36}
        fill="#ddd"
      />
      <text x={width * 0.06} y={height * 0.85} fill="#aaa">
        {config.speed === 0
          ? 'Motion frozen'
          : `${config.speed} cycles/s · ${(1 / config.speed).toFixed(1)} s per pass`}
      </text>
    </>
  );
}
