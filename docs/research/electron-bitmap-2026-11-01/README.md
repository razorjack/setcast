# Electron native bitmap capture, 1 November 2026

Both tested native capture handshakes are rejected for deterministic production export. The
full browser paints the CSS scene correctly through CDP, but a native bitmap can belong to an
older frame after the Setcast readiness acknowledgement. No Electron dependency was added to
the project. The isolated runtime is Electron 45.2.1, Chromium 156.0.8078.75 on macOS arm64.

The harness compares opaque native BGRA converted to RGB against same-host CDP PNG and the
existing pinned Playwright PNG, after ordered and backward seeks. It covers sixteen themes,
two aspect ratios (1920x1080 and 1080x1920) and six captures per case. Existing limits remain
maximum channel difference 1/255 and changed pixels at most 0.001%. Alpha, GPU/video fixtures,
complete encoded output, recovery and throughput are not qualified by this experiment.

`capturePage()` passes 191/192 samples exactly. Darkroom landscape at frame 3029 instead returns
the previous requested frame 3151. Its decoded RGB SHA-256 is
`673636cfd692ad00f23b37a9ee8780d81457226ded67139de437e8c64b0d2e3f`, exactly the previous CDP
frame (`2-cdp.png`). The requested CDP and Playwright frames both hash to
`7c8583ab4e194fcc3d7423fd6b1bb5772473cb2b8a46fb1b168b4e9091493718`.
The maximum channel difference is 244/255. The retained images show the incorrect elapsed timer
and scene state. A rare stale frame is sufficient to reject the path.

The second handshake subscribes to the next offscreen `paint` event and calls `invalidate()`
after readiness. It fails all thirty samples of the repeated Darkroom reproducer and 191/192
all-theme samples. An arriving paint event does not establish that the bitmap belongs to the
requested Setcast frame. A future native host needs a proved association between frame readiness
and compositor output, followed by the full media/recovery/throughput qualification. Do not fix
this by accepting the previous frame, relaxing pixel limits or guessing a timeout.

These are negative pixel results. Stage timings were collected alongside correctness and
full-master resource checks and cannot support a speed comparison. CPU bitmap readback is not
shared GPU texture transport; each 1080p frame copies 8,294,400 bytes before encoding. Production
retains the existing screenshot path.

Pilot errors are retained: the isolated npm package initially lacked its downloaded binary;
a top-level await of app readiness stalled initialization; closing the first fixture window
terminated the host before the next fixture. The corrected host owns shutdown across windows,
uses a bounded repaint/frame wait and the controller validates the completed sample count.
The final harness records actual browser observations for subsequent runs. Earlier retained
reports predate that additive field. Ready passes all 688 tests, formatting, lint/types,
dependency isolation and the decoded smoke render.

Reproduce with a separately installed Electron executable, without changing workspace packages:

```sh
node packages/renderer-browser/bench/electron-capture.ts examples/demo --electron /path/to/Electron --out NEW_DIRECTORY --theme all --capture page
node packages/renderer-browser/bench/electron-capture.ts examples/demo --electron /path/to/Electron --out NEW_DIRECTORY --theme all --capture paint
```

Primary references: [offscreen rendering](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering),
[webContents capture and repaint APIs](https://www.electronjs.org/docs/latest/api/web-contents),
[NativeImage bitmap APIs](https://www.electronjs.org/docs/latest/api/native-image), and
[ES module startup](https://www.electronjs.org/docs/latest/tutorial/esm).
