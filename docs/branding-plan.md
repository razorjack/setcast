# Branding and overlays: implementation plan

Starting revision: ac48ad6. Work on master and commit each validated standalone piece. Remotion
remains the default exporter. Do not push or publish. Usage documentation lives in
[branding.md](branding.md); this file records the plan, decisions and progress.

## Scope

Branding is a small, scene-level overlay shared by recorded output, browser playback and live
output. It serves a filmed DJ backdrop (a legible identity at camera distance, a quiet center)
and rave projection (a large centered logo recalled from a scene pad). It is not a layout
editor: positions are a fixed set of nine frame areas, sizes are one multiplier per element,
and appearance belongs to CSS.

1. **Identity block** (`.sc-brand-identity`): optional logo image plus DJ/artist name, event
   and episode text. Position, size multiplier, opacity and visibility are YAML keys.
2. **Message line** (`.sc-brand-message`): optional rotating social/notice lines. Each line
   shows for `seconds` after a `gap`, fading over 0.6 s, as a pure function of absolute frame
   time. No CSS animation and no state across frames.
3. **Announcements**: timed one-off lines. Recorded projects list them in `announcements:`;
   the live operator announces text for a chosen duration or clears it. An active
   announcement replaces the rotating message in the same line. Journals record them and
   replay writes them into `announcements:`.

Out of scope: animated logos (video), uploaded logos in the live operator UI, scrolling tickers,
per-theme bespoke branding designs, intro/outro cards (a centered large identity is a saved
scene), camera setup and renderer performance changes.

## Configuration

`setcast.yaml` and `live.yaml` share `BrandingSchema` (`packages/core/src/branding.ts`):

```yaml
branding:
  logo: assets/logo.svg          # PNG, JPEG, WebP or SVG inside the project
  name: Razorjack
  event: Neurofunk Sessions
  episode: Episode 42            # text; a number is shown as written
  position: top-right            # top-left | top | top-right | left | center | right |
                                 # bottom-left | bottom | bottom-right
  size: 1                        # 0.25 to 4, multiplies the base size (short side units)
  opacity: 1                     # 0.1 to 1
  visible: true                  # false keeps the settings but hides logo and identity
  messages:
    lines: [instagram.com/razorjack, Tracklist in the description]
    seconds: 8                   # each line, 3 to 120
    gap: 20                      # before each line, 0 to 3600
    position: bottom
    size: 1
    visible: true
announcements:                   # setcast.yaml only
  - {at: 30:00, text: Last hour, seconds: 10}
```

## Implementation steps

1. Core schema and pure presentation (`branding.ts`): written Zod errors, `messageAt(branding,
   announcements, time)` returning the visible line, its kind and presence; unit tests for
   schema errors, rotation, gaps, fades, announcement precedence and truncation.
2. Project loading: `ResolvedProject.branding` (null when absent), logo validation with
   `requireFile`, extension check listing the formats, enlargement warning through
   `readImageSize`, dependency tracking for preview reloads. Live loading shares it.
3. Stage component `Branding` in core/react: logo through the `Img` media wrapper so every
   renderer holds the frame until it loads; identity and message elements with
   `data-position`, `--brand-size`, `--brand-opacity`, `--message-presence`, `data-kind`.
   Stage root gets `data-brand-position`. Both elements join `MEASURED_ELEMENTS`, so themes and
   the fallback style read `--bg-luma-behind`/`--bg-detail-behind`.
4. base.css: structural placement for nine positions using `--margin` and `cqmin` sizes
   (portrait keeps the same proportion of the short side), `z-index` above theme layers, and
   a `@layer fallback` look in each theme's own variables with legibility shadows.
5. Scenes: `sceneAt` (recorded scene timeline), `rebaseScene`, `savedScene` and `saveScene`
   carry branding and copy/rebase the logo; replay's initial appearance includes it; the
   browser resume fingerprint tracks logo files.
6. Announcements: `announcements:` in `setcast.yaml` (ordered, inside the recording),
   `CompositionState.announcements`; `resolveLiveFrame` accepts session announcements.
   Journal events `announcement` and `announcement_end`; `replayEvents` returns
   announcements and truncates on end; `setcast replay` writes them.
7. Live operator: a Branding section with identity/messages visibility, name/event/episode
   draft applied with one button, position and size choices, and announcement text, duration,
   Announce and Clear. Appearance changes use the existing scene selection, readiness and
   journal snapshot path. Announcements use capture-clock time like performance ramps, reset
   on capture restart. MIDI gains `branding` (note 45) and `messages` (note 46) toggles.
8. Examples: branding in `examples/live-backdrop` and `examples/live-projection`, a stills
   script `vp run branding-stills` rendering positions, sizes, messages and announcements over
   the demo in landscape and portrait for every theme.

## Validation plan

- Unit tests: schema errors, presentation timing, loading/asset errors, journal parsing and
  replay, saved-scene copying.
- `vp run branding-stills` and live screenshots inspected in landscape and portrait.
- Chromium live check (`packages/renderer-browser/bench/branding.ts`): branding controls,
  announcements, MIDI toggles, scene save/recall carrying branding, journal and replay,
  projection and blackout covering branding.
- Both export acceptance suites (logo readiness: a delayed logo must match a prompt one; a
  missing logo control must differ). Resume and installed-package smoke when assets or
  packaging change. `vp run ready` before every commit.

## Progress

- Plan written before coding.
- Step 1–6 (core, loading, Stage, base.css, scenes, recorded announcements) implemented. Stills
  of all 16 themes showed the top corners under theme headers and the bottom over spectra, so
  positions became per-edge insets (`--brand-top` etc.), defaulting below the header, and each
  built-in theme tunes them for its layout in landscape and portrait. The message default moved
  from bottom-right (up next) to bottom center. Light-ground themes got `--brand-halo` and
  `--brand-plate`. Both export acceptance suites pass with a new delayed-logo readiness check;
  a branded browser `--resume` export rendered and reused its checkpoints. `vp run ready`: 503
  tests passed. Journal events and live controls are next.
