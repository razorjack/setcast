# Process sampling checks, 2026-10-29

The comparison runner now samples renderer descendants and other visible process CPU separately.
[corrected.json](corrected.json) records the integration check on macOS: both adapters fully decode
90 frames, and the sampler observes Chromium/FFmpeg memory above the Node-only figure. This is a
short harness validation, not a performance comparison or an idle-workstation claim. The existing
runtime pins, settings and dirty source state remain in the report. The implementation is in the
same commit as this document; production rendering decisions are unchanged.

The initial asynchronous implementation associated CPU counters with the time its callback ran.
Bundling can block the event loop after `ps` collects counters, delaying delivery. That skews the
interval used to calculate CPU usage. [timestamp-skew.json](timestamp-skew.json) retains the failed
integration: one external CPU peak exceeded this machine's ten cores. It is invalid CPU evidence.
A separate quiet ten-second sample did not show that anomaly. Bounded synchronous sampling with a
midpoint timestamp removes callback delivery from the interval calculation. Its brief blocking
cost is included in benchmark wall time. Do not compare these two runs as renderer improvements.

The parser tests cover macOS/Linux duration formats, descendant selection, PID reuse, reparenting,
new/exited processes and malformed output. A controlled 128 MiB child allocation with a 4.2-second
busy loop verifies memory and CPU observation, plus idempotent stop. Sandbox denial verifies null
unavailable values. Actual Linux and Windows process sampling have not been qualified; Windows is
explicitly unsupported by this sampler. See [the report contract](../../render-comparison.md) for
sampling limitations, external-service attribution and summed-RSS double counting.
