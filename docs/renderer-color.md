# Browser renderer color contract

Browser H.264 exports declare the sRGB colors captured from Chromium. The capture browser is
forced to sRGB. JPEG frames use the full-range BT.601 YCbCr matrix; RGB primaries and transfer
are declared separately as BT.709/sRGB primaries and sRGB transfer. The output remains opaque,
eight-bit 4:2:0 SDR. This contract does not provide HDR, wide-gamut video or alpha export.

| Property | Encoded value |
| --- | --- |
| YCbCr matrix | `bt470bg`, the BT.601 matrix used by JPEG |
| Range | `pc`, full range |
| RGB primaries | `bt709` |
| Transfer | `iec61966-2-1`, sRGB |
| Pixel format | 4:2:0, reported by ffprobe as `yuvj420p` for full-range H.264 |

Matrix coefficients describe the conversion between RGB and YCbCr. They do not define the RGB
primaries or transfer curve. Using a BT.601 matrix does not require BT.601 television primaries.
The capture retains the sRGB image produced by Chromium. The normative CSS color definition
identifies sRGB's primaries, D65 whitepoint and transfer function. See
[CSS Color 4: sRGB](https://www.w3.org/TR/css-color-4/#predefined-sRGB).

## Why the metadata matters

The earlier software output carried full range and `bt470bg` matrix tags but omitted primaries
and transfer. FFmpeg decoded its RGB values closely, while Chromium playback visibly shifted
saturated colors. For example, the chart's green [0,255,0] appeared as [63,251,0]. Explicit sRGB
properties corrected that sample to [0,255,1]. The complete software-decoded RGB hash remained
identical across all thirty chart frames. VideoToolbox also passed the corrected patch check;
its earlier unspecified transfer produced a mid-gray shift as well.

The renderer uses FFmpeg's `setparams` on frames before encoding. This supplies frame properties
without an additional pixel conversion. CLI-only color flags did not survive some tested FFmpeg
9.0.2 filter paths. A range/matrix conversion is a different operation and must not be introduced
merely to obtain different tags. See [FFmpeg setparams](https://ffmpeg.org/ffmpeg-filters.html#setparams)
and [scale](https://ffmpeg.org/ffmpeg-filters.html#scale).

Software and hardware preflight exercise the required filter. Browser `doctor` applies it to
its encoded JPEG fixture, so a build missing the filter cannot report video encoding ready.
The shared diagnostic helper accepts an optional adapter filter; Remotion's probe is unchanged.
Chunk reuse includes adapter code in its identity, so exports created before this change cannot
reuse old encoded chunks after the renderer changes.

## Qualification and limits

The [retained experiment](research/color-contract-2026-10-29/README.md) compares metadata-only,
range/matrix conversion and transfer-conversion candidates. Production passed all sixteen patch
centers within three RGB channel levels in actual Chromium playback with both libx264 and
VideoToolbox. The fixture includes near-black values, dark/full gradients and fine text. Source,
legacy playback and corrected playback images were inspected. Moving export acceptance passed
in both encoders, including GPU visuals, video, chunk joins, timing, cancellation and recovery.

These are macOS M1 Pro, pinned Chromium 156.0.8078.4 and system FFmpeg 9.0.2 results. They do not
qualify NVENC hardware, other operating systems, QuickTime, OBS, editing applications, displays or
YouTube's transcoder. JPEG/H.264 compression and 4:2:0 chroma subsampling still alter fine color
edges. A low patch error is not pixel-identical output or a matched-quality speed benchmark.
Screenshots used by still export keep their existing image-format behavior.
