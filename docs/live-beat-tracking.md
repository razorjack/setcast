# Assisted live beat tracking

Open **Beat tracking** in the live operator controls and enable **Estimate beats from input**.
The tracker starts off. It reports listening, uncertain or locked, an estimated BPM and an
evidence score. Detection never changes the active tempo. **Use detected beat grid** applies
a locked estimate through the existing manual tempo path and turns detection off. The accepted
BPM and phase are saved in the session journal when that scene reaches output. No speculative
estimate creates a journal entry.

The default search range is 90–180 BPM. Set minimum and maximum within 40–240 BPM, at least
10 BPM apart. A range containing both a tempo and its half-time interpretation can remain
uncertain. Narrow it to the expected musical range, or use tap tempo. Invalid settings suspend
detection. Settings are local to the current player session.

Detection finds a beat phase, not the musical downbeat. After applying an estimate, use
**Downbeat now** on beat one before relying on bar-aligned scene transitions. Existing beat
and bar modulation use the accepted grid; without a manually aligned downbeat, the bar phase
is arbitrary. Applying a grid is an operator change and holds an active automatic sequence,
as manual tempo changes do. Resume it explicitly. Tap tempo and manual BPM always work;
tracking cannot overwrite them. Capture loss never clears a grid that the operator accepted.

## Analysis and limits

The detector reads stereo RMS energy in 10 ms hops from the existing bounded PCM ring. It uses
positive log-energy changes, a local onset floor, accent emphasis and short smoothing. It
compares normalized autocorrelation across the requested BPM range at 0.2 BPM spacing and
estimates phase from the circular concentration of onsets. The evidence score is the smaller
of periodicity and phase concentration. It is a heuristic, not a probability of correctness.

Eight seconds of fresh audio and three consistent estimates, half a second apart, are needed
to lock. Periodicity and phase must both exceed 0.55, the best competing tempo outside a 6%
neighborhood must score at least 0.08 lower, and recent transients must remain present. Tempo
and phase must agree across estimates. Silence can take up to two seconds to remove a lock.
Input loss, routing/sensitivity changes, capture restart, range edits and a processing gap over
one second discard the analysis. Analysis uses the capture clock, independent of visual delay,
brightness and intensity. It retains 800 onset values and does not populate the FFT cache.

This is a conservative assisted prototype. It locks on regular synthetic percussion. The first
120 seconds of the locally available Stakka & Skynet master and a separate 120-second excerpt
remained uncertain, including with a 160–185 BPM range. The highest evidence scores were below
the lock threshold. Do not treat a displayed candidate BPM as verified when the tracker is
uncertain. Dense breaks, syncopation, blends, offbeat accents and tempo changes need broader
qualification and likely a stronger multiband onset detector before continuous following is
appropriate. Automatic downbeats, continuous output retiming and hardware synchronization
are not implemented. Physical mixer timing remains unqualified.

## Verification

- Pure tests cover stable tempos, beat phase after eight hours, half/double-time ambiguity,
  silence, irregular input, tempo changes, gaps and reset, stereo cancellation and PCM bounds.
- `node packages/renderer-browser/bench/beats.ts` runs actual Chromium/WebAudio capture with
  deterministic percussion. It checks confidence loss, explicit adoption, manual tempo,
  saved journal scenes, restart and invalid range handling. CI runs this check.
- `node packages/renderer-browser/bench/beat-audio.ts <audio> [min BPM] [max BPM]` reports
  estimates for the first 120 seconds of a local file using FFmpeg decoding. It writes JSON
  to stdout and does not modify the recording. A local 120-second run took about 240 ms of
  analysis at 8 kHz with the full range; this excludes decoding and is not a live latency test.

The tempo-periodicity approach is related to the onset/autocorrelation family described in
[Ellis, Beat Tracking by Dynamic Programming](https://www.ee.columbia.edu/~dpwe/pubs/Ellis07-beattrack.pdf).
This implementation uses bounded local estimation and explicit operator adoption; it does not
implement that paper's offline dynamic-programming beat sequence.
