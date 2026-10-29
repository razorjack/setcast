# Independent renderer preview

`setcast preview --renderer browser` opens audible playback and an exact-frame inspector using
the browser export renderer. Remotion Studio remains the default. A project with `renderer: browser` selects the
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
- Play mix, or Space, starts the master audio. Its media clock drives absolute frame requests;
  slow scenes skip intermediate requests instead of slowing the soundtrack. Completed-frame
  details can lag the audio while rendering is busy. Pause waits for the frame at the paused
  audio position; frame navigation also pauses and seeks audio. Volume affects preview only.
- Choose Frame sequence (silent) to advance sequentially through every frame. It waits for
  readiness, so complex scenes can run slower than the project frame rate. This inspection mode
  remains available if the browser cannot play the audio; Retry frame recreates both media and driver.
- The inspector shows the completed frame's time, bounded PCM-window count, audio features and
  64 frequency bins, current credits and section, resolved theme, and modulation values.
- Readiness reports the preparation phase and outstanding asset holds. Timings separate audio
  preparation, frame resolution, React commit and asset/paint readiness. Failed frames show an
  error; Retry frame recreates the isolated driver. Requests time out after 60 seconds.
- The URL retains `?frame=N`. Explicit pauses/seeks update it immediately; continuous playback
  updates it once per second, so a full page refresh can return up to a second earlier. In-page
  project reloads and retries retain the latest requested frame. Invalid or out-of-range positions
  clamp to the finite mix. The inspector identifies its completed frame while another is preparing.

## Musical navigation and ranges

Choose listings, annotations or scene recalls, then jump to a named moment or its previous/next
mark. Tied marks remain listed separately; previous/next advances to a different frame. A mark
between frame times selects the first frame that reaches it. Display-clock offsets do not move
these targets. Beat and bar buttons follow the project's tempo and each recalled scene's tempo;
a bar is four beats, as in the existing stage contract. Tempo-free spans have no beat targets.

Set in here and Set out here use the requested frame, including while its exact preparation is
pending. Both endpoints are included. Numeric inputs accept only valid integer frame indices;
moving one endpoint past the other moves the other endpoint with it. Go to in/out pauses playback
and inspects that endpoint. Whole mix restores every frame, including a partial final frame.
The displayed duration is the selected video-frame count divided by fps.

The selection survives in-page reload/retry. Duration changes fit it within the new mix; fps
changes preserve its time boundaries to the nearest frame. A full page refresh resets the range.
Export selected range submits these exact inclusive endpoints to the local export queue.

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
duration. Playback pauses on reload; the old audio element is stopped and removed. Volume and playback mode survive in-page
reloads and retries. Invalid edits display their errors and retain the last valid
project; fixing the files reloads automatically. Asset bytes remain live files, so replacing or
removing a referenced asset can still make a retained project fail to render.

Stopping the command closes its watcher and server and waits for export cancellation cleanup.
Preview does not save scenes or provide Studio's code editor. It is intended for
finite recorded projects; `setcast live` remains the mixer-input workflow.

## Exporting from preview

Export selected range creates an H.264/AAC MP4 with the project's current encoding settings. The
CLI saves each job under `out/preview/<job-id>/frames-<first>-<last>.mp4`; existing project outputs
are not overwritten. Export uses pinned Chromium and system FFmpeg, independently of the browser
showing preview. Run `setcast doctor --renderer browser --require video,resume` to inspect setup,
and `setcast browser-install` to provision Chromium. Unsupported encoding settings fail visibly.

The queue runs one job at a time, with at most four waiting jobs and twenty jobs per preview
session. It shows stage progress, completed-frame reuse, errors, actual runtime details and a
Download MP4 link. Jobs use the project revision selected when submitted. Valid project edits or
failed reloads cancel unfinished jobs; create a new job after fixing or changing the project.
This prevents a queued old scene from exporting with newly replaced media.

Cancel export retains completed resume chunks. Resume export retries the same destination while
the project revision remains unchanged. Input hashes and runtime identity decide whether chunks
can be reused. Consecutive jobs share a browser/bundle session; the browser closes when the queue
empties. Audio is encoded once continuously for each export. Preview volume does not change it.

Stopping preview cancels active and waiting work and waits for cleanup. Completed MP4s and
interrupted checkpoints remain on disk; queue history is not restored after restarting the server.
A CLI render with `--resume`, the same `--out`, encoding settings and exact range can reuse those
checkpoints. Range end is `(last + 1) / fps`, including a partial final frame. The UI does not offer
checkpoint deletion or automatic disk eviction; retained exports/checkpoints are ordinary local
files under the displayed directory. Remove unwanted completed job directories when finished.

The library `preview(project, options)` remains read-only unless the caller supplies
`exports: {directory, settings?}`. `update(project, settings?)` publishes encoding-setting changes
alongside a new project revision. Only the trusted caller chooses paths and settings. The HTTP
API accepts bounded range/revision JSON, checks exact Origin plus a per-server token, and rejects
cross-site requests. It offers no arbitrary file writes, shell arguments, scene saves or upload
endpoint. Download routes resolve only completed job IDs within their reserved directories.

## Implementation and verification

The composition renders in a fixed-size iframe, isolated from the inspector's CSS. It uses the
same driver, bounded audio windows, explicit video-frame decoder and readiness handshake as
browser export. One frame request runs at a time; intermediate queued seeks are discarded in
favor of the latest request. During audio playback, the inspector receives each completed frame
even when a newer request is pending. This avoids starving inspection updates on slow scenes.
A failed driver is replaced before reuse. The audio element plays the master independently of
the export driver's bounded analysis windows; no second PCM analyzer is created for playback.

`node packages/renderer-browser/bench/preview.ts` checks actual controls, audible and silent playback,
unmuted media-clock progress, volume, deliberately slow frame preparation, exact pause/seek,
finite endings, audio cleanup and failure recovery, backward seeks, export-driver pixel agreement (within one channel level from iframe compositing), audio
inspection, video loops, reference imports, project updates, failed-asset retry and read-only
endpoints. It also runs the CLI with Remotion imports forbidden, edits its YAML, verifies recovery
and checks clean shutdown. Screenshots go to `examples/demo/out/preview-check/`.

Unit tests cover queue serialization, failure/disposal, frame bounds, tied marks, tempo-span
navigation, range conversion and revision publication.
Installed-package smoke bundles both preview entries and, with `--browser`, exports and decodes
six frames through the installed preview API. Shared export-driver changes also require
both exporter acceptance suites and the same-page frame-order bench.

Further work: live hardware and other operating systems remain separate qualification tasks.
Numeric image-difference metrics and GPU timing remain
future additions. Audible playback checks verify browser media state and frame selection, not
physical speaker/display latency or output routing.

Validated locally: `vp run ready` (467 tests, dependency ban and Remotion smoke), both exporter
acceptance suites, the preview and frame-order Chromium benches, and `vp run package-smoke
--browser`. Desktop and narrow screenshots were inspected. Physical hardware and other operating
systems were not qualified in this change.

The export workflow check is `node packages/renderer-browser/bench/preview-exports.ts --out NEW_DIR`.
It exercises the actual UI, request rejection, decoded direct-export agreement, last-frame inclusion,
partial-chunk recovery, stale project invalidation, symlink download rejection and shutdown cleanup.
See [retained preview-export evidence](research/preview-exports-2026-10-29/README.md).
