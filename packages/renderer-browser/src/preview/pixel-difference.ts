export function pixelDifference(first: Uint8ClampedArray, second: Uint8ClampedArray) {
  if (first.length !== second.length || first.length === 0 || first.length % 4)
    throw new Error('Pixel comparisons require equally sized, nonempty RGBA images.');
  let changed = 0,
    sum = 0,
    squares = 0,
    maximum = 0;
  for (let pixel = 0; pixel < first.length; pixel += 4) {
    let different = false;
    for (let channel = 0; channel < 4; channel++) {
      const delta = Math.abs(first[pixel + channel]! - second[pixel + channel]!);
      different ||= delta !== 0;
      sum += delta;
      squares += delta * delta;
      maximum = Math.max(maximum, delta);
    }
    if (different) changed++;
  }
  return {
    pixels: first.length / 4,
    changed,
    maximum,
    mean: sum / first.length,
    rmse: Math.sqrt(squares / first.length),
  };
}
