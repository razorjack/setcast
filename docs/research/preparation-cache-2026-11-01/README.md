# Persistent audio preparation, 1 November 2026

Browser CLI `render --cache` now stores whole-set overview/travel summaries in the same cache as
video chunks. Both payload kinds share the writer lock, byte limit, eviction and clearing. Index
version 1 migrates to version 2; older binaries reject the new index. The inspection report keeps
version 1 and identifies each payload kind. No PCM or per-frame FFT cache is introduced.

Keys include source content/extension, required summary kinds, core/producer code, decoder
versions and host/runtime identity. File metadata and the authored source alias are checked after
preparation. Stored JSON is limited to 64 MiB, checksummed and shape-validated before use. Invalid
summaries are recomputed. Unrelated appearance edits can reuse the same summaries.

Validation passes 685 tests in 115 files plus lint/types/formatting, dependency isolation and
decoded smoke. The integration fixture proves exact fresh/cached summaries and exact decoded video
and audio. Existing chunk recovery, both exporter acceptance suites and packed-browser smoke pass.
The installed CLI launches two separate commands; the repeat reuses preparation and all six video
frames. Inspection sees one analysis entry and one video entry, and clearing removes both.

The long-master preparation timing attempt completed no measured arms: all twelve pre-run samples
exceeded 15% CPU busy. It is retained as a blocked attempt, not throughput evidence. The working
copy was dirty because it contained this implementation. Two system ANECompilerService processes
were each observed using approximately one CPU core; their ownership was not established and they
were left untouched. Functional reuse is qualified; its end-to-end timing benefit remains unclaimed.


## Quiet long-master preparation result

The final run at a00ece3 completes three alternating pairs on the 3,372-second real master.
Every arm passes the unchanged 15% pre-run CPU limit and returns exactly the same prepared data.
No own validation runs concurrently. The original busy attempt above remains preserved.

Computed preparation has median 2.622 seconds (2.606–2.628); cached preparation has median
0.859 seconds (0.844–0.867), a 67.3% reduction. Reuse includes source hashing, runtime/cache
validation and reading/parsing the stored summaries. Both arms run in one process with a warm
filesystem; this does not measure cold installation, CLI startup, browser capture or total export
speed. `quiet-report.json` retains exact summary identity, source hash, decoder, resource/CPU
observations and cache inspection. `quiet-run.txt` includes waits through external load spikes.
