# Faster lossless reference compression

The lossless reference tool now requests PNG through CDP with `optimizeForSpeed: true` and
`captureBeyondViewport: false` after the same Setcast frame-ready acknowledgement. This changes
PNG compression and transport in the measurement tool only. Production JPEG capture, still
exports, frame preparation and renderer selection are unchanged.

The exact-pixel experiment compares normal Playwright PNG and the faster PNG from the same
ready page, decoding both to RGBA and comparing SHA-256. All 120 comparisons pass exactly:
all sixteen built-in themes in both orientations at 30, 90 and 110.4 seconds (96), plus the
frozen corpus field, tunnel, constellation and looping-video projects in both orientations at
those same moments (24). The local runtime is pinned Playwright 1.64.1 / Chromium 156.0.8078.4
on macOS arm64. The raw reports retain image sizes and diagnostic capture times. Concurrent
quality work and external load mean these times are not renderer performance qualification.

Run `node packages/renderer-browser/bench/png-speed.ts --out NEW_DIRECTORY` for the theme probe.
For an additional project use `--project PROJECT --theme sterile-tech`. The first inventory
attempt called `.names()` on the theme record and failed before capturing; it was corrected to
`Object.keys(themes)`. There was no ignored pixel failure or relaxed comparison.

The reference manifest records `capture: png-cdp-optimize-for-speed`. Its independent full RGB
hash still verifies that FFV1 preserves every captured pixel. An equality probe at these
moments does not replace the broader output-quality, temporal or platform checks.
