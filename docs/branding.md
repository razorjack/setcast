# Branding and overlays

`branding:` adds a logo, the DJ's name, the event and an episode label, and a line of rotating
messages such as social handles. `announcements:` adds timed one-off lines. The same keys work
in `setcast.yaml` (recorded output, both exporters and `setcast play`) and in `live.yaml`
(`setcast live`). Without `branding:` and `announcements:` nothing changes.

```yaml
branding:
  logo: assets/logo.svg          # PNG, JPEG, WebP or SVG inside the project
  name: Null Vector              # DJ or artist
  event: Neurofunk Sessions      # event, show or venue
  episode: Episode 42            # shown as written; a number works too
  position: top-right            # where the logo and identity sit
  size: 1                        # 0.25 to 4
  opacity: 1                     # 0.1 to 1
  visible: true                  # false keeps the settings and hides logo and identity
  messages:
    lines:
      - instagram.com/nullvector
      - Tracklist in the description
    seconds: 8                   # each line, 3 to 120, fades included
    gap: 20                      # before each line, 0 to 3600
    position: bottom
    size: 1
    visible: true

announcements:                   # setcast.yaml only
  - { at: 58:30, text: Last track, seconds: 10 }
```

Every key is optional. A logo alone is a watermark; `name` alone is a plain credit line.

## Positions and sizes

`position` is one of nine frame areas: `top-left`, `top`, `top-right`, `left`, `center`,
`right`, `bottom-left`, `bottom` and `bottom-right`. The identity block and the message line
each take their own. In the right column the logo sits right of the text; in the middle column
the logo sits above it.

`size` multiplies the base size, which follows the frame's short side, so a portrait frame keeps
the proportions of a landscape one. At size 1 on a 1080p frame the logo box is 86 px tall and up
to 259 px wide (8% and 24% of the short side), the name is 32 px and a message 21 px. Loading
warns when the frame enlarges a raster logo more than 1.5 times; use a larger image or an SVG.
SVG logos need their fonts converted to outlines: an SVG drawn through `<img>` cannot load web
fonts.

Suggested settings:

| Use | Settings |
| --- | --- |
| YouTube video | the defaults: identity top right, messages bottom center |
| Filmed DJ backdrop | `position: top-left` or `top-right`, `size: 1.5`–`2`; the booth and performer cover the bottom and center |
| Rave projection ident | a saved scene with `logo:` only, `position: center`, `size: 3`–`4` |
| Quiet watermark | `logo:` only, `size: 0.6`, `opacity: 0.6` |

Each built-in theme moves the edges of these areas clear of its own header, credits and
visualizers, so the defaults do not cover them. Other positions can still meet a theme's
furniture, especially in portrait, where recorded themes fill the top of the frame. Check a still
(`setcast still --at 1:00`) and choose another position, or move an edge in `css:`:

```css
.setcast {
  --brand-top: 12cqh;      /* also --brand-right, --brand-bottom and --brand-left */
}
```

## Messages and announcements

Messages rotate in list order. Each line waits `gap` seconds, then shows for `seconds`, fading
in and out over 0.6 s. With the defaults the first line appears 20 seconds into the set and the
cycle repeats every 28 seconds. The schedule is a function of the frame's absolute time, so a
still, a seek and every exporter show the same line at the same moment.

An announcement takes the message line from `at` for `seconds` (0.5 to 600, default 10) and
fades the same way. A later announcement replaces an earlier one immediately. While an
announcement shows, the rotating message is hidden; the rotation continues underneath. List
announcements in time order; a time after the end of the recording is an error.

Messages only fade. They do not slide or scroll, because text moved by a fraction of a pixel can
paint a pixel off in some render tabs, and a ticker invites the eye away from the performance.

## Styling

The overlay sits above every theme layer, below brightness and blackout, which cover it. Each
built-in theme shows it in its own fonts and colors through a fallback style, with a halo that
deepens over bright art. Classes and variables for `css:` and theme authors are in the
[CSS contract](theme-plugin-contract.md#branding):

- `.sc-brand-identity[data-position]` holds `.sc-brand-logo` and `.sc-brand-text` with
  `.sc-brand-name`, `.sc-brand-event` and `.sc-brand-episode`. It sets `--brand-size` and
  `--brand-opacity`.
- `.sc-brand-message[data-position][data-kind='message' | 'announcement']` holds
  `.sc-brand-message-text`, with `--message-presence` (0..1), `--message-index` and
  `--message-size`.
- The stage root carries `data-brand-position` while the identity block shows, so a theme or
  `css:` can move its own elements out of the way.
- Both elements get `--bg-luma-behind` and `--bg-detail-behind`, like the panels.

For example, hide the identity during drops and tint announcements:

```css
.setcast[data-section='drop'] .sc-brand-identity { opacity: 0; }
.sc-brand-message[data-kind='announcement'] { color: var(--accent); }
```

## Scenes, replay and export

Branding belongs to the scene. A saved scene copies the logo into its own `assets/` and records
the branding that was on screen. Recalling the scene restores it, as it restores the title. A
replayed project switches branding with each recorded scene. The browser exporter's `--resume`
fingerprint includes logo files.

The logo goes through Setcast's `Img` media wrapper, so both exporters and live output wait for
it before a frame counts as ready. A logo that fails to load fails the export, or keeps the
previous live scene on screen.

## Live operator

`setcast live` reads `branding:` from live.yaml. Open **Branding** in the operator controls:

- **Show identity** and **Show messages** hide or show the identity block and the rotating
  messages without losing their settings. MIDI note 45 and note 46 (channel 1) do the same, and
  both can be learned like other MIDI actions.
- **Position** and **Size** apply immediately.
- **Name**, **Event** and **Episode** apply together with **Apply identity**, so the audience
  never sees a name being typed. An empty field removes that line. Without `branding:` in
  live.yaml, typing a name creates it.
- **Announcement** shows a line for 5 to 60 seconds in the message line. **Clear announcement**
  fades it out from that moment. Announcing again replaces the current one.

The logo and the message lines come from live.yaml; the operator UI does not upload a logo.
Branding changes go through the same path as a theme or title change: the new look is prepared
off screen and replaces the old one once its logo has loaded. A logo that fails to load keeps the
previous output and reports the problem. A running automatic sequence holds on a branding change,
as it does for other appearance edits.

Branding belongs to the scene. **Save scene** stores it with the scene and copies the logo.
Recalling a scene, by pad, MIDI or an automatic sequence, restores the branding it was saved
with, including hidden identity or messages. Keep the identity consistent across a bank by
setting it before saving the scenes.

Announcements belong to the session, not the scene. They are timed on the capture clock like
performance ramps and appear after the visual delay with the rest of the output. A new capture
clears them. Brightness, blackout, the input-loss fallback and projector correction cover
branding like the rest of the scene.

## Journal and replay

The session journal records branding changes as scene snapshots, like theme and title changes,
and announcements as `announcement` and `announcement_end` events:

```json
{"type":"announcement","sample":2880000,"text":"Last track","seconds":10}
{"type":"announcement_end","sample":3120000}
```

`setcast replay` writes them into `announcements:`. An early end shortens the entry so it fades
out at the same moment it did live; an announcement made before the master starts keeps only the
part inside the recording. Replayed scene snapshots switch branding at the recorded times.

## Validation

- `vp run branding-stills [--theme name]` renders each built-in theme with the identity in
  several positions and sizes, a rotating message, an announcement, a centered ident and
  portrait frames into `examples/demo/out/branding/<theme>/`.
- `node packages/renderer-browser/bench/branding.ts` drives the live player in Chromium: logo
  readiness, edits, toggles, MIDI notes 45 and 46, announcements and Clear, saving and
  recalling a branded scene, blackout (the identity's pixels capture black), projector
  correction (the logo loads inside the projected iframe), journal events and replay, and a
  portrait session. Screenshots go to `examples/demo/out/branding-check/`.
- Both export acceptance suites check that a logo served 900 ms late renders the same pixels as
  a prompt one.

Limits: physical displays, cameras and projectors have not been checked for branding legibility
at distance. Built-in themes were tuned on the demo art; a custom position can still meet a
theme's own furniture, especially in portrait. SVG logos with text need outlined fonts.

