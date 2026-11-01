# Bitmap video preparation experiment

The isolated `renderer/bitmap-video-candidate` branch retains the existing image elements,
object-fit, dimensions and contain blur, but replaces canvas PNG serialization with a BMP V4
blob URL. Production main still uses PNG. Exact pixels and a 3,000-capture resource check
pass; complete-export speed and full-master memory remain unqualified.

## Representation and ownership

The copied Mediabunny CanvasSink frame is read as RGBA and serialized as top-down 32-bit BGRA.
The header declares explicit color/alpha masks and sRGB. Header fields follow Microsoft's
[BITMAPV4HEADER](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapv4header)
and [BITMAPFILEHEADER](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapfileheader).
The image DOM and CSS behavior stay unchanged. The decoder owns its current object URL,
revokes it on replacement and releases it on source change/unmount. Pending decoder opens
have an explicit owner so disposal also covers asynchronous startup.

An earlier BMP data-URL variant also preserved pixels, but its readiness diagnostic was slower
under shared load. It is archived as `data-url-*.txt` and `data-url-*.json`; it is not a retained
speed improvement. Blob URLs avoid large base64 DOM attribute values, but raw bitmap buffers
and browser image decoding still consume resources.

## Retained verification

- `blob-roundtrip.json`: nine opaque/gradient/transparent checks over clear, dark and light
  backgrounds match the PNG control exactly in Chromium.
- `blob-comparison.json`: all 288 unique decoded RGBA samples match the original PNG path.
  Coverage is all 16 themes, landscape and portrait, arbitrary/backward seeks, loop boundaries
  and source switches. Two source paths contain identical video bytes to isolate ownership.
- `partial-blob-candidate.json` and `blob-darkroom-retry.json`: all 32 scene instances keep
  exactly one URL at readiness, at most two during replacement, and zero after unmount.
- `encoded-comparison.json`: a complete ten-second export across a source switch matches
  all 300 decoded video frames and the decoded PCM audio hash. Individual frame hashes and
  both export reports are retained. Exports ran under concurrent load; their timings are
  not performance qualification.
- Candidate baseline checks passed: 667 tests in 111 files, lint/types/format, dependency
  isolation and decoded smoke. Browser and Remotion exporter acceptance and packed-browser
  smoke also passed locally on macOS M1 Pro.

The first blob probe stopped after 271 recorded frames when its synchronous FFmpeg PNG-hash
child stalled in libavformat read. The renderer had already saved the next PNG, and separate
file decoding matched the baseline. Only that owned child was sampled and killed, allowing
browser cleanup. `partial-blob-attempt.txt` and `hash-subprocess-stall.txt` retain the failure.
The helper now hashes the saved file, bounds decoder threads and applies a 30-second hard
timeout. A separate Darkroom retry completed the remaining scene checks. No failed result
was overwritten. The combined report deduplicates the overlapping samples.

After recording hashes, redundant newly generated PNGs were removed, keeping a source-change
sample for each theme/orientation. Input media and previous research were preserved.

## Remaining qualification

Run alternating complete exports in an idle window, then full-master process-tree memory and
cleanup checks. The repeated-capture resource check does not prove bounded Chromium image-cache
or decoder memory over a full master. Do not merge the production change
or claim faster exports until those checks pass. No quality threshold or default setting was
changed by this experiment.

## Sustained capture resources

`memory-png.json` and `memory-bitmap.json` retain 3,000 JPEG captures each with natural garbage
collection. Each run repeatedly traverses absolute frames 3000–3299, exercising looped video and
source changes over ten passes. The bitmap branch is cc10be9; the PNG control includes the shared
commit-readiness fix. The six original/corrected browser transition exports had identical decoded
hashes, but these runs are resource observations, not an isolated speed comparison.

All 3,000 bitmap URLs were revoked. Every sampled ready frame owned one URL, replacement peaked
at two, and explicit scene close left zero. Later browser JS heap and summed process-tree RSS
fluctuated without sustained growth during these runs. Raw samples include heap size, DOM counts,
RSS and URL counters. RSS can double-count shared pages and excludes external GPU services.

The helper samples resource counts every 150 frames and performs real JPEG screenshots without
retaining their bytes. It does not encode a full output or traverse a long real master. This
establishes bounded observed behavior for the repeated source-switch workload only. Full-master
endurance and quiet complete-export timings remain pending. The CLI fixture boundary and signal
cleanup were added to the helper after these runs started; the capture/resource loop is unchanged.
