# Live performance controls

`setcast live` has visual intensity, brightness, immediate blackout, saved scene recall and MIDI
controls. The output window owns audio capture, MIDI and the journal. Moving controls to the
operator window keeps those connections running. Remotion remains the default offline exporter.

Two starting compositions are included:

```sh
node packages/cli/bin/setcast.js live examples/live-backdrop
node packages/cli/bin/setcast.js live examples/live-projection
```

The backdrop uses restrained motion and an empty center for a filmed performer. The projection
uses large radial spokes, bass-driven scale and a stereo trace. Both are editable CSS projects.
Camera exposure, display banding, projector placement and physical interface routing still need
testing with the intended equipment.

## Performance controls

**Intensity** scales visual audio features from 0 to 200%. It affects audio modulation and
visualizer history at the current intensity. It does not alter captured PCM or the recorded
master. **Sensitivity** in input settings remains a separate capture setting; keep it at 1 for
journal replay against an unmodified recording.

**Brightness** dims the complete composition from 0 to 100%. **Blackout** immediately covers the
output with black; **Restore output** returns to the selected brightness. Fader updates are
coalesced to at most ten per second and ramp over 150 ms. Blackout is immediate. The default
performance values are both 1; a live.yaml or setcast.yaml can override them:

```yaml
performance:
  intensity: 0.65
  brightness: 0.65
```

## Scene bank

Use **Save scene** to add the current look. The bank reads up to 64 `saved-scene-*` directories
beside live.yaml in creation order. **Refresh scenes** picks up changes made outside the player.
Each saved scene includes its CSS and assets. Journal snapshots use separate `journal-scene-*`
directories and do not fill the bank. Keep scene directories inside their original project.

Recall requires running input. It changes the appearance, title and elapsed-clock setting while
preserving input routing, output dimensions, tempo grid and the current intensity/brightness.
The performance settings saved in a scene apply when that directory is opened as a project;
recalling it from a running bank keeps the operator's current levels.

Choose a cut or a 0.5, 1 or 2 second fade through black. **Start on next bar** schedules the start
of the fade on the manual four-beat grid. Without a BPM, it starts immediately. Set BPM and
**Downbeat now**, or tap tempo, before relying on quantization. This does not detect musical
phrases or beats from the mixer signal.

Half the duration fades out, the new scene prepares at black, and half fades in. Asset preparation
can extend the black interval. A cut also waits for readiness. Faders are disabled during the
transition; blackout remains available. A queued transition can be replaced or cancelled. Asset
failure restores the previous scene and brightness, reports the problem and excludes the failed
scene from the journal. Preparation times out after 30 seconds.

## Automatic scene progression

Open **Automatic sequence**, add saved scenes, arrange them with the up buttons and choose a
minimum dwell of 5–3600 seconds per entry. **Run sequence** starts from the active scene when
it appears in the list, otherwise recalls the first entry. Dwell begins after fade-in completes.
Transitions use the scene bank's fade duration and manual next-bar setting. This does not detect
beats or musical phrases from audio.

**Hold sequence** preserves dwell and cancels a fetch or queued transition. A fade already in
progress finishes. **Next scene** skips dwell and works while held; it does not enable automatic
progression. A non-looping sequence holds at the end; Run starts it again. A one-entry sequence
holds that scene instead of repeatedly fading it into itself.

Input loss and blackout pause dwell. A failed recall holds the sequence and reports the problem;
it never retries indefinitely. Manual scene pads and MIDI scene recall take control. Editing the
list holds it, and restarting input requires an explicit Run. Theme/appearance edits also hold a
running sequence when it is not transitioning. Capture continues independently of scene loading.

A project can supply the list in `live.yaml`:

```yaml
sequence:
  loop: true
  scenes:
    - {preset: saved-scene-intro, seconds: 60}
    - {preset: saved-scene-main, seconds: 120}
```

Preset names refer to existing saved scene directories beside live.yaml. Missing YAML references
fail at startup. **Export sequence** downloads a JSON object whose `sequence` value can be copied
into live.yaml (JSON is valid YAML). Browser edits are session-only. Lists contain at most 64
entries and may revisit a preset. Saving a scene omits the parent project's sequence.

Automatic recalls and their effective fades enter the journal through the same readiness path as
manual recall. Failed scenes do not enter it. Replay uses those recorded actions, so it does not
need to rerun the scheduler or copy the live sequence configuration.

Run `node packages/renderer-browser/bench/sequence.ts` for dwell, looping, hold/skip, manual
control, failed scene recovery, journal replay and capture restart checks.

## MIDI

Open **MIDI controls**, click **Connect MIDI**, grant the browser permission and choose an input.
MIDI is input-only and does not request SysEx. Defaults use channel 1:

| Message | Action |
| --- | --- |
| CC 1 | Intensity, 0–200% |
| CC 7 | Brightness, 0–100% |
| Notes 36–43 | First eight scene slots |
| Note 44 | Toggle blackout |

Choose a control and click **Learn MIDI**, then move or press the hardware control. Learning
replaces that action's previous assignment. A CC assigned to a button triggers on its rising
half-range crossing. Note-off, velocity-zero note-on and MIDI clock are ignored. Continuous
values are coalesced at 100 ms. Mappings persist in browser storage for the server origin;
changing the port uses another origin. **Reset MIDI mappings** restores defaults.

Scene slots follow the bank order, so deleting or copying directories can change assignments.
Use a stable bank for a performance. Browser support, device permissions and physical controllers
remain equipment-specific; the automated check uses a synthetic MIDI input.

## Journal and deterministic export

The journal records effective performance ramps on the capture sample clock, including blackout
and transition fades. Only scenes that reach ready output enter the journal. Start the journal
before performing, record mixer audio separately, and use the alignment procedure in
[live-input.md](live-input.md#session-journal-and-replay).

Replay writes an ordered `automation` list in setcast.yaml. Each entry explicitly records its
start, start values, target values and duration. Both renderers evaluate it at absolute frame
time, so seeking backward and interrupted fades remain deterministic:

```yaml
automation:
  - at: 30
    from: {intensity: 1, brightness: 1}
    to: {intensity: 1.4, brightness: 0.6}
    duration: 2
```

Equal timestamps use the last entry. Ramps may last 0–30 seconds. Trimming a replay through a
ramp carries its interpolated values forward. No live audio is embedded in the journal.

Writes remain serialized and flushed, with at most 32 pending operations and 64 MiB per journal.
Falling behind stops journaling with a notice while capture continues. The server caches only
the last validated metadata for up to 32 journals, re-reading a file if external changes are
detected. Keep the JSONL and referenced scene directories together.

## Verification

```sh
node packages/renderer-browser/bench/performance.ts
```

The browser check covers saves, bar-aligned recall, brightness, blackout, MIDI, operator transfer,
failed artwork recovery and journal replay. Both export acceptance suites verify a black frame,
intermediate brightness and repeated out-of-order frame requests. Hardware performance,
camera/display interaction and multi-hour MIDI use remain unqualified.

## Energy-aware scene selection

Ordered progression remains the default. Set `sequence.mode: energy` to choose scenes using
sustained input energy after the current scene's minimum dwell:

```yaml
sequence:
  mode: energy
  loop: true
  energy: {low: 0.2, high: 0.55, hysteresis: 0.05, smooth: 3, sustain: 8}
  scenes:
    - {preset: saved-scene-calm, seconds: 45, energy: low}
    - {preset: saved-scene-active, seconds: 60, energy: medium}
    - {preset: saved-scene-intense, seconds: 30, energy: high}
    - {preset: saved-scene-neutral, seconds: 60, energy: any}
```

Choose Audio energy in the operator's Automatic sequence controls. Tag each entry Low, Medium,
High or Any, and adjust thresholds/timing there if needed. Configuration edits hold the sequence;
press Run again. Export sequence includes these settings for reuse in live.yaml.

Energy is the equally weighted mean of input RMS and bass, sampled at 10 Hz and exponentially
smoothed over `smooth` seconds. It is measured before performance intensity and visual delay;
input sensitivity still affects it. `low` and `high` separate three bands. Hysteresis widens the
current band's exit thresholds; a candidate band must persist for `sustain` seconds before it
is accepted. The operator shows the smoothed value and accepted band. These are signal-energy
bands, not inferred breakdowns, buildups or future drops. Tune thresholds against your mixer.

At dwell expiry, the sequencer rotates through entries matching the accepted band in list order.
Any entries are used only when no matching entry is eligible. With no match, the current scene
stays visible; a sole matching entry is not recalled repeatedly. Loop permits wrapping; without
it only the current and later entries are eligible, and the final entry holds after its dwell.
Next scene remains an explicit ordered skip. Manual recall takes control as before.

Input loss, blackout, routing/sensitivity changes and capture restart discard energy evidence;
classification must settle again. Dwell and transition behavior remain unchanged. Effective
scene changes use the existing journal snapshots and ramps, so replay does not rerun the
classifier. The automated check uses generated audio; real-mixer threshold calibration remains
hardware qualification work.

## Confidence-aware beat tracking

The operator can enable bounded live tempo/phase estimation, inspect uncertainty and apply a
locked grid. Estimates never retime output automatically. Use **Downbeat now** after adoption
for bar alignment. See [live-beat-tracking.md](live-beat-tracking.md) for controls, journal
behavior, validation and the current limitations on dense real recordings.
