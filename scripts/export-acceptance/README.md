# Exporter acceptance

Run `vp run export-acceptance` from the repository root. It requires `ffmpeg` and `ffprobe` on
PATH and permission to start local HTTP servers and the exporter's browser. CI runs it after
the normal smoke render. All source media is generated locally; there are no external requests
except a possible first-time browser download by the adapter.

The suite calls only Setcast's `Exporter` interface: `render`, `still`, and `withRenderSession`.
Remotion is the default adapter. Use `--gl swangle` for software WebGL on headless machines,
as CI does; `--gl` accepts the output graphics-backend values supported by the selected adapter. To test a replacement and compare its representative theme
stills against Remotion:

```sh
vp run export-acceptance --out examples/demo/out/remotion-reference
vp run export-acceptance --adapter ./packages/renderer-browser/src/export/index.ts --out examples/demo/out/custom --reference examples/demo/out/remotion-reference
```

The adapter argument is a local module exporting those three functions. Reference comparisons
require separate output directories and the same Chromium version, fonts, OS, and graphics
backend. They compare decoded RGB pixels exactly, not PNG metadata. There are no committed
platform-specific golden images. Without `--reference`, the suite checks determinism and known
fixture behavior, not parity with a previous revision. Outputs remain in the selected directory
for inspection; the temporary project is removed even after failure.

## Checks

- A 3.1415-second WAV and a range of `[1.05, 8)` at 30 fps must produce absolute frames 32 through
  94: 63 frames, or 2.1 seconds. Both an unchunked export and one-second chunks must have H.264
  video, AAC audio, the expected dimensions, and the same finite endpoint. The final chunk is
  only three frames. Container/audio padding has a 100 ms tolerance; video duration has a 1 ms
  tolerance. This padding allowance does not relax the synchronization check.
- Source tones and CSS flashes start at 1.5 and 2.5 seconds. Decoded visual entrances must occur
  at output frames 13 and 43, exactly. Audio entrances must be within 5 ms of those times, before
  and after a chunk boundary. Unit tests verify that the measurement assertions reject missing,
  extra, invalid, and shifted pulses.
- A font served with a 900 ms delay must produce the same pixels as the promptly served font.
  Both font requests are verified. Fallback-font and no-image captures must differ, preventing
  false passes where both renders omit their assets. Images are project-local, as required by
  the project asset contract. Image preparation and hold failures also have core unit tests.
- A branding logo served with a 900 ms delay must produce the same pixels as a prompt one, and
  differ from a capture without branding. The `Img` wrapper holds the frame until it loads.
- A generated red/blue video must seek to the requested frame and loop after one second.
- Sterile-tech, darkroom, and relief cover DOM/SVG, canvas, filters, embedded fonts, background
  measurement, overlap, and portrait layout. Capturing 1.7 s, 0.4 s, then 1.7 s must repeat the
  first image exactly, while the earlier image must differ. Optional reference images check
  visual parity between exporters or revisions.
- The WebGL 2 visualizers `field`, `tunnel` and `constellation` each repeat stills after
  out-of-order jobs. Every decoded frame of a one-worker export matches a two-worker export with
  the same one-second chunks. This checks each adapter independently; GPU pixels are not
  compared across different GPU/browser runtimes.
- A missing image during a chunked export must fail, preserve the old destination, and leave
  no additional files in the output directory. A subsequent still in the session and a new
  session must succeed. An out-of-range still must clamp to frame 94.

The suite first exposed a roughly 43 ms delay in the old single-batch audio path. All audible
exports now use the existing master-file encoder, whose decoded fixture pulses align within
5 ms. Studio playback retains its existing audio component.

## Limits

This is a short, deterministic migration check. It does not establish hour-long drift,
throughput, bounded memory, all-theme visual quality, or behavior on every supported codec.
It does not test remote background artwork, which project loading does not accept.

Cancellation uses the core `AbortSignal` option. The suite cancels an in-progress video, checks
that it preserves the existing destination and removes temporary files, then runs another job
in the same session. Adapter tests also inject audio/video failures to verify sibling-task
cancellation and cleanup. This does not establish process-tree cleanup for every operating-system
termination mode.

The preparatory refactors keep range/chunk planning and export types in core, media URL probes
in `@setcast/core/media`, file probes in `@setcast/core/node`, and CLI adapter selection in
`packages/cli/src/renderer.ts`. They preserve Remotion's option translation and public type
exports. Each adapter owns its FFmpeg invocation. Browser export uses a system subprocess without importing Remotion.


`--reference` requires exact decoded pixels. See
[the browser exporter guide](../../docs/browser-renderer.md) for measured cross-version differences.
