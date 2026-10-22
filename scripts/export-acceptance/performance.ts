import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { AcceptanceContext } from './readiness.ts';
import { pixels } from './measure.ts';

export async function checkPerformance({ exporter, project, projectDir, out }: AcceptanceContext) {
  const scene = {
    ...project,
    css: project.css + '\n.setcast { background: white; } .setcast::after { display: none; }',
    automation: [
      {
        at: 0,
        from: { intensity: 1, brightness: 1 },
        to: { intensity: 0, brightness: 0 },
        duration: 2,
      },
    ],
  };
  const captures: Buffer[] = [];
  for (const [index, at] of [2, 1, 0, 1].entries()) {
    const file = join(out, `performance-${index}.png`);
    await exporter.still(scene, { projectDir, out: file, at });
    captures.push(pixels(file));
  }
  assert(
    captures[0]!.every((channel) => channel === 0),
    'Blackout must cover the entire composition, including theme overlays',
  );
  assert(
    captures[2]!.every((channel) => channel === 255),
    'Full brightness changed the white reference',
  );
  assert(
    captures[1]!.every((channel) => channel >= 127 && channel <= 128),
    'Mid-ramp brightness was not half strength',
  );
  assert(captures[1]!.equals(captures[3]!), 'Performance automation depends on frame order');
  console.log('  performance automation: blackout, mid-ramp brightness and backward seeks');
}
