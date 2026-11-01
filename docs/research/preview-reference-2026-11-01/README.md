# Export-runtime reference inspection, 1 November 2026

The preview captures a PNG through the pinned Chromium exporter and records its Chromium
version and bundle hash. It shares the bounded export queue, cancellation, revision checks and
reserved output directories. Imported reference images remain local to the viewing browser.

`results.json` records the actual UI workflow: decoded PNG equality with a direct still, zero
changed pixels for the same PNG, exactly one changed pixel for a controlled edit, and hiding a
capture at a different frame. Numeric results describe decoded 8-bit sRGB canvas RGBA, including
alpha. They do not compare interactive DOM pixels or establish video quality.

The same run verifies inclusive video ranges, decoded video/audio equality, request isolation,
cancellation/resume, revision invalidation, symlink download rejection and shutdown cleanup.
Desktop and narrow screenshots in the ignored output directory were inspected. The initial
inspection exposed an interactive loading cover obscuring a completed export image; the final
run verifies that the cover is absent when an export image is displayed.

Reproduce with `node packages/renderer-browser/bench/preview-exports.ts --out NEW_DIRECTORY`.
The retained run used `examples/demo/out/preview-reference-final-2026-11-01`. These checks
qualify the local preview workflow, not other platforms, speakers or display latency.
