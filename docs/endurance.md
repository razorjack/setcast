# Sustained workload qualification

The endurance runner exercises the existing player and browser exporter without changing their
runtime behavior. Workloads are versioned JSON files. Reports stream to disk, so the runner does
not retain a growing sample array. It is repository qualification tooling, not a hosted telemetry
service or a new scene API.

```sh
node packages/renderer-browser/bench/endurance.ts --config packages/renderer-browser/bench/endurance/live-hour.json --out examples/demo/out/live-hour-1
node packages/renderer-browser/bench/endurance.ts --config packages/renderer-browser/bench/endurance/export-demo.json --out examples/demo/out/export-two-minutes-1
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

## Export workloads

Use `mode: "export"`, a `project` directory, `at` in seconds (default 0), `seconds` of output
and `concurrency` from 1 to 8 (default 1). Use a real longer project to test long exports; the
runner rejects an overlong range instead of silently producing a shorter qualification run.
It never modifies the source project. The generated MP4 uses that project's encoding settings.

Samples contain completed frame metrics, stage count/sum/maximum, captured bytes and Node RSS.
The final check uses ffprobe to verify video frame count, duration and an audio stream. This is
structural validation, not a full decoded audio/video synchronization comparison. Use both
export acceptance suites for synchronization and pixel correctness.

## Report contract and interpretation

- `report.json`: version 1, resolved workload, Node/platform/CPU and source revision/dirty state,
  start time, elapsed wall time, sample/action counts, workload-specific details and errors.
  Status is `running`, `passed`, `failed` or `cancelled`. Checkpoints replace the JSON atomically.
- `samples.jsonl`: append-only `{kind, wallSeconds, details}` records. `kind` is `sample` or
  `action`; action counts only increase after the operation completes. Schema version comes
  from the report. This file can be processed line by line during a run.
- Live `workload/`: self-contained scene fixtures and session journals, retained for inspection.
  `output.png` records the final operator view. Export `export.mp4` is the completed video.

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
