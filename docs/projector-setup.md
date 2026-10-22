# One-projector setup

Setcast can correct a live output for one flat projection area. Four corners set perspective;
source crop trims the image before correction, and up to eight rectangular black masks cover
fixed areas of the output frame. These settings belong to the venue, not the scene.

Start with `setcast live examples/live-projection` from the repository root, or run
`setcast live` in your own live project. Use **Operator window** to keep controls on the laptop.
In **Output setup**, choose the projector and enter fullscreen. If display selection is
unavailable, move the output window to the projector manually and enter fullscreen there.
Use a composition aspect ratio that matches the projector; the player fits it without stretching.

## Align the output

1. Open **Projector setup** and enable projection correction. This remounts the visual scene;
   audio capture continues. Enable it before starting the show.
2. Turn on **Show calibration pattern**. For setup without audio input, select **Quiet scene**
   under **Output setup → On input loss**. Blackout still covers the pattern.
3. Match corners 1–4 to the projection area: top-left, top-right, bottom-right, bottom-left.
   Drag the numbered handles in the operator diagram or enter percentages. Arrow keys move a
   focused handle by 0.1%; Shift plus an arrow moves it by 1%.
4. Trim unwanted source edges with **Source crop**. Add **Output masks** for obstructions or
   regions that should remain black. Masks stay fixed when you change the corners.
5. Give the setup a venue name and select **Save venue**, then **Export venue** for a backup.
   Turn the pattern off, restore the desired input-loss fallback and check the actual scene.

Corners must stay inside the output and form a convex, clockwise quadrilateral covering at
least 1% of the frame. Crossed, reversed or nearly collapsed corners are rejected without
changing the working output. Crop must retain at least 5% of each source dimension. Masks must
fit inside the output frame. The circle and square grid in the pattern preserve the source
aspect ratio before correction; the pattern is static and follows the performance brightness.

**Reset geometry** restores the full-frame rectangle and removes crop and masks. It preserves
the enabled state. Disabling correction bypasses all geometry, crop and masks without deleting
those settings. The calibration pattern is an explicit setup tool and is never saved.

## Venue profiles

Up to 16 named profiles are stored in browser local storage for the server origin. Use a stable
port to return to the same storage. Saving an existing name replaces it. Profiles are loaded
explicitly; restarting does not automatically apply the last venue. A profile contains geometry,
crop, masks and whether correction is enabled. It excludes audio routing, scenes, performance
levels, display selection, fullscreen permission and the calibration pattern.

**Export venue** downloads a versioned JSON file. **Import venue** validates and applies one
file, with a 32 KiB limit; it does not save it to browser storage until **Save venue** is used.
Invalid files keep the working output. Importing or loading a profile turns off the pattern.
Export profiles before changing machines, browsers or ports.

For a fixed installation, use normalized 0–1 coordinates in live.yaml:

```yaml
projection:
  enabled: true
  corners: [[0.08, 0.1], [0.92, 0.04], [0.98, 0.95], [0.02, 0.9]]
  crop: {top: 0.02, right: 0, bottom: 0.02, left: 0}
  masks:
    - {left: 0.46, top: 0.75, width: 0.08, height: 0.25}
```

The UI starts from this configuration and does not rewrite live.yaml. A venue JSON file wraps
these settings as `{ "version": 1, "name": "Warehouse", "projection": { ... } }`.

## Scene and replay behavior

Scene recalls and automatic sequences preserve venue geometry. Saved scenes and journal
snapshots omit `projection`, so replay exports show the original composition. Both exporters
keep their existing behavior; Remotion remains the default. The calibration pattern and geometry
adjustments are not journal events. Avoid showing the pattern during a performance you intend
to reconstruct from the journal.

Correction uses a projective CSS transform on an iframe containing the live scene. This keeps
artwork, visualizer alignment and theme measurements in composition coordinates. Font readiness
uses the iframe document. Capture, operator controls, blackout and input-loss handling remain
owned by the output window. Crop applies before the transform; masks apply after it in output
coordinates. The [CSS transform specification](https://www.w3.org/TR/css-transforms-2/) defines
the projective matrix convention.

## Verification and limits

`node packages/renderer-browser/bench/projection.ts` exercises the real Chromium player with
synthetic audio: GPU motion, geometry isolation, artwork alignment, delayed iframe fonts, invalid
geometry, drag/keyboard adjustment, crop, masks, pixel-black calibration blackout, input loss,
profile import/export and persistence, scene recall and snapshots. Unit tests cover perspective matrices and schema boundaries.

This is one planar output. It does not provide curved meshes, edge blending, multiple projectors,
color matching or camera banding correction. Physical alignment, projector black levels,
fullscreen routing, focus and sustained GPU performance require qualification on the actual
installation. Black masks send black pixels; they do not remove projector light leakage.
