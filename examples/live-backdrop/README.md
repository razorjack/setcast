# Filmed DJ backdrop

Run `node packages/cli/bin/setcast.js live examples/live-backdrop` from the repository root.
Select the mixer input, move output to the screen behind the performer, and open Operator window.
The empty center leaves room for the performer. Adjust `--backdrop-x`, `--backdrop-y` and
`--radial-size` in backdrop.css for the camera framing, then restart the player.

The preset starts at 65% visual intensity and brightness. Use Save scene to add variations to
the scene bank. Capture sensitivity stays at 1 so performance changes can replay against the
unaltered master. This is a starting composition; camera exposure, display brightness and
refresh/shutter interaction still need a physical setup check.

The logo and name sit in the top-left corner and a social line appears top right every minute,
where the booth and performer do not cover them. Replace `logo.svg` and the `branding:` block in
live.yaml with your own; see [docs/branding.md](../../docs/branding.md).
