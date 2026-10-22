import { useEffect, useRef, useState } from 'react';

interface ReferenceImage {
  url: string;
  name: string;
  width: number;
  height: number;
}
export function useReference() {
  const [image, setImage] = useState<ReferenceImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'overlay' | 'difference'>('overlay');
  const [opacity, setOpacity] = useState(0.5);
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  useEffect(
    () => () => {
      if (image) URL.revokeObjectURL(image.url);
    },
    [image],
  );
  const clear = () => {
    request.current++;
    setImage(null);
    setError(null);
  };
  const load = async (file: File, width: number, height: number) => {
    const id = ++request.current;
    let url: string | null = null;
    try {
      url = await decodeReference(file, width, height);
      if (id !== request.current) return;
      setImage({ url, name: file.name, width, height });
      setError(null);
      url = null;
    } catch (error) {
      if (id === request.current) setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  };
  return { image, error, mode, setMode, opacity, setOpacity, load, clear };
}
export type Reference = ReturnType<typeof useReference>;

export function ReferenceControls({
  reference,
  width,
  height,
}: {
  reference: Reference;
  width: number;
  height: number;
}) {
  const compatible =
    !reference.image || (reference.image.width === width && reference.image.height === height);
  return (
    <section className="sp-reference">
      <h2>Reference image</h2>
      <label className="sp-file">
        Choose reference
        <input
          type="file"
          aria-label="Reference image"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void reference.load(file, width, height);
            event.target.value = '';
          }}
        />
      </label>
      <p>
        Local image, {width} × {height}. No upload.
      </p>
      {reference.error && <p role="alert">{reference.error}</p>}
      {!compatible && (
        <p role="alert">
          Reference dimensions no longer match this composition. Choose a new image.
        </p>
      )}
      {reference.image && <ReferenceComparison reference={reference} />}
    </section>
  );
}

function ReferenceComparison({ reference }: { reference: Reference }) {
  return (
    <>
      <p className="sp-filename">{reference.image?.name}</p>
      <label>
        Comparison
        <select
          aria-label="Comparison mode"
          value={reference.mode}
          onChange={(event) => reference.setMode(event.target.value as 'overlay' | 'difference')}
        >
          <option value="overlay">Overlay</option>
          <option value="difference">Difference</option>
        </select>
      </label>
      {reference.mode === 'overlay' && (
        <label>
          Reference opacity
          <input
            aria-label="Reference opacity"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={reference.opacity}
            onChange={(event) => reference.setOpacity(event.target.valueAsNumber)}
          />
        </label>
      )}
      <button onClick={reference.clear}>Remove reference</button>
    </>
  );
}

async function decodeReference(file: File, width: number, height: number) {
  let url: string | null = null;
  try {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 32 * 1024 * 1024)
      throw new Error(
        `Reference "${file.name}" must be a PNG, JPEG or WebP no larger than 32 MiB.`,
      );
    url = URL.createObjectURL(file);
    const decoded = new Image();
    decoded.src = url;
    await decoded.decode();
    if (decoded.naturalWidth !== width || decoded.naturalHeight !== height)
      throw new Error(
        `Reference is ${decoded.naturalWidth}×${decoded.naturalHeight}; choose a ${width}×${height} image.`,
      );
    return url;
  } catch (error) {
    if (url) URL.revokeObjectURL(url);
    throw error;
  }
}
