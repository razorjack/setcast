# Endurance measurement correction, 1 November 2026

The harness now forwards the project's export settings, records runtime decisions, samples
Node and descendant RSS, samples output-directory bytes and filesystem free space, and records
cleanup after rendering. It cancels its own export below 2 GiB free space. Summed RSS can count
shared pages more than once and excludes external GPU/encoder services and short-lived processes.
Output bytes are apparent sizes, not physical allocation. Other jobs can change free space.

The retained ten-second real-master check passes decoded verification and audio checks. It
captures 300 frames with four workers and correctly records the project's JPEG 90 / CRF 22
settings. All six process samples are available; sampled peak summed RSS is 2,549,039,104 bytes.
The final output directory contains no temporary export directories. This short check validates
the instrumentation, not full-master memory stability or performance.

Earlier endurance reports used encoding defaults despite documentation claiming project settings.
Their reports remain unchanged. Their timings cannot establish a comparison at authored settings.
The corrected harness passes ready, both exporter acceptance suites and packaged-browser smoke
as part of the same validated working tree.
