# ProRes 4444 and transparent Stage qualification

The browser exporter preserves straight alpha through PNG capture and ProRes 4444 encoding.
Both FFmpeg and the independent macOS AVFoundation decoder pass the predefined pixel limits.
The user-facing contract is [compositing output](../../compositing-output.md).

These development observations were produced from `fa4b67e` plus the implementation committed
with this report. `report.json` records the dirty development state explicitly. Runtime:
Playwright Chromium 156.0.8078.4, ANGLE Metal on Apple M1 Pro, FFmpeg 9.0.2, macOS 27.0.1.
The existing full-master resource run overlapped this correctness check. No timings here support
a throughput claim.

```sh
node packages/renderer-browser/bench/prores.ts --avfoundation --out NEW_DIRECTORY
```

`--avfoundation` requires macOS and Xcode command-line tools. The Swift fixture uses the older
AVAssetReader API to remain usable on earlier macOS releases; macOS 27 emits deprecation warnings.
It opens only the generated movie and writes raw decoded pixels. It does not change a user's
editor or OBS configuration.

## Results

The fixture exports absolute frames 32–94 at 640×360/30 fps. Its foreground includes moving
four-level alpha stripes, fine type, glow and a gradient mask. It deliberately requests an opaque
root background and root pseudo-element, which transparent Stage removes. The authored art is
also omitted. Every captured PNG is decoded as the reference. RGB comparisons composite straight
alpha over both black and white; undefined RGB in fully transparent pixels is not scored alone.

| Decoder | Maximum alpha error | Mean composite error | Maximum composite error |
| --- | ---: | ---: | ---: |
| Predeclared limit | 1 | 1.5 | 12 |
| FFmpeg | 1 | 0.11047 | 2.95687 |
| AVFoundation / BGRA | 1 | 0.10864 | 3.00393 |

Values are channel units out of 255. All 63 frames were compared. AVFoundation reports
`StraightAlpha`, BT.709 primaries/matrix and sRGB transfer; all presentation timestamps equal
`frame / 30` within 1 ns. Interpreting its BGRA output as premultiplied instead produces a large
error, which confirms that consumers must honor straight-alpha interpretation.

- Chunked and continuous exports have identical decoded video and PCM.
- The PCM track equals the independently decoded/padded source slice exactly and contains
  100,800 stereo samples at 48 kHz, including the fractional final-frame tail.
- Repeated cached export captures zero new frames and matches fresh output.
- Interrupted export reuses 30 completed frames and matches fresh decoded video/audio.
- Brightness 0, 0.5 and 1 produces maximum alpha 0, 128 and 255.
- All sixteen built-in landscape theme samples contain transparent and partial-alpha pixels.
  These are capture checks, not a claim that every theme has equal contrast on every receiving
  background. Relief's ridgeline geometry intentionally remains opaque.

The [review sheet](composite-review.png) shows selected PNGs composited by the pinned browser
over black and white. The first attempt failed only its expected frame-count assertion:
`[1.051, 3.1415]` correctly exports 62 frames under existing range rounding, while the fixture
expected the established acceptance range `[1.05, 8]`, which clamps to 63. The original report
is retained as `initial-range-failure.json`; the range implementation was unchanged.

## Limits and format choice

This verifies a local receiving API, not Final Cut/Premiere/Resolve project settings, OBS playback,
other platforms or sustained ProRes resource use. ProRes is the initial format for both transparent
compositing and editing. VP9 alpha remains unexposed; it needs independent alpha continuity and
container timing tests before reuse of the current chunk architecture.

Primary references: [FFmpeg ProRes options](https://www.ffmpeg.org/ffmpeg-codecs.html#ProRes),
[Apple ProRes white paper](https://www.apple.com/final-cut-pro/docs/Apple_ProRes.pdf),
[Apple alpha-channel interpretation](https://developer.apple.com/documentation/avfoundation/avmediacharacteristic/containsalphachannel),
[upstream transparent-video and chunk-boundary notes](https://www.remotion.dev/docs/transparent-videos).
[OBS portable-mode documentation](https://obsproject.com/kb/portable-mode) does not support an
isolated macOS portable profile, so this work did not modify the user's OBS setup.


## Integration checks

Full ready passes 688 tests in 115 files, formatting, lint/types, dependency isolation and decoded
H.264 smoke rendering. Both browser and Remotion exporter acceptance suites pass, including
assets, art transitions, video seeks/loops, GPU workers, failure cleanup and cancellation.
Fresh packed CLI checks pass ProRes render, clip, transparent PNG still, bundled thumbnail,
configuration validation and alpha/ProRes diagnostics. Logs are retained beside this report.
The package harness's rejected range/bundle and subminimum clip-duration attempts remain visible.
The final ready run ran separately from package validation; the full-master resource run continued.
