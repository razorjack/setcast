# Portable MIDI controls

MIDI mappings belong to the live output session. A project can provide repeatable controller
setup in `live.yaml`, and the operator can transfer it between machines as a versioned JSON
profile. Scene recall does not replace mappings or reconnect the input. The output window
continues to own MIDI when the controls move to the operator window.

## Project setup

```yaml
midi:
  name: Booth controller
  mapping:
    cc:1:1: intensity
    cc:1:7: brightness
    note:1:44: blackout
    note:1:45: branding
    note:1:46: messages
    note:1:36: scene-1
```

Keys have the form `note:channel:number` or `cc:channel:number`. Channels are 1–16, and note/CC
numbers are 0–127. Use canonical decimal numbers without leading zeros. A mapping contains at
most 256 entries. Profile names contain 1–80 characters and default to `MIDI controls`.
An explicit `mapping: {}` disables all mapped actions. A supplied mapping replaces the defaults;
it does not merge with them. `setcast validate --live` checks the configuration before a session.

Available actions are `intensity`, `brightness`, `blackout`, `branding`, `messages` and `scene-1`
through `scene-8`. Intensity maps the input range to 0–200%; brightness maps it to 0–100%.
The other actions are buttons. Scene numbers refer to the current bank order, so keep that order
stable during a performance. Defaults are listed in [live-performance.md](live-performance.md#midi).

The project configuration never requests MIDI permission or selects a device automatically.
Open **MIDI controls**, choose **Connect MIDI**, grant permission and select an input.
MIDI is input-only, without SysEx or clock following.

## Learning, transfer and persistence

Choose an action and press **Learn MIDI**, then move or press the desired control. Learning
removes that action's previous assignments and replaces the selected control's old action.
Authored/imported profiles may deliberately map several controls to one action. Continuous
intensity/brightness updates are coalesced every 100 ms. CC buttons trigger on an upward crossing
of half range; note buttons trigger on each nonzero note-on. Note-off and velocity-zero note-on
are ignored. Replacing mappings clears pending values and button state, so an old fader value
cannot arrive after an import or reset.

**Mapping list** shows the current channel, note/CC and action. **Export MIDI profile** downloads
the complete current mapping, even before connecting a device. **Import MIDI profile** validates
the complete file before applying it; invalid, unsupported-version or oversized files retain
the current mapping. Imports are limited to 64 KiB. **Reset MIDI mappings** restores built-in
defaults, including branding/message notes 45 and 46.

Startup and persistence follow these rules:

| Setup | Startup | Changes during the session |
| --- | --- | --- |
| `midi:` present in `live.yaml` | Project mapping wins | Session-only; export to keep them |
| No project mapping | Valid browser profile, then valid legacy mapping, then defaults | Saved in browser storage when available |

A project's mapping never overwrites the browser profile used by unrelated projects. Browser
storage is scoped to the server origin, including its port; changing the port can select a
different stored profile. Storage denial does not prevent session controls. Valid older mappings
migrate to the versioned format without adding new assignments. Scene saves and journal scene
snapshots omit MIDI setup. Journals record the resulting performance, branding and scene changes,
not raw controller messages, so replay does not require the original controller or profile.

## Portable format and core API

```json
{
  "version": 1,
  "name": "Booth controller",
  "mapping": {
    "cc:1:7": "brightness",
    "note:1:44": "blackout"
  }
}
```

The `version` field belongs to the portable document, not the `live.yaml midi` block.
Generate an editor schema with `setcast schema midi > midi.schema.json`. Runtime validation
also enforces constraints such as the mapping count that are not represented by JSON Schema.
An example profile is in `examples/live-projection/midi-profile.json`.

`@setcast/core` exports `MidiConfigSchema`, `MidiProfileSchema`, `MidiMappingSchema`, their
types, `MIDI_ACTIONS`, `DEFAULT_MIDI`, `midiMessage`, `midiKey`, `learnMidiMapping` and
`MidiControlBuffer`. These contracts do not import React, Web MIDI or a renderer.

`midiMessage(bytes)` validates and decodes a complete channel message, returning a normalized
value in 0–1 or null for ignored/malformed input. Feed decoded messages and a validated immutable
mapping to `MidiControlBuffer.push(message, mapping)`. It returns immediate button actions and
retains only the latest value for each of the two continuous actions. The host calls
`flush(mapping)` at its chosen cadence and dispatches the returned controls. Mapping object
replacement clears queued controls and edge state; mutate neither a mapping in place nor the
shared defaults. Call `reset()` when changing input or entering learning. The host owns device
permission, scheduling and action execution.

The action set is deliberately finite. This contract does not provide arbitrary commands,
OSC transport, device-specific drivers, MIDI output or a plugin action registry. A future adapter
can reuse the decoder and buffer while keeping its own transport and scheduling policy.

## Verification and limits

`node packages/renderer-browser/bench/midi.ts` exercises configured startup, portable transfer,
keyboard file selection, invalid imports, learning, reset, scene isolation, popup ownership,
journaled actions and legacy/browser persistence with synthetic Web MIDI and audio input.
Core tests cover message/key validation, bounded profiles, coalescing and stale-value removal.
Physical controller behavior, permissions across browsers and multi-hour MIDI input remain
hardware qualification work.
