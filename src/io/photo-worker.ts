/// <reference lib="webworker" />
self.onmessage = async (event: MessageEvent<{ id: number; file: File }>) => {
  const { id, file } = event.data;
  try {
    if (file.size > 100_000_000) throw new Error('Photo exceeds 100 MB.');
    const buffer = await file.arrayBuffer();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))).map(n => n.toString(16).padStart(2, '0')).join('');
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = bitmap, scale = Math.min(1, 1400 / Math.max(width, height));
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    const preview = await canvas.convertToBlob({ type: 'image/webp', quality: .85 });
    self.postMessage({ id, hash, width, height, preview });
  } catch (error) { self.postMessage({ id, error: error instanceof Error ? error.message : 'Unable to read photo.' }); }
};
