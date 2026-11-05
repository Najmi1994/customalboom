import type { PhotoAdjustments } from '../domain/model';
import { adjustmentKey, isNeutral } from '../domain/photoAdjustments';
import type { LocalPhoto } from '../io/photos';

let worker: Worker | undefined, nextId = 0;
const pending = new Map<number, { resolve: (image: ImageBitmap) => void; reject: (e: Error) => void }>();
export async function processPhoto(source: HTMLImageElement | ImageBitmap, settings: PhotoAdjustments): Promise<ImageBitmap> {
  const image = await createImageBitmap(source);
  if (!worker) {
    worker = new Worker(new URL('./adjustment-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => { const job = pending.get(data.id); if (!job) { data.image?.close(); return; } pending.delete(data.id); if (data.error) job.reject(new Error(data.error)); else job.resolve(data.image); };
    worker.onerror = () => { pending.forEach(job => job.reject(new Error('Photo adjustment failed. Please try again.'))); pending.clear(); worker?.terminate(); worker = undefined; };
  }
  const id = nextId++;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); worker!.postMessage({ id, image, settings }, [image]); });
}

// Cached canvases remain usable by mounted scenes even after eviction. A bounded
// strong cache avoids retaining every slider position for the whole session.
const cache = new Map<string, { source: HTMLImageElement; result: Promise<HTMLCanvasElement> }>();
export function bitmapCanvas(bitmap: ImageBitmap): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0); return canvas;
}
export function previewPhoto(photo: LocalPhoto, settings?: PhotoAdjustments): Promise<HTMLImageElement | HTMLCanvasElement> {
  if (isNeutral(settings)) return Promise.resolve(photo.image);
  const key = photo.ref.id + ':' + adjustmentKey(settings), hit = cache.get(key);
  if (hit?.source === photo.image) { cache.delete(key); cache.set(key, hit); return hit.result; }
  const result = processPhoto(photo.image, settings!).then(bitmap => {
    try { return bitmapCanvas(bitmap); }
    finally { bitmap.close(); }
  });
  const entry = { source: photo.image, result }; cache.set(key, entry);
  result.catch(() => { if (cache.get(key) === entry) cache.delete(key); });
  while (cache.size > 12) cache.delete(cache.keys().next().value!);
  return result;
}
