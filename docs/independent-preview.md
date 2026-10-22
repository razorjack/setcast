# Independent renderer preview

`setcast preview --renderer browser` opens an exact-frame inspector using the browser export
renderer. Remotion Studio remains the default. A project with `renderer: browser` selects the
independent preview without a command-line override.

```sh
setcast preview path/to/project --renderer browser
setcast preview path/to/project --renderer browser --theme darkroom --port 3211
```

Open the printed localhost URL. The default port is 3210. Preview uses the browser you open it
in; it does not need `browser-install` or FFmpeg for frame capture. Project audio probing and
whole-set analysis use the normal project loader. Export still uses pinned Chromium. Browser,
font rasterization and GPU differences can affect pixels, so compare in the same browser/backend
when diagnosing a rendering regression.

## Inspecting frames

- The timeline and frame-number input seek to an exact integer frame. Arrow keys step one frame;
  Home and End select the first and last valid frame. Shortcuts do not intercept text editing.
- Play frames, or Space, advances sequentially with no audio. It waits for each frame to become
  ready, so complex scenes can run slower than the project frame rate. Use `setcast play` for
  audio-synchronized playback.
- The inspector shows the completed frame's time, bounded PCM-window count, audio features and
  64 frequency bins, current credits and section, resolved theme, and modulation values.
- Readiness reports the preparation phase and outstanding asset holds. Timings separate audio
  preparation, frame resolution, React commit and asset/paint readiness. Failed frames show an
  error; Retry frame recreates the isolated driver. Requests time out after 60 seconds.
- The URL retains `?frame=N`, including across reloads. Invalid or out-of-range positions clamp
  to the finite mix. The inspector identifies its completed frame while another is preparing.

## Reference comparison

Choose a PNG, JPEG or WebP with the composition's exact dimensions, up to 32 MiB. The browser
keeps the image locally; it is not uploaded or written into the project. Overlay offers an
opacity control; Difference blends the reference against the rendered composition. Remove
reference returns to the original display. Invalid imports retain the previous reference.

The reference remains selected across project edits. A changed composition size disables its
comparison until a matching image is chosen. Scaling the workspace affects both images equally.
This is a visual comparison tool, not a cross-browser pixel-equivalence guarantee.

## Project edits and recovery

The CLI watches resolved project inputs, including YAML, theme/CSS and media. Valid edits publish
one new project revision and recreate its frame driver at the selected frame, clamped to the new
duration. Playback pauses on reload. Invalid edits display their errors and retain the last valid
project; fixing the files reloads automatically. Asset bytes remain live files, so replacing or
removing a referenced asset can still make a retained project fail to render.

The server only accepts read requests. Stopping the command closes its watcher and server.
Preview does not save scenes, encode exports or provide Studio's code editor. It is intended for
finite recorded projects; `setcast live` remains the mixer-input workflow.

## Implementation and verification

The composition renders in a fixed-size iframe, isolated from the inspector's CSS. It uses the
same driver, bounded audio windows, explicit video-frame decoder and readiness handshake as
browser export. One frame request runs at a time; intermediate queued seeks are discarded in
favor of the latest request. A failed driver is replaced before reuse.

`node packages/renderer-browser/bench/preview.ts` checks actual controls, finite playback, backward
seeks, export-driver pixel agreement (within one channel level from iframe compositing), audio
inspection, video loops, reference imports, project updates, failed-asset retry and read-only
endpoints. It also runs the CLI with Remotion imports forbidden, edits its YAML, verifies recovery
and checks clean shutdown. Screenshots go to `examples/demo/out/preview-check/`.

Unit tests cover queue serialization, failure/disposal, frame bounds and revision publication.
Installed-package smoke bundles both preview entries. Shared export-driver changes also require
both exporter acceptance suites and the same-page frame-order bench.

Further work: live hardware and other operating systems remain separate qualification tasks.
Audio-synchronized exact preview, export controls, numeric image-difference metrics and GPU timing
are possible additions after this inspection workflow is qualified on real projects.

Validated locally: `vp run ready` (467 tests, dependency ban and Remotion smoke), both exporter
acceptance suites, the preview and frame-order Chromium benches, and `vp run package-smoke
--browser`. Desktop and narrow screenshots were inspected. Physical hardware and other operating
systems were not qualified in this change.
