# Frozen corpus quality measurements, 1 November 2026

Ten of eleven frozen cases completed numerical measurement against Remotion 4.0.539.
Browser JPEG 100 / CRF 16 meets or exceeds each recorded full-frame and regional mean,
minimum and p05 RGB PSNR/SSIM and VMAF NEG value. These are quality calibration runs with
one worker per adapter under shared load, not throughput qualification. Main defaults remain
JPEG 95 / CRF 18. Encoded sizes and the runtime/capture identities are retained in JSON.

The portrait Remotion arm contains a black frame at offset 90, absolute frame 3150 (105 s),
when the focused play changes art. Three independent two-second repeats reproduce it.
That failed comparison cannot establish matched-quality throughput. A shared commit-readiness
correction removes the failure in three controlled repeats; see
[art readiness](../art-readiness-2026-11-01/README.md). The original failed arm is preserved.

Midpoint contact sheets were inspected for content/layout across standard, CSS filters,
three GPU visualizers, looping video, DJ art/branding, portrait, 60 fps and 4K. Each sheet is
reference, browser, Remotion from left to right. No missing midpoint text or structural element
was observed. Color/compression differences remain, and this sampled inspection does not prove
complete temporal equivalence. Standard credit crops were also inspected at native size.

Every full reference verified exact source-to-FFV1 decoded RGB equality. Three lossless samples
and their hashes remain in ignored output before each newly generated bulk reference was
removed. The committed reference manifests retain the complete source RGB hashes. Inspection
JPEGs are only viewing aids, not lossless quality references.

The original coordinator failed its conservative whole-reference disk precheck before starting
the final 63-second chunk-boundary case. `initial-report.json` and `initial-run.txt` preserve
that failure. A separate final-case retry uses the committed per-frame free-space reserve.
The retry's reference includes the shared commit-readiness correction; upstream remains at the
original code. Browser pixels were unchanged in the controlled transition comparison, but
runtime provenance must remain explicit. Final-case results will be recorded separately.

This corpus does not establish full-master endurance, platform qualification, tuned-worker
throughput or the 30% replacement target. Do not promote a default from these scores alone.
