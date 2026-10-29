# Color metadata qualification, 2026-10-29

Explicit screenshot color properties correct a visible Chromium playback mismatch while retaining
the software path's decoded RGB pixels. Production uses full-range BT.601 YCbCr with sRGB/BT.709
primaries and sRGB transfer. See the [contract](../../renderer-color.md) for the exact semantics.

The fixture is a 640×360 SVG chart captured as PNG reference and quality-90 JPEG. It repeats the
same JPEG thirty times through production H.264 arguments, then tests decoded RGB and actual
Chromium video playback against the PNG. It records other candidate policies independently of
production, including CLI-only tags, limited-range matrices and transfer conversion.

- [Software report](software.json): libx264, CRF 18, medium preset. Production and legacy have
  identical complete decoded RGB hashes. Every production patch center is within three levels
  of the source in Chromium playback.
- [Hardware report](hardware.json): actual VideoToolbox, software fallback disabled, 8 Mbit/s.
  Production passes the same patch-center and metadata assertions. This is not an equal-quality
  comparison with the software encoder.
- [Assembled output metadata](assembled-metadata.json): sixteen software/hardware MP4s from the
  existing acceptance suite retain the declared properties after chunk assembly and muxing.
- [Source chart](chart.svg), [PNG reference](reference.png), [legacy playback](legacy-playback.png)
  and [corrected playback](production-playback.png) retain the visually inspected evidence.

The reports retain complete command arguments and local artifact paths. Host: Apple M1 Pro,
macOS, Node 26.7.0, Chromium 156.0.8078.4, FFmpeg 9.0.2. Production now also explicitly passes
`--force-color-profile=srgb`; Playwright 1.64.1 already supplied that same default during the probes.

Reproduction:

```sh
node packages/renderer-browser/bench/color.ts --out NEW_SOFTWARE_DIRECTORY
node packages/renderer-browser/bench/color.ts --hardware --out NEW_HARDWARE_DIRECTORY
vp run export-acceptance --adapter ./packages/renderer-browser/src/export/index.ts --out NEW_ACCEPTANCE_DIRECTORY
node packages/renderer-browser/bench/hardware.ts --out NEW_HARDWARE_ACCEPTANCE_DIRECTORY
vp run package-smoke --browser
vp run ready
```

Global error scores include compression, chroma reconstruction and display conversion. Do not
select a color policy solely from those scores. In particular, a limited-range conversion with
a lower global error was not adopted over the metadata-only fix. True transfer conversion lost
near-black chart steps in this browser-playback exercise. Other receiving apps, operating systems,
NVENC devices, physical displays, HDR and transparent compositing are unqualified here.
