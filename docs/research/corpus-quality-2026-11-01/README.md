# Frozen corpus quality measurements, 1 November 2026

All eleven frozen cases completed numerical measurement against Remotion 4.0.539, including
the final chunk-boundary retry and a corrected portrait comparison.
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
runtime provenance must remain explicit. The final-case results are retained separately in `chunk-boundary/` and `chunk-retry-report.json`.

This corpus does not establish full-master endurance, platform qualification, tuned-worker
throughput or the 30% replacement target. Do not promote a default from these scores alone.

## Corrected portrait comparison

`portrait-corrected/` repeats the complete ten-second portrait comparison with the shared
commit-readiness correction in both adapters. Neither output contains a black frame, and browser
JPEG 100 / CRF 16 still meets or exceeds every recorded full/regional mean, minimum and p05 metric.
`summary.json` lists every check. The complete lossless reference RGB hash is unchanged from the
original portrait reference. This replaces the failed portrait arm for quality interpretation;
the original failure remains retained. It remains a one-worker, untimed-quality calibration,
not a throughput or platform qualification.

## Final chunk-boundary result

The 63-second export completed both adapters and all quality measurements with the per-frame
disk reserve in place. Browser JPEG 100 / CRF 16 meets or exceeds every recorded full-frame,
branding, tracklist and credit-region mean, minimum and p05 metric, including VMAF NEG.
The retry retained its three lossless reference samples and hashes before removing only its
newly generated bulk reference. Original preflight failure evidence is preserved.

All eleven cases have numerical measurements, but the original-code Remotion chunk output
also contains the same black art-transition frame: offset 510, absolute frame 3150 (105 s).
The browser output contains no black frame. `chunk-boundary/black-frame-check.json` retains the
scan. The shared fix was deliberately absent from this original comparison runtime. Its corrected
portrait checks do not replace a corrected 63-second rerun. That rerun remains pending; do not
use this failed arm for matched-quality or speed qualification.

The midpoint contact sheet was inspected with no missing midpoint content. This sampled check
does not remove the transition failure. The measurements do not qualify default settings,
automatic workers, the bitmap candidate, a long real master, other platforms or matched-quality
speed. No production renderer/default migration follows from this
milestone. All performance and promotion work stops here at the user's request.
