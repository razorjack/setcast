import { useEffect, useState } from 'react';
import { errorMessage } from '@setcast/core';
import { pixelDifference } from './pixel-difference.ts';

export function ReferenceMetrics({
  captured,
  reference,
  width,
  height,
}: {
  captured: string;
  reference: string;
  width: number;
  height: number;
}) {
  const { result, error } = useReferenceMetrics(captured, reference, width, height);
  return (
    <div className="sp-reference-metrics">
      <h3>Export PNG vs local reference</h3>
      <p>
        8-bit sRGB canvas RGBA differences in this browser. These values do not measure interactive
        preview pixels or perceptual video quality.
      </p>
      {error && <p role="alert">{error}</p>}
      {result && (
        <dl>
          <dt>Changed pixels</dt>
          <dd data-changed-pixels={result.changed}>
            {result.changed.toLocaleString()} / {result.pixels.toLocaleString()} (
            {((100 * result.changed) / result.pixels).toFixed(4)}%)
          </dd>
          <dt>Mean absolute channel difference</dt>
          <dd>{result.mean.toFixed(4)} / 255</dd>
          <dt>RMS channel difference</dt>
          <dd>{result.rmse.toFixed(4)} / 255</dd>
          <dt>Maximum channel difference</dt>
          <dd>{result.maximum} / 255</dd>
        </dl>
      )}
    </div>
  );
}

async function pixels(url: string, width: number, height: number) {
  if (width * height > 33_177_600)
    throw new Error('Numeric reference comparison supports up to 8K images.');
  const image = new Image();
  image.src = url;
  await image.decode();
  if (image.naturalWidth !== width || image.naturalHeight !== height)
    throw new Error(
      'Reference dimensions changed. Choose a matching reference and capture the frame again.',
    );
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
    if (!context) throw new Error('This browser cannot read reference image pixels.');
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, width, height).data;
  } finally {
    canvas.width = canvas.height = 0;
  }
}

function useReferenceMetrics(captured: string, reference: string, width: number, height: number) {
  const [result, setResult] = useState<ReturnType<typeof pixelDifference> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setError(null);
    void Promise.all([pixels(captured, width, height), pixels(reference, width, height)])
      .then(([first, second]) => {
        if (!cancelled) setResult(pixelDifference(first, second));
      })
      .catch((cause) => {
        if (!cancelled) setError(errorMessage(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [captured, reference, width, height]);
  return { result, error };
}
