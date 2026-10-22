# Mixer driven projection

Run `node packages/cli/bin/setcast.js live examples/live-projection` from the repository root.
Select the mixer input, put output fullscreen on the projector, and open Operator window.
Large spokes follow the spectrum, bass expands the ring, and the center trace shows stereo motion.
There is no automatic flashing or scene switching.

Use the intensity and brightness controls, save variations to the scene bank, and set tempo or
tap a downbeat for transitions on bar boundaries. MIDI defaults use channel 1: CC 1 intensity,
CC 7 brightness, notes 36–43 scene slots and note 44 blackout. Learn MIDI replaces mappings.
Projection geometry correction and multi-projector output remain future work.
