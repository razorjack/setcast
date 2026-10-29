import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { runAcceptance } from '../../../scripts/export-acceptance/suite.ts';
import { render, still, withRenderSession } from '../src/export/index.ts';
import { hardwareEncoder } from '../src/export/hardware.ts';

const { values } = parseArgs({
  options: { out: { type: 'string', default: 'examples/demo/out/hardware-export-acceptance' } },
});
const expected = hardwareEncoder(process.platform);
assert(expected, `No hardware encoder configured for ${process.platform}.`);
let encoded = 0;
await runAcceptance(
  {
    withRenderSession,
    still,
    render: (project, options) =>
      render(project, {
        ...options,
        hardwareAcceleration: 'required',
        videoBitrate: '12M',
        crf: undefined,
        x264Preset: undefined,
        onRuntime: (event) => {
          options.onRuntime?.(event);
          if (event.kind === 'encoding-selection') {
            assert.equal(event.encoder, expected);
            assert.equal(event.fallback, null);
          }
          if (event.kind === 'encoder') {
            assert.equal(event.encoder, expected);
            encoded++;
          }
        },
      }),
  },
  resolve(values.out),
);
assert(encoded > 0, 'No hardware video encode was observed.');
process.stdout.write(`Hardware acceptance: PASS (${expected}, ${encoded} encoded chunks)\n`);
