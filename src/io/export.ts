import { PDFDocument } from 'pdf-lib';
import { zipSync } from 'fflate';
import { AlbumProject, Page, pageWidth } from '../domain/model';
import { PhotoLibrary } from './photos';
import { canvasBlob, renderPage } from '../render/scene';
import { download, safeName } from './storage';
export function jpegDpi(bytes: Uint8Array, dpi: number) {
  // Replace the JFIF density in a freshly encoded JPEG; insert APP0 when absent.
  for (let at = 2; at + 17 < bytes.length && bytes[at] === 0xff;) {
    const marker = bytes[at + 1]; if (marker === 0xda || marker === 0xd9) break;
    const length = (bytes[at + 2] << 8) | bytes[at + 3]; if (length < 2) break;
    if (marker === 0xe0 && String.fromCharCode(...bytes.slice(at + 4, at + 9)) === 'JFIF\0') { bytes[at + 11] = 1; bytes[at + 12] = dpi >> 8; bytes[at + 13] = dpi & 255; bytes[at + 14] = dpi >> 8; bytes[at + 15] = dpi & 255; return bytes; }
    at += length + 2;
  }
  const app = new Uint8Array([255,224,0,16,74,70,73,70,0,1,1,1,dpi >> 8,dpi & 255,dpi >> 8,dpi & 255,0,0]);
  const out = new Uint8Array(bytes.length + app.length); out.set(bytes.slice(0, 2)); out.set(app, 2); out.set(bytes.slice(2), 2 + app.length); return out;
}
export type ExportKind = 'jpg' | 'zip' | 'pdf';
export async function exportAlbum(project: AlbumProject, activePage: Page, library: PhotoLibrary, kind: ExportKind, signal: AbortSignal, progress: (n: number, total: number) => void) {
  const pages = kind === 'jpg' ? [activePage] : project.pages;
  for (const p of pages) for (const key of [p.backgroundPhoto?.assetId, ...p.elements.map(e => e.type === 'frame' ? e.photo?.assetId : undefined)]) if (key && !library.has(key)) throw new Error('Some photos are missing. Reopen their folder before exporting.');
  const files: Record<string, Uint8Array> = {}, pdf = kind === 'pdf' ? await PDFDocument.create() : undefined;
  let totalBytes = 0;
  for (let i = 0; i < pages.length; i++) {
    signal.throwIfAborted(); progress(i, pages.length);
    const p = pages[i], canvas = await renderPage(p, library, p.dpi / 72, true);
    let bytes: Uint8Array;
    try { bytes = jpegDpi(new Uint8Array(await (await canvasBlob(canvas, 'image/jpeg', .95)).arrayBuffer()), p.dpi); } finally { canvas.width = canvas.height = 1; }
    signal.throwIfAborted(); totalBytes += bytes.length;
    if (totalBytes > 350_000_000) throw new Error('This batch is too large for one browser download. Export smaller groups or individual pages.');
    const index = project.pages.findIndex(page => page.id === p.id) + 1;
    if (pdf) { const image = await pdf.embedJpg(bytes); pdf.addPage([pageWidth(p), p.height]).drawImage(image, { x: 0, y: 0, width: pageWidth(p), height: p.height }); }
    else files[`${safeName(project.name)}-${String(index).padStart(3, '0')}.jpg`] = bytes;
    progress(i + 1, pages.length); await new Promise(resolve => setTimeout(resolve, 0));
  }
  signal.throwIfAborted();
  if (pdf) { pdf.setTitle(project.name); pdf.setCreator('CustomAlboom.com'); download(new Blob([await pdf.save() as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), `${safeName(project.name)}.pdf`); }
  else if (kind === 'zip') download(new Blob([zipSync(files, { level: 0 }) as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), `${safeName(project.name)}.zip`);
  else download(new Blob([Object.values(files)[0] as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }), Object.keys(files)[0]);
}
