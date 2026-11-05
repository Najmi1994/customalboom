import { PhotoAssetRef } from '../domain/model';
export type LocalPhoto = { ref: PhotoAssetRef; file: File; previewUrl: string; image: HTMLImageElement };
export type PhotoLibrary = Map<string, LocalPhoto>;
export function loadImage(url: string): Promise<HTMLImageElement> { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Unable to decode image.')); image.src = url; }); }
export class PhotoReader {
  private worker: Worker;
  private next = 0;
  private pending = new Map<number, { resolve: (v: { hash: string; width: number; height: number; preview: Blob }) => void; reject: (e: Error) => void }>();
  constructor() {
    this.worker = new Worker(new URL('./photo-worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }) => { const p = this.pending.get(data.id); if (!p) return; this.pending.delete(data.id); if (data.error) p.reject(new Error(data.error)); else p.resolve(data); };
    this.worker.onerror = () => { for (const p of this.pending.values()) p.reject(new Error('Photo processing stopped. Please reopen the folder.')); this.pending.clear(); };
  }
  async read(file: File, relativePath: string): Promise<LocalPhoto> {
    const id = this.next++;
    const processed = await new Promise<{ hash: string; width: number; height: number; preview: Blob }>((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.worker.postMessage({ id, file }); });
    const previewUrl = URL.createObjectURL(processed.preview);
    try { const image = await loadImage(previewUrl); return { ref: { id: processed.hash, name: file.name, relativePath, width: processed.width, height: processed.height, size: file.size, lastModified: file.lastModified }, file, previewUrl, image }; }
    catch (error) { URL.revokeObjectURL(previewUrl); throw error; }
  }
  dispose() { this.worker.terminate(); for (const p of this.pending.values()) p.reject(new Error('Cancelled')); this.pending.clear(); }
}
