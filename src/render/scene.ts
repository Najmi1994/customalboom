import Konva from 'konva';
import { FRAME_BORDER_THICKNESS, FrameElement, Page, Point, TextElement, pageWidth } from '../domain/model';
import type { PhotoLibrary } from '../io/photos';
import { isNeutral } from '../domain/photoAdjustments';
import { previewPhoto, processPhoto, bitmapCanvas } from './adjustedPhotos';
import { frameLocalPaths } from '../domain/union';
export function tracePolygon(ctx: CanvasRenderingContext2D, points: Point[]) { ctx.beginPath(); if (points.length) { ctx.moveTo(points[0].x, points[0].y); points.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath(); } }
export function tracePaths(ctx: CanvasRenderingContext2D, paths: Point[][]) { ctx.beginPath(); paths.forEach(points => { if (!points.length) return; ctx.moveTo(points[0].x, points[0].y); points.slice(1).forEach(point => ctx.lineTo(point.x, point.y)); ctx.closePath(); }); }
function traceBase(ctx: CanvasRenderingContext2D, frame: FrameElement) { const base = frame.geometry.base; ctx.beginPath(); if (base.kind === 'ellipse') ctx.ellipse(base.x + base.width / 2, base.y + base.height / 2, base.width / 2, base.height / 2, 0, 0, Math.PI * 2); else ctx.rect(base.x, base.y, base.width, base.height); }
function offsetPath(points: Point[], distance: number): Point[] {
  if (distance <= 0 || points.length < 3) return points;
  const area = points.reduce((sum, point, index) => { const next = points[(index + 1) % points.length]; return sum + point.x * next.y - next.x * point.y; }, 0) / 2, orientation = area >= 0 ? 1 : -1;
  const normal = (start: Point, end: Point) => { const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy) || 1; return orientation > 0 ? { x: dy / length, y: -dx / length } : { x: -dy / length, y: dx / length }; };
  return points.map((point, index) => {
    const previous = points[(index + points.length - 1) % points.length], next = points[(index + 1) % points.length], before = normal(previous, point), after = normal(point, next), first = { x: point.x + before.x * distance, y: point.y + before.y * distance }, second = { x: point.x + after.x * distance, y: point.y + after.y * distance }, a = { x: point.x - previous.x, y: point.y - previous.y }, b = { x: next.x - point.x, y: next.y - point.y }, denominator = a.x * b.y - a.y * b.x;
    if (Math.abs(denominator) > 1e-6) { const delta = { x: second.x - first.x, y: second.y - first.y }, t = (delta.x * b.y - delta.y * b.x) / denominator, candidate = { x: first.x + a.x * t, y: first.y + a.y * t }; if (Math.hypot(candidate.x - point.x, candidate.y - point.y) <= Math.max(distance * 8, 1)) return candidate; }
    const x = before.x + after.x, y = before.y + after.y, length = Math.hypot(x, y) || 1; return { x: point.x + x / length * distance, y: point.y + y / length * distance };
  });
}
function strokeFrameBoundary(ctx: CanvasRenderingContext2D, frame: FrameElement, color: string, margin: number, thickness: number) {
  if (thickness <= 0) return;
  const distance = margin + thickness / 2, paths = frameLocalPaths(frame).map(path => offsetPath(path, distance));
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = thickness; ctx.lineJoin = frame.geometry.base.kind === 'rect' && !frame.geometry.paths ? 'miter' : 'round'; ctx.lineCap = 'round';
  tracePaths(ctx, paths); ctx.stroke();
  ctx.restore();
}
export function clipFrame(ctx: CanvasRenderingContext2D, f: FrameElement) {
  if (f.geometry.paths?.length) { tracePaths(ctx, f.geometry.paths); ctx.clip(); return; }
  const b = f.geometry.base; ctx.beginPath();
  if (b.kind === 'ellipse') ctx.ellipse(b.x + b.width / 2, b.y + b.height / 2, b.width / 2, b.height / 2, 0, 0, Math.PI * 2);
  else ctx.rect(b.x, b.y, b.width, b.height);
  ctx.clip(); tracePolygon(ctx, f.geometry.clip); ctx.clip();
}
export function drawFrame(ctx: CanvasRenderingContext2D, f: FrameElement, image?: CanvasImageSource, edit = false) {
  ctx.save();
  if (f.flipX || f.flipY) { ctx.translate(f.flipX ? f.width : 0, f.flipY ? f.height : 0); ctx.scale(f.flipX ? -1 : 1, f.flipY ? -1 : 1); }
  if (f.borderEnabled) strokeFrameBoundary(ctx, f, f.borderColor ?? '#000000', f.borderMargin ?? 0, f.borderThickness ?? FRAME_BORDER_THICKNESS);
  clipFrame(ctx, f); ctx.fillStyle = f.fill; ctx.fillRect(0, 0, f.width, f.height);
  if (f.photo && image) ctx.drawImage(image, f.photo.x, f.photo.y, f.photo.width, f.photo.height);
  else if (edit) { ctx.fillStyle = f.photo ? '#bc6e4c' : '#a4aaa3'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${Math.min(f.width / 14, f.height / 8, 18)}px Inter`; ctx.fillText(f.photo ? 'Relink photo' : 'Drop a photo', f.width / 2, f.height / 2); }
  ctx.restore();
}
export function textConfig(e: TextElement) { return { text: e.text, width: e.width, height: e.height, fontFamily: e.font, fontSize: e.fontSize, fontStyle: `${e.italic ? 'italic ' : ''}${e.bold ? 'bold' : 'normal'}`, fill: e.color, align: e.align, lineHeight: e.lineHeight, wrap: 'word' }; }
export function textClip(e: TextElement) { return (ctx: Konva.Context) => { const native = ctx._context; tracePolygon(native, e.clip ?? [{ x: 0, y: 0 }, { x: e.width, y: 0 }, { x: e.width, y: e.height }, { x: 0, y: e.height }]); }; }
export async function renderPage(page: Page, library: PhotoLibrary, ratio: number, original = false): Promise<HTMLCanvasElement> {
  await Promise.all(page.elements.filter((e): e is TextElement => e.type === 'text').map(e => document.fonts.load(`${e.italic ? 'italic ' : ''}${e.bold ? '700' : '400'} ${e.fontSize}px "${e.font}"`)));
  await document.fonts.ready;
  const width = Math.round(pageWidth(page) * ratio), height = Math.round(page.height * ratio);
  if (!width || !height || width > 16384 || height > 16384 || width * height > 64_000_000) throw new Error('This page exceeds the browser export limit (16,384 px per side / 64 megapixels). Choose a smaller page or 150 DPI.');
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!; ctx.scale(ratio, ratio); ctx.fillStyle = page.background; ctx.fillRect(0, 0, pageWidth(page), page.height);
  async function withPhoto(p: FrameElement['photo'], draw: (image?: CanvasImageSource) => void) {
    const asset = p && library.get(p.assetId);
    if (!p || !asset) { if (p && original) throw new Error('Relink all missing photos before exporting.'); draw(); return; }
    if (!original) { draw(await previewPhoto(asset, p.adjustments)); return; }
    const source = await createImageBitmap(asset.file, { imageOrientation: 'from-image' });
    let adjusted: ImageBitmap | undefined;
    let tonedCanvas: HTMLCanvasElement | undefined;
    try {
      if (!isNeutral(p.adjustments)) { adjusted = await processPhoto(source, p.adjustments!); tonedCanvas = bitmapCanvas(adjusted); }
      draw(tonedCanvas ?? source);
    } finally { if (tonedCanvas) tonedCanvas.width = tonedCanvas.height = 1; adjusted?.close(); source.close(); }
  }
  try {
    if (page.backgroundPhoto) {
      const p = page.backgroundPhoto, c = page.backgroundClip ?? { x: 0, y: 0, width: pageWidth(page), height: page.height };
      await withPhoto(p, image => { if (!image) return; ctx.save(); ctx.beginPath(); ctx.rect(c.x, c.y, c.width, c.height); ctx.clip(); ctx.drawImage(image, p.x, p.y, p.width, p.height); ctx.restore(); });
    }
    // Composite in layer order and release each original before decoding the next.
    for (const e of page.elements) {
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.rotation * Math.PI / 180);
      try {
        if (e.type === 'frame') await withPhoto(e.photo, image => drawFrame(ctx, e, image));
        else {
          const group = new Konva.Group(), content = new Konva.Group({ x: e.flipX ? e.width : 0, y: e.flipY ? e.height : 0, scaleX: e.flipX ? -1 : 1, scaleY: e.flipY ? -1 : 1, clipFunc: textClip(e) });
          content.add(new Konva.Text(textConfig(e))); group.add(content);
          try { const text = group.toCanvas({ x: 0, y: 0, width: e.width, height: e.height, pixelRatio: ratio }); ctx.drawImage(text, 0, 0, e.width, e.height); text.width = text.height = 1; }
          finally { group.destroy(); }
        }
      } finally { ctx.restore(); }
    }
    return canvas;
  } catch (error) { canvas.width = canvas.height = 1; throw error; }
}
export async function thumbnail(page: Page, library: PhotoLibrary, max = 300) { const canvas = await renderPage(page, library, Math.min(max / pageWidth(page), max / page.height)); const url = canvas.toDataURL('image/png'); canvas.width = canvas.height = 1; return url; }
export function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> { return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('The browser could not encode this image.')), type, quality)); }
