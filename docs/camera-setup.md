# Camera and display test patterns

Open **Camera test patterns** in the live operator and enable **Show test pattern**. The output
shows one diagnostic image in place of the scene. Settings are separate from scene content:
recalling a scene preserves them, and saved scenes and journal replay omit them. Restarting the
player never activates a pattern automatically.

Use **Operator window** to keep controls off the filmed display. For static setup without audio,
choose **Quiet scene** under **Output setup → On input loss**. Restore the intended fallback
after setup. Brightness and blackout apply to every pattern. Black input-loss fallback covers
the pattern too. Motion requires running capture because it uses the same explicit capture clock.

## Patterns

- **Alignment:** numbered corners, square grid, center circle and an adjustable inset guide.
  Check framing and crop. The inset is a user-selected margin, not a broadcast safe-area standard.
- **Grayscale:** broad steps, near-black patches and near-white patches. Compare shadow and
  highlight separation in the recorded camera image. Labels describe the nominal RGB signal
  before pattern level and output brightness, not measured display luminance or camera exposure.
- **Detail:** vertical stripes, horizontal stripes and a checkerboard. Choose cell size in
  composition pixels to inspect focus and moiré. Window scaling, display density and projection
  change the physical size; use the intended output dimensions and fullscreen setup.
- **Motion:** a broad horizontal sweep over stationary markers. Speed is passes per second,
  including travel into and out of the frame. Zero freezes it at the center. Changing FPS changes
  temporal sampling, not travel speed. Input restart resets the capture clock and motion phase.

Set the camera framing, exposure, frame rate and display settings you intend to use, then record
a short sample of the relevant patterns and the actual scene. Review the recording as well as
the camera preview. Setcast does not measure or automatically remove banding. Camera shutter and
light/display flicker interact, and the useful camera controls vary by model; Sony's
[flicker guidance](https://www.sony.com/electronics/support/camcorders-and-video-cameras-hard-drive-camcorders/articles/00122281)
explains the distinction between ordinary anti-flicker detection and variable shutter adjustment.

## Declarative settings

`live.yaml` supplies initial settings without turning the pattern on:

```yaml
testPattern:
  pattern: grayscale
  level: 1
  speed: 0.1
  detailSize: 8
  safeArea: 0.1
```

`pattern` is `alignment`, `grayscale`, `detail` or `motion`. `level` is 0.1–1 and multiplies the
existing output brightness. `speed` is 0–1 cycles/s, `detailSize` is 1–64 whole composition pixels,
and `safeArea` is an inset fraction from 0 to 0.25 on each edge. Defaults are shown above.
Speed, cell size and inset affect only their respective patterns; switching patterns retains
the other settings. Operator changes do not rewrite YAML.

**Export test pattern settings** downloads a versioned JSON preset:

```json
{
  "version": 1,
  "testPattern": {"pattern": "motion", "speed": 0.2, "level": 0.8}
}
```

**Import test pattern settings** validates a file up to 8 KiB, applies its defaults and turns
the pattern off until explicitly enabled. Invalid files preserve the current settings and
activation. The preset excludes output dimensions, camera settings, brightness, capture routing
and projection geometry. Store those separately in project or venue configuration.

## Projection and replay

The existing **Show calibration pattern** control selects this same alignment pattern. It can
also be shown without projection correction. When correction is enabled, every test pattern
renders inside the projected iframe in composition coordinates; crop and output masks still
apply. Disabling correction preserves the selected pattern on the direct output. Loading or
importing a venue turns the pattern off.

Patterns are setup tools, not journaled performance content. A journal replay reconstructs the
underlying scene and effective performance controls; it does not reconstruct a test pattern
shown over it. Turn the pattern off before recording a performance intended for replay.

## Platform API

The pure `@setcast/core` entry exports `TestPatternSchema`, `TestPatternPresetSchema`,
`TEST_PATTERNS`, `TestPatternConfig`, `TestPatternPreset` and `testPatternPhase(timeSeconds, speed)`.
Schemas validate unknown input; preset version 1 wraps the same settings used by `live.yaml`.
Motion is a bounded pure function of absolute time, with no simulation history or browser clock.

`@setcast/core/react` exports `TestPattern` and `TestPatternProps`:

```tsx
import { TestPatternSchema } from '@setcast/core';
import { TestPattern } from '@setcast/core/react';

const pattern = TestPatternSchema.parse({pattern: 'motion', speed: 0.1});

<TestPattern
  config={pattern}
  width={1920}
  height={1080}
  timeSeconds={frame.timeSeconds}
  brightness={frame.composition.performance?.brightness ?? 1}
/>
```

The host supplies a positioned composition-sized container and validated settings. Dimensions
must be finite and at least 4 pixels per side; time is finite and nonnegative, and brightness
is 0–1. The component requires no FrameProvider, audio analyzer or renderer binding. It draws
SVG with local IDs and fixed diagnostic colors outside the scene's theme. Its wrapper is
`.sc-test-pattern[data-pattern]`; fixed colors and geometry are intentional measurement inputs,
not theme palette choices. Supply a different component for a fundamentally different test image.

Keep masks and input-loss protection above the component, and pass the effective output brightness
including blackout. The live adapter demonstrates this ownership. Embedding the component in an
offline composition is possible through the same React contract; there is no new exporter or
automatic test-pattern export command.

## Verification and limits

`node packages/renderer-browser/bench/camera.ts` exercises the real Chromium operator: all four
patterns in landscape and portrait, frozen/advancing motion, static frame equality, pixel-black
brightness/blackout/input fallback, projection coordinates, settings transfer and saved-scene
isolation. The existing projector regression still checks geometry, masks, delayed fonts and
venue behavior. Core tests cover configuration errors and eight-hour phase precision.

These checks qualify software behavior. Physical cameras, displays and projectors still need
testing. Pattern percentages are nominal 8-bit RGB values rounded to integer channel codes;
browser color management, display response and camera processing affect the captured result.
