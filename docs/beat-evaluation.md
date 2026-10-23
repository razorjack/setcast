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
  "methods": ["energy", "bands", "bass"],
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
omitting it runs all three methods.

For synthetic input, replace `source` with
`{"pattern":"four-floor","bpm":128,"offset":0.17,"seed":1}`. Available patterns are `pulse`,
`four-floor`, `breaks`, `offbeat`, `noise`, `silence`, `tone` and `tempo-change`. Defaults are
120 BPM, offset 0.17 seconds and seed 1. The tempo-change fixture adds 20 BPM at absolute time
16 seconds while retaining the phase anchor. These fixtures deliberately include competing
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

The filter bands overlap and are not an orthogonal decomposition. Their causal phase response
is not compensated. `bands` and `bass` are evaluation candidates, not selectable live detectors.
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
