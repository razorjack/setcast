import { chromium } from '../../../../packages/renderer-browser/node_modules/playwright/index.mjs';
const launch = chromium.launch.bind(chromium);
chromium.launch = options => launch({...options, args: [...(options?.args ?? []), '--disable-gpu-rasterization']});
await import('../../../../packages/renderer-browser/bench/worker-frames.ts');
