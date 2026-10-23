# Sustained workload qualification

The endurance runner exercises the existing player and browser exporter without changing their
runtime behavior. Workloads are versioned JSON files. Reports stream to disk, so the runner does
not retain a growing sample array. It is repository qualification tooling, not a hosted telemetry
service or a new scene API.

```sh
node packages/renderer-browser/bench/endurance.ts --config packages/renderer-browser/bench/endurance/live-hour.json --out examples/demo/out/live-hour-1
node packages/renderer-browser/bench/endurance.ts --config packages/renderer-browser/bench/endurance/export-demo.json --out examples/demo/out/export-two-minutes-1
node packages/renderer-browser/bench/endurance.ts --config packages/renderer-browser/bench/endurance/live-gpu-recovery.json --out examples/demo/out/gpu-recovery-hour-1
node packages/renderer-browser/bench/endurance.ts --config packages/renderer-browser/bench/endurance/live-software.json --out examples/demo/out/software-90-minutes-1
```

Use a new output directory for every run. Existing directories are rejected to preserve evidence.
Install workspace dependencies and pinned Playwright Chromium first. Exports also require system
FFmpeg and ffprobe. Nothing is uploaded. Project paths resolve from the current working directory.

## Live workloads

```json
{
  "version": 1,
  "mode": "live",
  "seconds": 3600,
  "sampleSeconds": 5,
  "changeSeconds": 30,
  "restartSeconds": 600
}
```

The default workload cycles field, tunnel and constellation at 960×540/30 fps, with a generated
logo, identity and rotating messages. It recalls scenes through the operator UI, announces each
scene, journals effective actions and restarts capture at the requested interval. Restart closes
the current journal and begins a new one. Final checks parse every journal and require explicit
end events and the expected announcements. A run fails on browser errors, stopped capture,
dropped analysis samples or feature-cache overflow. FPS and heap use are measurements, not
universal pass thresholds.

`scenes` optionally supplies 1–16 live configuration objects. It uses the existing `live.yaml`
schema, including visualizers, branding, modulation and output dimensions. Choose built-in themes;
the runner writes self-contained CSS scenes under its output directory. External artwork/CSS
paths are rejected; `logo.svg` names its generated logo. Use normal project-based browser checks
for user assets. As in the player, the first scene owns output dimensions and input routing;
recalls change appearance. Whole-set visualizers are omitted by the live loader.

For example, add this to the workload to test stacked GPU visuals:

```json
"scenes": [{
  "theme": "sterile-tech",
  "output": {"width": 1920, "height": 1080, "fps": 30},
  "visualizer": [
    {"name": "field", "resolution": 0.5},
    {"name": "tunnel", "resolution": 0.5},
    {"name": "constellation", "resolution": 0.5}
  ]
}]
```

`seconds` is wall time after input and journal setup, from 10 to 86400. Actions may add a short
settling interval at the end. `sampleSeconds` is 1–60 (default 5), `changeSeconds` is 5–3600
(default 30), and `restartSeconds` is 0–86400 (default 600; 0 disables restart). Samples include
the capture epoch, frame, dropped samples, cache count, PCM capacity, adaptive render scale,
rendered-update FPS, document visibility, DOM node count, browser JS heap and runner Node RSS.
The first FPS sample can be null until player diagnostics has collected a full interval.

### Graphics and operator setup

`graphics: "auto"` follows the browser adapter's platform-specific graphics selection.
`graphics: "swiftshader"` explicitly requests software rendering and requires an active shader
canvas whose driver identifies itself as SwiftShader. The first scene must therefore contain a
GPU visualizer for that choice. Reports record requested backend, WebGL/GLSL versions and the
vendor/renderer information exposed by the active context. An auto run may use software too;
read the reported identity rather than inferring acceleration from the CPU model. Identity is
collected before audio capture starts because driver queries may synchronize graphics work.

`operatorWindow: true` moves controls into a separate window before capture. Scene changes,
announcements and restart actions use that window; capture, frame/cache measurements, graphics
recovery and the final output screenshot stay in the output window. Diagnostics come from the
operator window, and browser errors from both windows fail the run. Default false retains the
controls over the scene. These two workloads have different compositing costs.

Both settings are live-only qualification options. They do not change normal player defaults or
the selected offline renderer. The software preset runs 90 minutes at 1080p30 with one GPU visual
at a time, resolution 0.25, a separate operator window, scene changes each minute and capture
restart every 15 minutes. It does not inject context loss. The separate
`live-software-stress.json` adds stacked visuals and forced recovery; it is a stress reproducer,
not a qualified preset. Initial local runs of its stacked scene dropped analysis samples during
startup, including at resolution 0.25, with the former eight-packet transport queue. After the
bounded half-second queue change, the short stacked scene/recovery/restart check passed. Keep both
the earlier failures and the exact passing workload when reporting results; longer qualification
is separate evidence.

Lower rendering resolution does not guarantee that startup, shader compilation or compositor
work will fit the live input budget. Adaptive resolution responds to observed update rates and
cannot prevent every initial stall. Software runs should establish the exact supported workload;
do not generalize a single-visual pass to stacked visuals or context restoration.

## Repeated GPU loss

Live workloads may add `gpuRecovery: {"everySeconds": 30, "restoreSeconds": 0.5}`. Omit it or
use null to disable injection. `everySeconds` is 5–86400 (default 60); `restoreSeconds` is
0.05–15 (default 0.5). Export workloads reject this setting.

The runner loses every ready ShaderCanvas context in the active scene through
`WEBGL_lose_context`, requests browser restoration after the configured delay, then verifies
ready canvases, an advancing capture clock and zero dropped samples. A scene without GPU canvases
fails explicitly. The scene's own `recoverySeconds` policy still applies: choose a restoration
delay below it for a passing workload. Missing extension support or restoration failure fails the
run. The injection has a separate 20-second deadline so a lost browser event cannot wait forever.

Action records contain the affected canvas classes and elapsed recovery time. Production code
never uses this extension to request recovery. This tests the application's lifecycle and resource
handling under repeatable browser events; it does not simulate every driver reset or prove that a
real lost context will be restored.

`live-gpu-recovery.json` runs an hour at 1920×1080/30, alternates stacked and individual GPU scenes,
changes scenes/announcements every 45 seconds, loses contexts every 30 seconds and restarts capture
every 15 minutes. Journals retain authored scene/announcement actions; graphics recovery is a
private operational event and is not written into them.

## Export workloads

Use `mode: "export"`, a `project` directory, `at` in seconds (default 0), `seconds` of output
and `concurrency` from 1 to 8 (default 1). Use a real longer project to test long exports; the
runner rejects an overlong range instead of silently producing a shorter qualification run.
It never modifies the source project. The generated MP4 uses that project's encoding settings.

Samples contain completed frame metrics, stage count/sum/maximum, captured bytes and Node RSS.
The default `verification: "metadata"` checks video dimensions, rate, frame count and duration,
plus audio presence and duration. `verification: "decoded"` also decodes every video frame and
compares sampled audio against the source master. Both modes retain source/output SHA-256 hashes,
file sizes and FFmpeg versions. Rendering and verification wall times are separate report fields.

### Decoded verification

```json
{
  "version": 1,
  "mode": "export",
  "project": "path/to/project",
  "at": 0,
  "seconds": 3372,
  "verification": "decoded",
  "audioAt": [5, 60, 930, 1686, 2400, 3350]
}
```

Omit `audioAt` to compare six one-second windows distributed through the output, starting 0.25 s
from its beginning and ending 0.25 s before its end. An explicit list contains 1–64 output-relative
window start times, each at least 0.05 s, with one second of sound and 0.05 s of search padding
remaining. Choose informative musical passages when an intro/outro is silent. The report records
every selected time; omitting a passage is not evidence that it is aligned. `audioAt` requires
decoded verification; both settings are export-only.

The verifier decodes stereo at 16 kHz, keeping channels separate so opposite-phase material does
not cancel. It searches every sample offset within ±50 ms. Positive lag means exported audio
arrives late. A window passes when normalized correlation is at least 0.95, its best lag is within
1 ms, and its RMS level ratio is 0.9–1.1. The best correlation must exceed candidates at least 2 ms
away by 0.005. Silence below RMS 0.0001 and ambiguous periodic signals are **inconclusive** and
make the qualification run fail explicitly. Reports preserve correlation, zero-lag correlation,
RMS, level ratio, competing-peak margin and signed lag, including failed checks.
Each active channel must also meet the correlation and level bounds at the selected lag, so a
quiet channel cannot disappear behind a correct louder channel. A silent source channel must
remain silent. Input file identities are checked again before accepting the result.

Range origins use the same frame rounding as the exporter, so a fractional requested start is
compared against the audio that was actually selected. PCM windows and subprocess output are
bounded independently of set duration. FFmpeg/ffprobe decode errors fail the run; interruption
cancels the subprocess and retains the report. Input files must be regular files, not symlinks.

To qualify an existing file without rendering again:

```sh
node packages/renderer-browser/bench/endurance.ts --config workload.json --verify-video path/to/export.mp4 --out examples/demo/out/decoded-check-1
```

This mode accepts either verification level and never modifies the source project or export.
The recorded runtime/revision describes the verifier, not the original renderer; preserve the
original render report alongside it. File hashes identify the media being checked. It can inspect
outputs from either renderer when their composition and requested range match the workload.

Decoded frame count proves that the frames decode, not that each scene pixel is correct. Sampled
audio alignment does not prove every audio sample or establish camera/display latency. Continue
using both exporter acceptance suites for scene pixels, readiness and deterministic seeks.
The short `bench/export-verification.ts` check includes a browser export, rounded range origin,
20 ms delayed audio, truncated video and missing sound.

## Report contract and interpretation

- `report.json`: version 1, resolved workload, Node/platform/CPU and source revision/dirty state,
  start time, elapsed wall time, sample/action counts, workload-specific details and errors.
  Status is `running`, `passed`, `failed` or `cancelled`. Checkpoints replace the JSON atomically.
  Export details include `verification.phase`, decoded/metadata stream information and sampled
  audio results. Existing-video checks identify their source path and do not report render speed.
- `samples.jsonl`: append-only `{kind, wallSeconds, details}` records. `kind` is `sample` or
  `action`; action counts only increase after the operation completes. Schema version comes
  from the report. This file can be processed line by line during a run.
- Live `workload/`: self-contained scene fixtures and session journals, retained for inspection.
  `output.png` records the final operator view. Export `export.mp4` is the completed video.
  With a separate operator, output.png contains the clean output. Failed live runs attempt a
  bounded failure.png capture and retain visible operator notices, even when capture has stopped.

SIGINT/SIGTERM request cleanup and a cancelled report. A hard kill can leave `running` and the
last complete checkpoint; do not interpret that as a pass. A cancelled live journal may lack
an end event. The report and workload remain available after failures.

Browser JS heap excludes GPU allocations and browser native memory. Runner Node RSS excludes
Chromium and FFmpeg. Heap growth between two samples can be garbage-collection timing; examine
repeated steady-state intervals rather than declaring a leak from a single peak. Cache capacity
and sample retention have explicit bounds, but this does not prove a bound on total system memory.
Stage sums overlap across capture workers. Readiness alone does not measure completed GPU work.

Synthetic input exercises WebAudio and player scheduling. It does not qualify physical mixers,
USB routing, camera banding, display latency or projector legibility. Record concurrent workloads,
power conditions and hardware when sharing results. Run export performance comparisons in
isolation; a stress test while developing is useful reliability evidence, not a clean benchmark.
