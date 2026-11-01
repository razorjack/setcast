# Full-master bitmap resource qualification, 1 November 2026

Candidate 8c3cafc passes the complete 3,372-second real-master workload: 101,160 frames at
1920x1080/30, four capture workers, Anamorphic, a looping video background and Field at resolution
0.5. The authored JPEG 90 / CRF 22 settings are forwarded and recorded. The source master and
original project were unchanged; a separate fixture combines their audio/timeline with portable
looping video. Full video decoding succeeds and the MP4 contains the expected duration and frames.

All six selected stereo windows pass the fixed source-alignment checks, at 1, 60.5, 600.5, 1686.5,
3000.5 and 3370 seconds. Every best lag is zero samples at 16 kHz; correlations range from
0.999510 to 0.999899. Both channels pass their level/correlation checks. These samples do not
prove every audio sample or replace exact short-fixture PCM and seek comparisons.

All 361 sampled process observations are available. Peak summed Node/descendant RSS is
4,690,919,424 bytes. Quarter-hour medians are 4.127, 4.167, 4.348 and 4.458 GB. This shows modest
retained growth within the observed bound over this run; it does not prove constant memory or
exclude a slower leak. Summed RSS can double-count shared pages and excludes external GPU/encoder
services. The separate 3,000-capture URL/resource check remains relevant to decoder ownership.

Peak apparent output-directory storage is 1,799,498,962 bytes during assembly. The final directory
contains 900,901,579 bytes and no temporary export directories. Minimum sampled filesystem free
space is 6,819,930,112 bytes, above the harness's 2 GiB cancellation reserve. Other jobs share this
filesystem, so free-space changes are not attributed entirely to this export.

The render overlapped correctness checks and external work. Its elapsed time is retained only
for reproducibility and cannot establish a throughput comparison. Resource qualification is local
to this macOS/ANGLE Metal/software H.264 workload. All-frame decode is not a full-master pixel
reference comparison. Automatic-worker alternating timing and latest-main integration checks
remain separate requirements before promotion.

`report.json` preserves the workload, exact runtime/revision, settings, media hashes, decoded
checks and sampled stereo results. `samples.jsonl` preserves the complete resource series;
`summary.json` records the values reported above. The original MP4 remains in ignored output.
