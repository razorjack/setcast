# Remotion 4.0.539 Linux encoder-failure cleanup

Injected encoder failure leaves a named POSIX shared-memory pool after Node and its browser exit. This is a failure of the current-upstream reference qualification, independently of successful export fidelity or throughput.

The comparison checkout is `/tmp/setcast-linux-current-upstream`, branch `renderer/linux-current-upstream`, commit `2a7381a448326aa8e2003b1838a88a6e319ef70a`. It uses the final Setcast bitmap/readiness implementation, Remotion 4.0.539 and its Chromium 157.0.8080.0 on Fedora x64. Node uses its normal rejection policy.

Run from that checkout, with a new output directory:

```sh
node packages/renderer-remotion/bench/encoder-failure.ts --out NEW_DIRECTORY
```

The harness injects an invalid FFmpeg option into the second encoding call of a three-chunk render. It catches the error, preserves the previous destination and removes Setcast temporary directories. Those assertions pass. A separate observer polls `/dev/shm/rmshm-*` every 100 ms, records pool names/inodes/sizes and output-line boundaries, and fails if a new named pool remains after process exit. The observer source is retained as `shm-observe.py.txt`; exact invocation and exit status are in `upstream-shm-observed-failure.*.txt`.

The first run leaves `rmshm-11411021668764671149` (inode 4965). The observed repeat leaves `rmshm-13983776585987463118` (inode 5148). Each is 8,294,464 bytes. The latter appears during the failing chunk and remains after child exit. The observed acceptance suite creates 31 new pools and removes them, including its normal completion and cancellation paths. Its 32 observed entries include the pre-existing first failure pool. No pool, including unrelated host resources, was deleted.

Inspection of the installed library suggests an asynchronous teardown race:

- `dist/render-media.js` rejects the public `happyPath` promise in its catch before its asynchronous `finally` awaits `remotionSharedMemory.dispose()`.
- `dist/render-frames.js` starts closing its pages from an unawaited `finally`.
- `dist/remotion-shared-memory.js` retires a pool, waits for owned slots, then sends `Page.remotionDestroyFramePool` through that page.
- Setcast awaits `renderMedia`, aborts and settles its own sibling tasks, then closes the render session. The public library promise does not provide a way to await its private disposal task.

This explains a plausible race between pool destruction and page/browser closure; it is source inspection, not a separately instrumented proof of which close won. A safe upstream repair must finish pool disposal before pages close and before public completion/rejection. A sleep or global unlink of newly observed pool names is not an ownership-safe production repair. Disabling shared memory or forcing file-backed capture would change the reference path and would require separate quality/performance qualification.

The published dependency is therefore retained unchanged for successful-export measurements. Those measurements can describe normal export behavior but do not qualify current-upstream failure cleanup. No upstream report has been posted and no release requirement has been waived.
