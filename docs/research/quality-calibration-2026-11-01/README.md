# Lossless-reference calibration, 1 November 2026

These short samples validate the measurement tools and identify settings for further comparison.
They do not qualify replacement performance or the complete scene suite.

The reference is the demo at seconds 90–91, 1920×1080/30 fps, captured sequentially as PNG in
Chromium 156.0.8078.4. FFV1 preserves every RGB sample: the decoded RGB24 hash matches a separate
hash of all source PNGs. The large reference/video artifacts remain under `examples/demo/out/`;
this directory retains their identities, measurements, negative controls and inspected crops.

| Sample | Full RGB SSIM mean | Credits RGB SSIM mean | VMAF NEG mean |
| --- | ---: | ---: | ---: |
| Identical reference | 1 | 1 | 97.4859 |
| Browser, JPEG 95 / CRF 18 | 0.976670 | 0.985176 | 95.6391 |
| Remotion 4.0.539, CRF 18 | 0.978405 | 0.988795 | 95.8027 |
| Browser, JPEG 100 / CRF 18 | 0.979521 | 0.989774 | 95.6537 |
| Credits erased | 0.902757 | 0.000198 | See raw report |

All encoded samples use libx264 medium. The current Remotion sample uses its Chromium
157.0.8080.0 and shared-memory capture. Browser samples use JPEG image2pipe. JPEG 100 improves
credit-region fidelity in this scene, but its VMAF mean remains slightly below Remotion's. Do not
select one favorable metric and declare equal quality. The next calibration should lower browser
CRF and check every region and low-percentile score before timing those settings.

RGB metrics interpret matrix/range through FFmpeg and do not perform display-transfer conversion.
Both samples declare sRGB transfer and BT.709 primaries. Remotion omits the YCbCr matrix, so this
comparison uses FFmpeg's default for that missing value. Other receiving applications may differ.
VMAF uses the explicitly selected `vmaf_v0.6.1neg` model after common BT.709 limited-range YUV420
conversion. The identical-reference result demonstrates that its score is not an exactness test.
See [FFmpeg's filter contract](https://ffmpeg.org/ffmpeg-filters.html#libvmaf) and
[Netflix's model documentation](https://github.com/Netflix/vmaf/blob/master/resource/doc/models_v0.md).

The four credit crops are absolute frame 2715. Inspection found no missing text or changed
placement in that sampled frame. The erased-credit control demonstrates the need for region
metrics; the short-video control rejects a missing frame. The separate six-frame identity check
matches the resolved project digest and encoded file digest from comparison report version 4.
Changing that project digest causes rejection before scoring. Its installed Remotion arm uses
4.0.513 and is only a harness check, not the current-upstream calibration sample above.

Reproduction commands and remaining qualification requirements are in
[the replacement plan](../../renderer-replacement-plan.md#phase-0-establish-a-fair-benchmark).

The final content check additionally requires identical source-asset bytes and absolute frame
ranges, not only equal project JSON. Separate modified-asset, shifted-range and changed-output
reports are rejected before scoring. Both input video files are hashed again after scoring.
`content-reference.json`, `content-export.json` and `content-check/` retain the final successful
contract; the earlier identity-only records remain as discovery history.

## Higher-quality calibration

The `crf16/` follow-up captures a new reference using the final asset/project/range identity
contract. Browser JPEG 100 / CRF 16 and Remotion 4.0.539 / CRF 18 both use x264 medium. Browser
meets or exceeds Remotion in all recorded mean, fifth-percentile and minimum full-frame and
credit-region RGB PSNR/SSIM and VMAF NEG scores for this one-second sample. Full RGB SSIM means
are 0.981091 and 0.978405; credit-region means are 0.990251 and 0.988795; VMAF NEG means are
96.0162 and 95.8027. Encoded files are 499,286 and 302,772 bytes including audio and container.
The additional fidelity costs file size and may cost export time. No speed claim follows from
these calibration runs, which ran alongside correctness checks. These settings are candidates
for the representative suite, not new production defaults or proof of universal quality parity.
