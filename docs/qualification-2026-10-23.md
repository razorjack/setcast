# Local platform qualification, 2026-10-23

Three completed workloads establish sustained local behavior: one hour of live scene changes,
two hours of repeated GPU recovery, and a 56-minute real-master browser export. A planned
75-minute stacked SwiftShader stress run failed after 26 minutes and remains unqualified. These are local qualification results,
not cross-platform or physical-device certification.

The machine is an Apple M1 Pro running macOS 27.0.0 and Node 26.7.0. Browser workloads use
Playwright Chromium 156.0.8078.4. Other development checks ran concurrently, so the timings are
not an isolated benchmark. [Machine-readable results](benchmarks/qualification-2026-10-23.json)
retain revisions, workload settings, sample statistics, media hashes and source report hashes.
Raw reports, JSONL samples and images remain in the gitignored artifact directories below.

## Sustained live output

| Workload | Duration | Scene/announcement actions | Capture restarts | Forced recovery cycles | Dropped analysis samples observed |
| --- | --- | --- | --- | --- | --- |
| Live baseline | 1 hour | 119 | 5 | None | 0 |
| GPU recovery | 2 hours | 159 | 7 | 238 | 0 |

The baseline ran from clean `04bf035`; the recovery run from clean `f4b8ec4`. Recovery cycles
lose all active GPU canvases, request restoration after 0.5 seconds and check readiness plus
capture progress. The four recovery scenes rotate through all three GPU visuals together,
then field, tunnel and constellation individually. They use 1920×1080/30 composition settings
and resolution 0.5. The baseline uses the runner's default 960×540/30 composition.

The browser viewport is 1440×1000, with the composition scaled to fit. GPU drawing buffers use
untransformed canvas dimensions, so preview zoom does not reduce their configured workload.
This still differs from physical full-screen presentation and from the compositor cost of an
unscaled 1080p browser window. The first two runs used controls over the output; neither recorded
the active graphics driver's identity. CPU identity alone cannot establish hardware acceleration.

Both runs kept the feature cache at or below 2048 entries and adaptive scale at 1. The two-hour
run retained 11 seconds of PCM: capacity changed from 485100 to 528000 frames when the synthetic
capture source changed from 44.1 to 48 kHz across a restart. The journal validator read six
completed journals for the baseline and eight for recovery, including every announced scene
change. The final recovery screenshot was inspected.

| Observed metric | One hour | Two hours |
| --- | --- | --- |
| Browser JavaScript heap | 19.5–70.8 MB | 24.4–77.2 MB |
| Node runner RSS | 136.6–426.2 MB | 153.1–435.9 MB |
| Final Node runner RSS | 174.8 MB | 166.0 MB |
| Reported frame updates/s, minimum / median / maximum | 28.5 / 30 / 31 | 25.6 / 30 / 31 |

MB means decimal megabytes. Heap and RSS measurements do not include the entire browser/GPU
process tree. The first two runs predate the fresh-window diagnostic correction, so their one-second
windows could include startup, restart or availability pauses. Both versions count observed frame
updates. Do not use their reported FPS as measured GPU throughput or physical presentation rate. Their capture, journal, cache and
recovery assertions are independent of that diagnostic.

Artifacts:

- `examples/demo/out/endurance-live-hour-2026-10-23`
- `examples/demo/out/endurance-gpu-recovery-two-hours-2026-10-23`

## Software rendering stress failure

The planned 75-minute SwiftShader run failed after 1570.67 seconds (26 minutes). It used clean
`a9af960`, a 1920×1080/30 composition, resolution 0.25, a separate operator window, four scenes
(stacked, field, tunnel, constellation), scene changes and context loss each minute, and capture
restart every 15 minutes. The active context identified the SwiftShader Vulkan backend.

It completed 26 scene/announcement actions, 25 recovery cycles and one capture restart. During
the next combined scene/recovery action, the dropped-analysis counter reached 4096 samples.
The preceding periodic sample still reported zero. Statistics derived only from periodic samples
therefore do not include that final counter; the failure assertion is retained in the raw report.
The run failed its zero-drop requirement and did not complete journal qualification.

Other baseline checks were running concurrently. This is evidence that the bounded half-second
queue cannot guarantee this stacked software/recovery workload under concurrent load, not proof
of which operation caused the stall. Increasing the queue again would conceal the real-time
budget without demonstrating smoother output. The short 300 ms stall improvement remains valid;
sustained support must be qualified separately. A narrower single-visual run without forced loss
is the next check, preserving the same zero-drop requirement.

Artifact: `examples/demo/out/endurance-software-75-minutes-2026-10-23`.

## Full real-master export

The browser exporter rendered the complete 3372-second master at 1920×1080/30 with one worker:
101160 frames in 2757.31 seconds, including setup and assembly. That is 36.69 frames/s, or
1.22 times real time, on this workload. Output is a 1752026128-byte H.264/AAC MP4. Node runner
RSS ranged from 223.8 to 468.3 MB and finished at 257.9 MB. This excludes Chromium and FFmpeg.

Rendering ran from clean `5aedace`. The task-specific project uses the existing full-mix timeline,
art and hard-linked source master, with field and branding. Original source files were unchanged.
Six decoded frames across the set were inspected. The authored display total differs from the
actual master length; qualification uses the probed 3372-second master, not that display label.

The reusable verifier decoded all 101160 video frames. Six one-second stereo windows starting
at output times 5, 60, 930, 1686, 2400 and 3350 seconds matched the source with zero sample lag at
16 kHz. Joint correlations were 0.9993–0.9999; separate channel checks also passed. Verification
took 390.04 seconds under concurrent load. Its report identifies verifier revision `e58e7f4`
with a dirty tree; that is separate from the clean revision which produced the video.

Two earlier verification attempts remain as inconclusive evidence. The automatically selected
last window at 3370.75 seconds contained silence. A manual window at 3368 seconds was below the
source-energy floor despite a high raw correlation. Neither counts as a synchronization pass.
The final 3350-second checkpoint has sufficient signal and an unambiguous correlation peak.

Mean per-frame stage times were 0.081 ms for audio, 3.743 ms for resolution of frame state,
1.376 ms for React commit, 1.155 ms for readiness, 18.328 ms for screenshot capture and 1.121 ms
for encoder writes. Muxing took 108.67 seconds. Capture remains the largest measured frame cost;
these measurements do not justify changing audio or readiness semantics for throughput.

Artifacts:

- `examples/demo/out/endurance-export-master-2026-10-23`
- `examples/demo/out/endurance-export-master-final-2026-10-23`
- `examples/demo/out/endurance-export-master-decoded-2026-10-23` (inconclusive silent tail)
- `examples/demo/out/endurance-export-master-musical-2026-10-23` (inconclusive quiet tail)

## Exporter acceptance and transient stalls

Both exporter acceptance suites passed independently after the implementation changes. They
cover frame/range timing, audio pulses, delayed fonts/logo/image readiness, looping video,
performance changes, repeated seeks, concurrent GPU export, failure cleanup and cancellation.
Installed-package smoke with the browser renderer also passed.

An additional exact cross-exporter comparison failed on sterile-tech: 5263 of 230400 pixels
(2.28%) differed, by at most 2/255 per channel, with mean absolute channel difference 0.01035.
Remotion used Chrome 149.0.7790.0 and the browser exporter Chromium 156.0.8078.4. The comparison
therefore did not meet the suite's matching-runtime prerequisite. This is not a parity pass;
no tolerance or assertion was weakened. The independently repeated frames matched exactly
within each exporter. The difference also matches the previously documented cross-version result.

A real 300 ms main-thread stall passed with the new bounded half-second audio transport queue:
zero dropped samples. The same workload with the old eight-packet worklet fixture dropped 6144.
The queue does not delay healthy delivery and is capped at 96 packets / 768 KiB. Longer stalls
can still lose analysis data or trip the existing watchdog.

## Reproduce and extend the evidence

Use [endurance.md](endurance.md) for versioned workloads, runtime records, graphics selection,
separate operator windows, cancellation and decoded export verification. Run each workload from
a clean revision and retain the report with its source artifacts. The checked-in summary records
the local run settings; custom durations can be written into a copy of the supplied preset.

Physical mixers, MIDI controllers, cameras, projectors, Linux/Windows drivers, actual driver resets
and multi-hour software rendering remain separate qualification work. Sampled audio does not
prove every sample; full video decoding does not verify every scene pixel. Browser readiness
and diagnostic update rates do not measure physical display or camera behavior.
