/// <reference lib="webworker" />
import { adjustPixels } from '../domain/photoAdjustments';
import type { PhotoAdjustments } from '../domain/model';

self.onmessage = ({ data }: MessageEvent<{ id: number; image: ImageBitmap; settings: PhotoAdjustments }>) => {
  const { id, image, settings } = data;
  try {
    const canvas = new OffscreenCanvas(image.width, image.height), ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(image, 0, 0); image.close();
    // Bound the temporary pixel buffer even for original-resolution exports.
    const rows = Math.max(1, Math.floor(1_000_000 / canvas.width));
    for (let y = 0; y < canvas.height; y += rows) {
      const pixels = ctx.getImageData(0, y, canvas.width, Math.min(rows, canvas.height - y));
      adjustPixels(pixels.data, settings); ctx.putImageData(pixels, 0, y);
    }
    const result = canvas.transferToImageBitmap();
    self.postMessage({ id, image: result }, { transfer: [result] });
  } catch (error) { image.close(); self.postMessage({ id, error: error instanceof Error ? error.message : 'Unable to adjust photo.' }); }
};
