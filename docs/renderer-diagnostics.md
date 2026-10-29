# Renderer capabilities and setup diagnostics

`setcast capabilities --renderer browser` describes the Setcast adapter's declared support.
Add `--json` for a versioned descriptor. Omit `--renderer` to select Remotion, the default.
This command does not read project configuration, load rendering dependencies, start processes,
download executables or check installed devices.

The same descriptor is exported as `capabilities` from
`@setcast/renderer-browser/capabilities` and `@setcast/renderer-remotion/capabilities`.
`RendererCapabilities`, `RendererName` and `RendererFeature` belong to `@setcast/core`.
These lightweight entries are usable by configuration tools without importing a renderer.

The descriptor covers Setcast's current API, not the underlying library's full feature set.
Both adapters support PNG/JPEG/WebP stills and H.264 + AAC in MP4/MOV/MKV. Browser export adds
resume; both adapters support hardware encoding when a compatible device works. Declared GPU support
means Setcast can render WebGL 2 visualizers, not that a hardware GPU is present or fast enough.
`concurrency.max: null` means the adapter delegates its upper limit to the runtime, not unlimited
workers. Graphics backend names describe accepted settings, not tested drivers.

Schema version 1 permits additional fields and features in future minor releases. Consumers
should inspect the fields they need and ignore unknown fields. Removing or changing an existing
field's meaning requires a new version. Missing features mean unsupported, not untested.

Project validation remains separate: `setcast validate` checks authored configuration and assets.
Recorded CLI validation now also checks settings against the configured adapter's descriptor;
`setcast validate path/to/project --renderer browser` checks a different selection without writing
configuration. The pure `rendererCompatibility` API lets other hosts perform the same support
checks on export options. Capability reporting cannot establish that a machine can render successfully.

## Check this machine

```sh
setcast doctor --renderer browser
setcast doctor --renderer browser --require still,video,gpu,resume --json
setcast doctor --renderer remotion --require video,hardwareEncoding
```

`doctor` defaults to Remotion and requires `video`. It probes all supported features, then
returns status 0 only if the requested features are ready. A failed optional check remains in
both the human report and JSON. Request `still` for PNG/JPEG work, `webp` for WebP stills, `gpu`
for WebGL 2 visualizers, and `resume` for the browser export checkpoint prerequisites.
`hardwareEncoding` is the selected adapter's hardware H.264 path, separate from WebGL graphics.
Unsupported requirements produce a report with status 1. Invalid flags produce a usage error
with status 2. Interruption or an unexpected runtime error returns status 1.

`--gl` selects the same accepted backend as export. `--timeout` is 1–60 seconds, default 15,
for individual browser probes and subprocess calls. On a browser timeout or interruption the
browser is closed; an instance returned late from launch is closed before page work starts.
Remotion's browser launcher has its own startup timeout and can take up to roughly 30 seconds
before returning a handle that diagnostics can close. Encoder subprocesses are killed on timeout.
The timeout is not a total wall-time budget, and diagnostics are not a benchmark.

The command starts temporary processes, binds a temporary loopback endpoint, writes small
fixtures under the OS temporary directory and removes them afterward. It never installs a
browser or changes project configuration. The browser adapter uses its pinned Playwright
Chromium and the same offline launch flags as export. Remotion uses its installed pinned
Chrome Headless Shell and packaged FFmpeg/ffprobe. Diagnostic failure cannot poison a later
Remotion browser installation/render in the same host process.

Checks include:

- `local-server`: bind and fetch a loopback HTTP endpoint.
- `browser.launch`: start the installed browser and open a page; record version or executable.
- `browser.capture`: capture PNG/JPEG, decode the screenshots in the browser, and verify pixels
  from CSS and Canvas 2D.
- `browser.webp`: native WebP screenshot and pixel verification in either adapter. The browser
  adapter also verifies lossless VP8L encoding; no system FFmpeg is needed.
- `browser.webgl`: compile/link a WebGL 2 shader, draw a triangle and verify pixel readback.
  Report the actual WebGL renderer/vendor string. Software WebGL can pass this check.
- `ffmpeg`, `ffprobe`: execute the appropriate binaries and retain their version lines.
- `video.encode`: encode three JPEG frames and PCM WAV audio into each declared container,
  then decode/re-encode each fixture to check H.264/AAC decoding too.
- `video.inspect`: verify MP4 codecs, dimensions and frame count. Browser export requires
  ffprobe for resume; missing ffprobe does not invalidate ordinary browser video export.
- `hardware.encode`: the selected adapter's actual platform H.264 hardware encoder on one frame. An encoder
  name in FFmpeg's compiled list is insufficient evidence that a device works.

For missing browser Chromium, run `setcast browser-install`. For missing Remotion Chrome, run
one normal Remotion render or still with network access so the adapter can install it. System
FFmpeg needs `libx264` and AAC for video. A missing optional encoder does not require changing
renderer defaults. On Linux/Windows both adapters use NVENC for hardware encoding;
on macOS it uses VideoToolbox. A GPU that renders WebGL does not necessarily support that encoder.

## Report contract and host API

```ts
import { diagnose } from '@setcast/renderer-browser/diagnostics';

const report = await diagnose({
  require: ['video', 'gpu', 'resume'],
  gl: 'auto',
  timeoutMs: 15_000,
  signal: abortController.signal,
});
if (!report.ready) showChecks(report.checks);
```

`@setcast/renderer-remotion/diagnostics` exports the same API. `RendererDiagnosticOptions`,
`RendererDiagnosticReport`, `RendererCheck` and `RendererReadiness` belong to core. The pure
`rendererReadiness(capabilities, checks)` reducer is available to hosts. Core/node supplies
shared helpers for adapter authors; browser-evaluated probe functions must have no closure imports.
No renderer dependency enters core or its browser-facing dependency graph.

A version 1 report contains `capabilities`, `environment` (platform, architecture, Node version),
`graphicsBackend`, `required`, `checks`, `features`, `ready` and `exitCode`. Check IDs are stable;
prose, details and check ordering can change. Check status is `pass`, `fail` or `skipped`.
Feature readiness is:

- `ready`: all emitted prerequisites passed.
- `unavailable`: at least one prerequisite failed, even if a dependent check was skipped.
- `unchecked`: no evidence, or at least one skipped check without an observed failure.
- `unsupported`: absent from the adapter's declared features.

`ready` and `exitCode` only consider `required`. Reports can contain local executable paths,
version strings and error diagnostics; review them before sharing publicly. No environment dump,
project files, credentials or remote telemetry are collected. Consumers should ignore unknown
fields and check IDs and reject unsupported report versions.

A successful report covers these small fixtures on the selected runtime. It does not bundle or
render a user's project, test asset/font readiness, prove checkpoint recovery, measure sustained
throughput, qualify a physical device, or establish cross-driver pixel identity. Keep
`setcast validate`, exporter acceptance and the longer qualification workflows as separate checks.

Persistent browser caching is declared as the `cache` feature. Its machine prerequisites include
Chromium, local serving, H.264/AAC encoding and ffprobe, like resumable export. `doctor --require
cache` checks those runtime prerequisites; it does not inspect or write the chosen cache directory.
Use `setcast cache inspect <directory>` to read an existing cache index.
