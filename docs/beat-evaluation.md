# Beat-analysis evaluation

Run the same core evidence tracker against reproducible onset inputs before changing live
behavior. The workbench separates lock coverage from correctness. A locked estimate on an
unlabeled recording is not counted as correct.

```sh
node scripts/beat-evaluation.ts \
  --config scripts/beat-evaluation/synthetic.json \
  --out examples/demo/out/beat-evaluation-new
```

The output directory must not exist. `report.json` checkpoints each completed case and records
configuration, source SHA-256 values, runtime/revision identity and aggregate measurements.
`observations.jsonl` records each method's state, evidence and assessment every half second.
Decoding and observation writing are streamed; each tracker retains at most 800 onset values.
The runner stores one result per case, not the recording or all observations. SIGINT/SIGTERM
retain a cancelled report and stop decoding. Failures retain their report and return a nonzero
exit status. A complete report means the experiment ran, not that its candidates are qualified.

## Corpus format

Version 1 accepts 1–64 uniquely named cases. File paths resolve from the command's working
directory. Files remain unchanged. FFmpeg is required for file cases; synthetic cases need no
audio files or external decoder.

```json
{
  "version": 1,
  "methods": ["energy", "bands", "bass", "spectral"],
  "cases": [
    {
      "id": "recorded-section",
      "source": {"file": "my-project/assets/master.wav"},
      "at": 600,
      "seconds": 120,
      "range": {"min": 160, "max": 185}
    }
  ]
}
```

`at` defaults to 0 and `seconds` to 24. Both align to 10 ms hops; duration is 12–7200 seconds.
The range defaults to 90–180 BPM and uses the same schema as live tracking. A short file fails
instead of silently reducing the requested duration. A method list must contain unique names;
omitting it runs all four methods.

For synthetic input, replace `source` with
`{"pattern":"four-floor","bpm":128,"offset":0.17,"seed":1}`. Available patterns are `pulse`,
`four-floor`, `breaks`, `offbeat`, `noise`, `silence`, `tone`, `tempo-change`, `tempo-continuous`,
`phase-step` and `missing-beats`. Defaults are
120 BPM, offset 0.17 seconds and seed 1. The tempo-change fixture adds 20 BPM at absolute time
16 seconds while retaining the phase anchor; this changes phase as well as tempo. `tempo-continuous`
adds the same 20 BPM while preserving phase at the change. These two patterns accept initial
tempos up to 220 BPM. `phase-step` delays the anchor by a quarter beat at 16 seconds without
changing tempo. `missing-beats` omits every seventh kick. These fixtures deliberately include competing
subdivisions and misleading accents, not only easy regular kicks. The JSON corpus records their
authored grids explicitly.

## Reference labels and scoring

Omit `reference` for unknown ground truth. Use `reference: null` to declare that no stable grid
should be accepted, for example silence or deliberately unresolved half-time ambiguity. Supply
ordered, nonoverlapping intervals for labeled grids:

```json
"reference": [
  {"from": 600, "until": 660, "bpm": 174, "beatOffset": 600.17},
  {"from": 670, "until": 720, "bpm": 175, "beatOffset": 670.12}
]
```

All times are absolute source seconds. Intervals are half open. Uncovered intervals remain
unlabeled. This supports trustworthy annotations around steady sections without pretending a
single BPM describes an entire mixed recording. Validate labels by listening or independent
measurement before using a recording to establish accuracy.

The first ten seconds of each case are warmup. Subsequent observations measure:

- `locked / eligible`: coverage, including unlabeled observations.
- `correctLocks / labeled`: useful coverage against the supplied reference.
- `falseLocks / labeledLocked`: error fraction among labeled locks.
- Separate tempo, phase and forbidden-lock counts; a sample may have both tempo and phase errors.
- First lock time, maximum evidence, retained history and maximum errors among labeled locks.

A correct lock requires relative tempo error at most 1.5% and circular phase error at most
0.1 beat at the observation time. Correct BPM with a half-beat shift fails. There is no
half/double-time credit. These are explicit evaluation tolerances, not claims about human beat
annotation precision. Counts are half-second observations, not independent trials or exact
durations. Report confidence intervals only with a suitable independent recording corpus.

## Onset candidates

Every method sees identical stereo PCM at 16 kHz and reports 100 Hz hops. Stereo channel powers
are combined without phase cancellation. The tracker, eight-second window and acceptance rules
are shared; only onset extraction changes.

- `energy`: positive differences of `log1p(100 * RMS)` over each 10 ms hop, matching the live
  baseline's formula at the evaluation sample rate.
- `bands`: two cascaded one-pole low-pass filters at 150 Hz and 2 kHz split each channel into
  low, middle and high residuals. Average the three positive log-RMS differences.
- `bass`: use only the low band's positive log-RMS difference.
- `spectral`: a trailing 512-sample Hann window (32 ms), zero-padded into the shared 2048-point
  spectrum transform, then 48 logarithmic buckets from 40 Hz to 7 kHz. Stereo bucket powers
  become `log1p(100 * normalizedMagnitude)`. Sum positive changes against the maximum of the
  same/neighbor buckets two hops earlier, divided by the square root of the bucket count.
  Zero padding interpolates the spectrum; it does not increase the window's frequency resolution.

The filter bands overlap and are not an orthogonal decomposition. Their causal phase response
is not compensated. The spectral candidate uses the core transform's three smoothing passes and
does not compensate its causal window delay. Its scale is an explicit experiment parameter,
not an independently calibrated confidence model. `bands`, `bass` and `spectral` are evaluation
candidates, not selectable live detectors.
Native-rate live capture and resampled file evaluation can differ. The combined `analysisMs`
includes all selected methods, core tracking and observation serialization; `wallMs` also
includes decoding or synthesis and observation writes. These are throughput measurements, not
physical input latency.

## Initial findings, 2026-10-23

All three methods tracked regular 100, 120, 128 and 174 BPM synthetic pulses. Multiband averaging
reduced coverage on the four-floor fixture. None locked the authored 174 BPM break pattern.
Strong offbeat accents produced half-beat-shifted locks in energy and multiband modes despite
high evidence. Bass-only stayed uncertain on that fixture. Abrupt tempo changes retained some
stale locks while the eight-second window still contained the previous rhythm.

Six unlabeled 120-second windows of the locally available Stakka & Skynet master, starting at
0, 120, 843, 1500, 2400 and 3200 seconds with a 160–185 BPM range, produced little lock coverage
with any method. The occasional locks do not establish accuracy. These findings do not justify
replacing the live baseline with either simple filter candidate or enabling continuous retiming.
Artifacts: `examples/demo/out/beat-evaluation-synthetic-1` and `beat-evaluation-real-1`.

### Recent-evidence check

The core tracker now includes agreement of the newest 1.5 seconds of accents with the candidate
grid. This can only reduce the evidence score: tempo selection and the full-window measurements
are unchanged. In the original 120→140 BPM fixture, energy-method false-lock observations fell
from seven to one. The remaining observation is exactly at the change, before new audio arrives.
The old grid became uncertain at 16.5 seconds instead of 19.5. Correct locks on regular pulses
and the four-floor fixture were unchanged. Strong offbeat ambiguity remains unresolved.

The expanded corpus also exercises continuous-phase tempo changes, a phase-only step and missing
kicks. These still have a finite response delay; recent agreement does not promise instantaneous
change detection. The six real segments lost their few energy-method locks. Since those segments
are unlabeled, this is a coverage reduction, not demonstrated accuracy improvement. Baseline and
new reports are in `beat-evaluation-baseline`, `beat-evaluation-recent-expanded` and
`beat-evaluation-real-recent` under `examples/demo/out/`.

### Spectral candidate

The spectral candidate retained regular-pulse locks and rejected silence, constant tone and
noise. It still locked half a beat off on the strong-offbeat fixture, failed to lock the break
fixture and lost four-floor coverage. In the six real segments it produced 28 half-second locks
in the window starting at 1500 seconds and one in the window at 2400 seconds. Those segments
remain unlabeled, so this is additional coverage, not verified musical accuracy. Each 120-second
segment took about 5.4–5.8 seconds of analysis with only spectral selected while a long export
ran concurrently. This does not establish suitability for the live animation thread.

Keep the energy method in live output. Stronger spectral novelty alone does not resolve metrical
interpretation or phase ambiguity. Further work needs independently labeled music and a better
metrical model, with explicit regression checks for incorrect locks. Reports are in
`beat-evaluation-spectral-1` and `beat-evaluation-real-spectral` under `examples/demo/out/`.

Next experiments should distinguish spectral onset detection, metrical periodicity and recent
phase agreement. Spectral-flux methods compare positive spectral changes; maximum filtering can
reduce vibrato-triggered onsets, as studied by
[Böck and Widmer](https://www.dafx.de/paper-archive/2013/papers/09.dafx2013_submission_12.pdf).
That is a different extractor from these simple filter candidates. Onset strength and temporal
consistency are separate constraints in
[Ellis's beat-tracking work](https://www.ee.columbia.edu/~dpwe/pubs/Ellis07-beattrack.pdf).
Neither paper makes a stereo master an unambiguous source of musical beat phase.

## Verification

Unit checks validate configuration, partial stereo decoding, antiphase-safe energy, label
semantics, phase scoring and a complete synthetic run. Add a labeled counterexample when fixing
a detector failure. Keep reports of failed candidates: increased lock coverage alone can hide
more incorrect locks. Live browser adoption/journal checks remain separate in
`packages/renderer-browser/bench/beats.ts`.
