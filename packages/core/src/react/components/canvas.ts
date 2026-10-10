import { enlargement, type Size } from '../../background.ts';

export async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode().catch((cause: unknown) => {
    throw new Error(`Failed to load ${url}`, { cause });
  });
  return image;
}

/** Draws the art centered on the whole canvas, scaled to `fit` it and then by `zoom`. */
export function drawFitted(
  context: OffscreenCanvasRenderingContext2D,
  art: HTMLImageElement | OffscreenCanvas,
  fit: 'cover' | 'contain',
  zoom: number,
): void {
  const frame = { width: context.canvas.width, height: context.canvas.height };
  const size = sizeOf(art);
  const scale = enlargement(size, frame, fit) * zoom;
  const width = size.width * scale;
  const height = size.height * scale;
  context.drawImage(art, (frame.width - width) / 2, (frame.height - height) / 2, width, height);
}

export const sizeOf = (art: HTMLImageElement | OffscreenCanvas): Size =>
  art instanceof HTMLImageElement
    ? { width: art.naturalWidth, height: art.naturalHeight }
    : { width: art.width, height: art.height };

/** A CPU-backed context, so the composed and measured pixels are the same in every render. */
export function context2d(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Background needs a 2D canvas context; none is available.');
  return context;
}
