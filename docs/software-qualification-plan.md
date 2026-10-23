# Software rendering qualification

The endurance runner records CPU/browser identity but currently hardcodes ANGLE and does not
record the actual WebGL backend. Add an explicit live-only graphics choice and read the active
shader context's identity. This improves reproducibility on future machines and lets the same
workload qualify SwiftShader under sustained load.

- `graphics: auto | swiftshader`, default auto. Auto follows the browser adapter's platform
  selection; SwiftShader is an explicit qualification choice, not a production default.
- Record requested backend, WebGL/GLSL version and available vendor/renderer strings. Require
  actual SwiftShader when requested. Do not infer hardware acceleration from CPU identity.
- Reuse the existing 1080p scene/restart/recovery workload, including adaptive resolution and
  zero-dropped-sample checks. A short combined run precedes a 90-minute run from a clean commit.
- Report rendered-update FPS and scale distributions, not unmeasured physical presentation rate.
  Browser JS heap and Node RSS do not include all browser/GPU/native allocations.

Target the sustained run for roughly 17:00–18:30 Warsaw, leaving time for its report and final
validation before the planned 19:00 handoff. Keep the existing two-hour run undisturbed.

## Short-run findings

The original stacked SwiftShader workload failed during startup, with skipped analysis samples
at both 0.5 and 0.25 resolution. Moving driver identity queries before capture reduced one source
of possible blocking but did not eliminate the failure. Separate operator controls also did not
make the stacked workload pass. Retain it as live-software-stress.json, with explicit limits.

Each visual independently passed 45 seconds at 0.25 resolution. A combined 45-second workload
with one visual at a time passed four scene/announcement changes and two capture restarts, with
zero dropped samples and three valid journals. The 90-minute preset uses that narrower workload
without context-loss injection. Operator FPS is sampled from the popup while capture telemetry
continues to come from the output owner. Failure notices/screenshots are now retained.

Ready passed 557 tests. The auto-backend separate-operator check passed six scene/announcement
changes, four forced recoveries and two capture restarts, with three valid journals and zero
dropped samples. A review before the long software run found that diagnostics can include paused
startup time and that availability changes can apply the same quality sample twice. Correct that
sampling policy before measuring sustained software quality.

Diagnostics now reset their one-second rate window when capture source, availability or document
visibility changes. Capture-frame jumps still count as one observed rendered update. Adaptive
quality consumes each completed sample at most once; availability changes reset hysteresis without
replaying a cached sample. Startup/paused intervals therefore cannot masquerade as sustained GPU
overload. This does not accelerate shaders or promise that severe software stalls cannot drop data.

The correction passed ready (559 tests) and the output recovery/adaptive-resolution browser check.
The repeated software scene/restart check exposed a separate transient drop of 2048 analysis
samples when restart coincided with scene preparation. The transport currently permits only
eight outstanding packets, about 171 ms at 48 kHz. Next evaluate a time-based, still-bounded
half-second transport budget; normal delivery and sample positions must remain unchanged.

The half-second budget is implemented, rounded to packets and capped at 96 packets. At 48 kHz
the queue holds 24 packets / 192 KiB; the absolute PCM queue cap is 768 KiB. Worklet tests cover
rates from 8 kHz through the hard cap, exact gap/sample positions, normal immediate delivery,
backlog recovery and routing. The same real 300 ms main-thread stall dropped 6144 samples with
the old eight-packet fixture and zero with the new production worklet. The software scene/restart
case also passed without drops. Longer stalls still skip analysis or trigger the existing watchdog.

Final short stacked SwiftShader run passed six scene/announcement changes, four forced recoveries
and two restarts, with three valid journals and zero dropped samples. Ready passed 567 tests;
output recovery/adaptive quality and installed-package smoke passed. A visibility-event listener
also resets diagnostic windows when animation callbacks do not run while hidden.

The sustained software run will use the stacked stress workload for 75 minutes, starting from
the clean reliability commit around 17:35 and ending about 18:50. This leaves the planned final
handoff around 19:00. It supplements the earlier two-hour auto-backend run rather than replacing
its recorded revision or its measurements.

## Sustained stress result

The 75-minute run failed after 26 minutes on clean a9af960: 4096 analysis samples were dropped
during a combined scene change and forced recovery after 26 scene actions, 25 recovery cycles
and one restart. The last periodic sample was still zero; the failure report retains the counter.
Concurrent ready/smoke work was active. The stacked software/recovery workload remains unqualified.
Keep the bounded queue and strict zero-drop assertion; do not increase buffering to obtain a pass.

Next run the supplied single-visual SwiftShader workload without forced loss for 40 minutes,
ending before the 19:00 handoff. This is a distinct, narrower operating configuration and cannot
replace or erase the failed stress result.

## Follow-up investigation

The failed stress run combines scene preparation, shader/context recreation and other local
validation work. It does not isolate the stall's cause. Before changing the production pipeline:

1. Add opt-in, bounded benchmark evidence for main-thread long tasks, packet acknowledgement
   delay/high-water mark and scene/GPU preparation time. Keep PCM and device identity out of those
   diagnostics. Record observations before the failing assertion so the final counter is sampled.
2. Repeat one change at a time: individual versus stacked visuals, ordinary scene change versus
   forced recovery, and quiet versus concurrent load. Keep dimensions, sample rate, browser and
   driver fixed. Retain failed runs and compare startup with steady-state behavior separately.
3. If shader preparation causes the stall, investigate bounded reuse of scene resources without
   changing arbitrary-seek behavior or keeping old contexts indefinitely. If main-thread delivery
   remains the limiting factor, evaluate analysis in a dedicated worker with explicit ownership,
   bounded transport and unchanged sample positions. Worker migration is a separate design,
   not an established fix for GPU/compositor stalls.
4. Preserve honest overload behavior. A larger queue cannot make frames appear on time, and a
   driver identity string alone is not enough to choose a reliable quality level. Qualify the
   operating workload before recommending it for an unattended show.

## Narrow run and watchdog fix

The 40-minute single-visual run failed at 15.6 minutes on clean 9f3355d. After a successful
15-minute capture restart, the watchdog stopped input about 30 seconds later. A controlled
two-second main-thread stall reproduced the same erroneous shutdown three times without GPU
visualizers: requestAnimationFrame checked health before queued PCM could drain.

57527b0 confirms suspected starvation after 100 ms instead of immediately closing the input.
Fresh current-revision packets cancel confirmation; restart cancels the old timer. All three
controlled stalls then kept capture running while honestly reporting skipped analysis samples.
A real worklet that stops sending packets still fails. Ready passed 570 tests, and transport/output
browser checks passed. This does not prove the original long-run stall's cause or qualify every
software workload. Run a final 20-minute single-visual regression across the first restart.

## Drawing and disposal profiling

The post-fix 20-minute regression failed after 128.10 seconds on clean ff76fe1, before its first
restart. Capture remained running and reported 15360 skipped samples. No heavy validation ran
alongside it. The watchdog correction survives overload; it does not remove the underlying stall.

An instrumented three-minute run with changes every 30 seconds passed. A second instrumented run,
with the original one-minute scene cadence, failed after 196.53 seconds with 12288 skipped samples.
Both use the pre-optimization player bundle. The latter records long tasks of 454 and 769 ms around
a scene change. CPU samples place them in deferred context disposal and canvas drawing. Measured
compile/link/status/draw/flush calls did not exceed 10 ms; further instrumentation must cover the
remaining native calls and layout/property reads. Do not infer that shader compilation caused them.

Profiling changes runtime behavior. These diagnostic runs supplement the uninstrumented failures;
their passes cannot qualify the workload. Preserve timing data, CPU profiles and the exact bundle.
Separately, evaluate exact-output indexed FFT loops: copying and smoothing are substantial routine
CPU costs, but reducing them is not yet evidence of a correction to the software stalls.

A fixed five-minute native-call profile completed nine scene/announcement changes with zero drops
and a valid journal. It measured `getContext()` calls up to 132.1 ms and explicit `loseContext()`
calls up to 192.9 ms. The shader compile/link calls were not the observed long native operations.
This narrows the next experiment to context creation, disposal and draw-time synchronization;
it does not establish the complete cause of the earlier 769 ms draw task. A preceding five-minute
diagnostic was cancelled by signal; Chromium closed before profiling data could be saved, so only
its workload samples remain. Neither diagnostic supersedes the uninstrumented failures.

Do not add asynchronous shader compilation or remove context disposal on this evidence. Evaluate
bounded context reuse in a separate experiment: explicit ownership per output/worker, a fixed
resource budget, disposal on host shutdown, fresh shader/config/frame state after recall, and
correct readiness/context-loss behavior. Compare pixels after arbitrary seeks and repeated recalls,
then repeat the failing workload. Deferring expensive work does not remove its synchronous cost.

The user extended the deadline to finish this investigation and its validation. The indexed FFT
optimization is independent and documented in [spectrum-optimization.md](spectrum-optimization.md).
Further resource-lifecycle changes remain experiments until they demonstrate an improvement.
