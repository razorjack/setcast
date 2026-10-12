import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';

// This microbenchmark deliberately measures the scheduler in the installed Remotion version.
const require = createRequire(new URL('../package.json', import.meta.url));
const { nextFrameToRenderState } =
  require('./node_modules/@remotion/renderer/dist/next-frame-to-render.js') as {
    nextFrameToRenderState(
      this: void,
      options: {
        allFramesAndExtraFrames: number[];
        concurrencyOrFramesToRender: number;
      },
    ): { getNextFrame(pageIndex: number): number };
  };

const { values } = parseArgs({ options: { full: { type: 'boolean' } } });
const sizes = values.full ? [1800, 18000, 54000, 108000] : [1800, 18000];

for (const frames of sizes) {
  const scheduler = nextFrameToRenderState({
    allFramesAndExtraFrames: Array.from({ length: frames }, (_, index) => index),
    concurrencyOrFramesToRender: 5,
  });
  const start = performance.now();
  for (let frame = 0; frame < frames; frame++) scheduler.getNextFrame(frame % 5);
  process.stdout.write(
    `${JSON.stringify({ frames, schedulingSeconds: (performance.now() - start) / 1000 })}\n`,
  );
}

for (const frames of [1800, 18000, 54000, 108000, 216000]) {
  measureAssetScan(frames, false);
  measureAssetScan(frames, true);
}

function measureAssetScan(frames: number, legacyAudio: boolean) {
  const assets = Array.from({ length: frames }, (_, frame) => ({
    frame,
    audioAndVideoAssets: legacyAudio
      ? [{ id: 'audio', src: 'http://localhost/public/set.wav', frame }]
      : [],
    artifactAssets: [],
  }));
  let checksum = 0;
  const iterations = 100;
  const start = performance.now();
  for (let iteration = 0; iteration < iterations; iteration++) {
    // Inline master audio leaves these lists empty, but Remotion still scans all frame records.
    const available = assets.filter(Boolean);
    const audio = available.map((asset) => asset.audioAndVideoAssets).flat(2);
    const artifacts = available.map((asset) => asset.artifactAssets).flat(2);
    checksum += audio.length + artifacts.length;
  }
  process.stdout.write(
    `${JSON.stringify({ frames, legacyAudio, assetScanMilliseconds: (performance.now() - start) / iterations, checksum })}\n`,
  );
}
