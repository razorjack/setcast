# Persistent render cache validation, 2026-10-29

[results.json](results.json) records actual captured/reused frame counts and capture-page counts
from `node packages/renderer-browser/bench/cache.ts --out NEW_DIRECTORY`. It uses a generated
640×360, 30 fps fixture with three video chunks and one continuous soundtrack. Tests ran on the
Apple M1 Pro with pinned Playwright Chromium and software H.264/AAC. No timing claim is made.

The identical successful repeat captures zero new frames, reuses all 75 and opens zero capture
pages. Its full decoded video and audio frame hashes match the first export. A different output
path also reuses every frame. Corrupt or missing data invalidates only that stored chunk; changed
project settings, encoding, artwork or soundtrack invalidate the entire job. Restoring the
original inputs can reuse the original entries. The fixture also checks cancellation, atomic
output preservation, interrupted-job recovery, source changes during export and explicit clearing.

The unit tests cover byte eviction, oversized entries, index validation, writer exclusion,
corruption, symlinks, unrecognized directories, interrupted temporary writes and preservation of
unrelated files. CLI management works with an empty executable PATH. Capability/compatibility
and machine diagnostics distinguish browser cache support and its ffprobe prerequisite.

`vp run package-smoke --browser` additionally creates and repeats a cached export through the
packed CLI in separate processes. It verifies six reused frames with no new capture, identical
decoded video, inspection, clearing and the cache runtime prerequisites. Its first assertion
incorrectly searched stdout for progress; progress is written to stderr. The corrected check
passed. A separate packaging issue in the Remotion fault probe imported CLI source and emitted
declarations into that source tree; switching the probe to public core/node loading removed that
build contamination. Neither issue was a cache-output failure.

MP4s and generated fixtures remain under `examples/demo/out/persistent-cache-2026-10-29`.
Logs are `/tmp/setcast-cache-*`. This verifies local identical-job reuse. Selective reuse after
project edits, cross-machine caching, actual disk exhaustion and other operating systems remain
outside this result. Cache hits still load runtime identity and encode the master soundtrack.
