# Local preview export qualification, 2026-10-29

The independent preview's export controls passed the real-browser fixture on macOS Apple M1 Pro,
Node 26.7.0, Playwright Chromium 156.0.8078.4 and system FFmpeg. This is correctness evidence,
not a speed benchmark or cross-platform qualification. Implementation is recorded in the
[replacement log](../../renderer-replacement-log.md).

[Initial results](results.json) and the [repeat using Cancel/Resume buttons](ui-results.json) retain exact-range decoded agreement, completed-chunk reuse, request
rejection, stale revision cancellation and shutdown cleanup. The fixture exported frames 32–94
inclusive at 30 fps from 3.1415 seconds of audio, preserving the partial final frame. Full decoded
video and audio hashes matched a direct export. Cancellation/resume reused 30 completed frames.
Completed-output symlinks outside the reserved job directory were rejected. Desktop and narrow
screenshots were inspected locally.

Reproduce with FFmpeg/ffprobe and the pinned browser installed:

```sh
node packages/renderer-browser/bench/preview-exports.ts --out NEW_DIRECTORY
node packages/renderer-browser/bench/preview.ts
vp run package-smoke --browser
vp run ready
```

The test output directory keeps fixture inputs, reference MP4, queued outputs, interrupted
checkpoints and screenshots. It must be new for each run. The initial Host-header test used fetch,
which did not send the intended overridden host; the corrected test uses node:http. That failure
was a harness issue and did not change the server's existing Host rejection.

Queue state is in memory and is not restored after server restart. Files/checkpoints remain on
disk. Other platforms, disk exhaustion, malicious local processes with filesystem access, physical
audio routing and long unattended preview sessions are outside this fixture's qualification.
