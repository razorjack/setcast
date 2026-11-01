# Browser-first migration candidate

The `renderer/browser-first-candidate` branch makes the browser renderer the default and removes the Remotion adapter
from the CLI's required dependencies. The candidate is isolated from main until the remaining
release criteria in [the replacement plan](renderer-replacement-plan.md) are satisfied. Local
macOS validation is evidence for that machine only. The Linux follow-up has passed fresh
browser-only and optional-Remotion installations on Fedora x64, with the Linux graphics fix
merged into `renderer/linux-browser-first` at `a61a0b1`. See the
[Linux evidence](research/linux-qualification-2026-11-01/README.md) for exact runtime scope.
The hosted CI matrix has not run; Windows and matched-quality performance qualification remain open.

Main still defaults to Remotion. The commands and default behavior below describe the candidate;
on main, select the browser renderer explicitly.

## Set up the browser renderer

Install FFmpeg with `libx264` and AAC support on PATH. From a source checkout:

```sh
vp install
node packages/cli/bin/setcast.js browser-install
node packages/cli/bin/setcast.js doctor
node packages/cli/bin/setcast.js validate path/to/project
node packages/cli/bin/setcast.js render path/to/project --range 0-3
```

On Linux, provision Chromium system libraries with
`vp exec --filter @setcast/renderer-browser playwright install --with-deps chromium`.
For an installed CLI, replace `node packages/cli/bin/setcast.js` with `setcast`.
PNG, JPEG and lossless WebP stills do not need FFmpeg. Preview inspection uses the browser
opened by the user; queued exports use pinned Chromium and FFmpeg.

Projects without `renderer:` now select browser. Explicit `renderer: remotion` remains explicit.
`--renderer` overrides YAML for rendering, clips, stills and preview. `doctor` and `capabilities`
default to browser and do not read project configuration. `setcast init` writes browser selection.

Browser export accepts `gl: auto`, `default` and `angle`; remove other Remotion-specific values
or select the compatibility adapter. `parallelEncoding: false` is unsupported by browser;
remove it to use bounded streaming. Unsupported options fail before capture, without silently
switching renderers. Hardware encoding requires a supported device and an actual successful
encode probe. Software H.264 remains the default. Worker concurrency selects 1/2/4 from stable CPU/memory limits, with one worker below 300 frames.
An explicit `--concurrency 1` through `8` overrides that policy. Selection is recorded before
checkpoint/cache identity; its memory estimate is not an allocation limit.

## Compatibility and rollback

The repository workspace still installs the Remotion adapter for compatibility development:

```sh
node packages/cli/bin/setcast.js render path/to/project --renderer remotion --range 0-3
node packages/cli/bin/setcast.js preview path/to/project --renderer remotion
```

For a persistent project choice, add `renderer: remotion` to `setcast.yaml`. This does not
change themes, timelines or media wrappers. Remove that line, or use `--renderer browser`,
to return to browser rendering. Existing completed output files are preserved on export failure.
Browser checkpoints and cache entries are not interchangeable with Remotion jobs.

Setcast is not published on npm yet. After publication, install the CLI and compatibility
adapter together, using matching Setcast versions. A local example is
`npm install @setcast/cli @setcast/renderer-remotion`, followed by `npx setcast` from that
installation. For a global installation, install both packages globally. For a temporary
invocation, provide both packages to `npm exec --package ... --package ... -- setcast ...`.
A globally installed CLI cannot resolve an adapter installed only in a project. Missing adapter
errors explain this and offer browser selection. Other module-loading failures retain their
original errors. Remotion's own license terms continue to apply when using its adapter.

Transparent ProRes projects cannot use the Remotion compatibility adapter with those output
settings. For an opaque H.264 rollback, set `output.codec: h264`, `output.transparent: false` and
an MP4 `output.file`, then select `renderer: remotion`. Keep the original ProRes output if its
alpha channel is needed. See [compositing output](compositing-output.md) for the format contract.

## Verification and release boundaries

For a Linux session, follow the [qualification handoff](linux-renderer-qualification.md), including
transfer of the local candidate branch and fresh Linux dependencies. Windows qualification remains
pending; passing Linux checks alone does not authorize promotion.

`vp run package-smoke --browser --report out/installed-browser.json` builds tarballs and installs
only the CLI into a fresh dependency tree. Local overrides resolve unpublished Setcast packages;
the resulting installed graph is checked for any Remotion package. The check exercises default
validation, diagnostics, all theme stills, video, clips, bundled video/thumbnail/description,
CLI preview, playback, preview exports, checkpoint cleanup and cache reuse with decoded equality.
The report records platform, architecture, Node, installed packages, the installation lock digest,
runtime diagnostics, completed checks and failure details. The report survives temporary cleanup.

`vp run package-smoke --report out/installed-compatibility.json` also installs the optional adapter
and checks explicit Remotion validation and decoded export. Workspace `vp run ready` remains
mandatory. Export acceptance continues to run against both adapters. CI provisions the pinned
browser before the default smoke, and adds independent fresh-install jobs on Linux, macOS and
Windows with uploaded reports. These jobs test software export; they do not qualify every GPU,
hardware encoder, distribution or user browser.

Promotion requires the outstanding plan criteria, including representative matched-quality
timings against current Remotion under quiet load and successful supported-platform evidence.
The candidate's dependency removal and local correctness checks do not establish a speed claim.
