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
