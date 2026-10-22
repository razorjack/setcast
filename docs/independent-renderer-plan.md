# Independent renderer prototype plan

Status: implemented and validation complete, 2026-10-22. Work stays on master.

## Product contract

Support `renderer: remotion | browser` and a CLI `--renderer` override on offline rendering
commands. Remotion stays the default. A browser-renderer failure must be explicit, without
silently falling back. Themes, visualizers, frame assembly and media paths remain Setcast-owned.
Studio preview remains Remotion-specific; real-time `play` and `live` already use the browser.
Two implementations are intentional during migration and provide comparison evidence. Do not
remove Remotion on a calendar deadline; require correctness, practical performance and packaging.

## Implementation sequence

1. Implement a browser export entry that renders absolute frames using `resolveFrame`, the
   existing Stage and bounded decoded PCM windows. No full-set AudioFeatures sidecar required.
2. Own frame readiness: React commit/effects, labeled holds, prepared images/fonts, layout
   measurements, canvas work and paint. Include frame identity, timeout and errors. Never drive
   offline export from wall time, playback callbacks or a running media element.
3. Capture stills with pinned Playwright/Chromium. Reuse current bundling and asset serving
   where appropriate. Use independent resources, without importing any Remotion package.
4. Encode short H.264 clips with an independent FFmpeg subprocess. Keep one continuous master
   soundtrack, exact shared range math, bounded buffering, atomic output and cleanup.
5. Add deterministic video frame decoding and looping, preserving fit and theme CSS.
6. Wire config/CLI selection, cancellation and actionable unsupported-option diagnostics.
   Keep public export contract in core; avoid a plugin registry for two known adapters.
7. Run existing exporter acceptance against both adapters, including timing, fractional ranges,
   delayed assets, video loops, arbitrary frame order and recovery. Compare representative
   themes in matching browser environments; explain platform/browser differences.
8. Run longer exports, baseline ready, packaging and independent dependency checks. Document
   requirements and measured limits. Optimize concurrency only after correctness.

## Design decisions

- Begin with screenshot capture and FFmpeg. Native HTML-in-canvas and WebCodecs are separate
  experiments; independence alone does not promise a speedup.
- System FFmpeg is acceptable for the opt-in prototype. Preserve the default renderer's
  existing provisioning. Browser installation must be explicit and actionable.
- Add AbortSignal support for substantial exports and clean up child processes on cancellation.
- Reuse bounded PCM decoding first; sidecar caching is a later measured optimization.
- The installed CLI may still include Remotion during migration, but the browser export
  execution path and package dependency graph must not require its code.
- Public flags must either work or fail before capture with a clear alternative.

## Progress and evidence

- Core already owns Exporter, range/chunk planning, PCM analysis and media probing.
- Acceptance runner already accepts `--adapter` and `--reference` directories.
- Browser playback video has approximate synchronization and must not be reused for export.
- Existing FFmpeg runner uses Remotion internals and must not be imported by the new exporter.
- Added browser export entry, readiness handshake, bounded PCM, explicit video decoding,
  Playwright capture, streamed FFmpeg encoding, atomic outputs, cancellation and CLI selection.
- Remotion remains the default. Studio remains Remotion-specific. Browser runtime installation
  is explicit through `setcast browser-install`.
- Shared acceptance passed for both exporters, including fractional ranges, 5 ms A/V pulse
  alignment, delayed fonts, video looping, repeatable themes, failure and cancellation recovery.
- Package smoke passed for installed browser PNG and H.264/AAC alongside default-renderer checks.
- Representative cross-exporter comparison: relief portrait exact; sterile-tech max difference
  2/255 per channel; darkroom max 1/255. Keep the strict reference assertion unchanged.
- A sustained 120-second 1080p export completed 3600 frames with two workers and 20-second chunks,
  with all Remotion imports explicitly forbidden. See the guide and out/browser-two-minutes.json.
- Supported prototype limits are documented in docs/browser-renderer.md. Sidecar caching,
  alternate capture APIs, hardware encoding and other graphics backends remain later work.
- Direct same-page frame-order checks passed, including backward seeks, video loops and a delayed
  font introduced by a scene change.
- Final `vp run ready` passed: 427 tests, dependency bans and default Remotion smoke. Both export
  acceptance suites and installed-package smoke passed. Config selection, CLI overrides and
  bundled/batch outputs were also exercised with Remotion imports forbidden.
- The two-minute browser export took 169 seconds against Remotion's 144 seconds, about 18%
  slower in this local comparison. Keep optimization and platform qualification as follow-up work.
- Local FFmpeg lacks libwebp. Verified the prerequisite error occurs before capture, preserves
  an existing destination and removes temporary output. WebP encoding itself remains unqualified.
