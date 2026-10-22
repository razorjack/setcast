# Constellation backdrop

Run `node packages/cli/bin/setcast.js live examples/live-constellation` from the repository root.
Select the mixer input, move the output to the screen behind the performer and open Operator
window.

Points drift slowly in three layers that fly toward the camera, linked by fine lines. Bass
swells the points, mids lengthen the links and highs make the points twinkle. A CSS mask keeps
the area behind the performer quiet; move it with `--backdrop-x` and `--backdrop-y` in
constellation.css for the camera framing. The preset starts at 65% intensity and brightness and
uses warm, low-contrast points, so highlights stay controlled on camera.

Camera exposure, display brightness and refresh/shutter interaction still need a physical setup
check. The constellation costs more GPU time than `field` or `tunnel`; on a machine without
hardware graphics, keep `resolution` at 0.5 or lower.
