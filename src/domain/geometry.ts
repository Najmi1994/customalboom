import { AlbumElement, FrameElement, Geometry, Page, Point, PhotoPlacement, pageWidth } from './model';
export const EPS = 0.0001;
export function lockAxis(start: Point, point: Point): Point { return Math.abs(point.x - start.x) >= Math.abs(point.y - start.y) ? { x: point.x, y: start.y } : { x: start.x, y: point.y }; }
export function rotate(p: Point, degrees: number): Point { const r = degrees * Math.PI / 180; return { x: p.x * Math.cos(r) - p.y * Math.sin(r), y: p.x * Math.sin(r) + p.y * Math.cos(r) }; }
export function localToPage(p: Point, e: AlbumElement): Point { const q = rotate(p, e.rotation); return { x: e.x + q.x, y: e.y + q.y }; }
export function pageToLocal(p: Point, e: AlbumElement): Point { return rotate({ x: p.x - e.x, y: p.y - e.y }, -e.rotation); }
export function halfCutLine(frame: FrameElement, drag: 'horizontal' | 'vertical'): [Point, Point] {
  return drag === 'horizontal'
    ? [localToPage({ x: -frame.width, y: frame.height / 2 }, frame), localToPage({ x: frame.width * 2, y: frame.height / 2 }, frame)]
    : [localToPage({ x: frame.width / 2, y: -frame.height }, frame), localToPage({ x: frame.width / 2, y: frame.height * 2 }, frame)];
}
export function corners(e: AlbumElement) { return [{ x: 0, y: 0 }, { x: e.width, y: 0 }, { x: e.width, y: e.height }, { x: 0, y: e.height }].map(p => localToPage(p, e)); }
export function bounds(e: AlbumElement) {
  if (e.type === 'frame') { const b = geometryBounds(e.geometry, e.rotation); if (b) return { x: e.x + b.x, y: e.y + b.y, right: e.x + b.x + b.width, bottom: e.y + b.y + b.height }; }
  const points = e.type === 'text' && e.clip ? e.clip.map(p => localToPage(p, e)) : corners(e);
  return { x: Math.min(...points.map(p => p.x)), y: Math.min(...points.map(p => p.y)), right: Math.max(...points.map(p => p.x)), bottom: Math.max(...points.map(p => p.y)) };
}
export function flipSpreadSide(page: Page): AlbumElement[] {
  if (page.mode !== 'spread') return page.elements;
  const width = pageWidth(page);
  return page.elements.map(element => {
    const box = bounds(element);
    return { ...element, x: element.x + width - box.x - box.right };
  });
}
export type SafeRegion = { x: number; y: number; right: number; bottom: number };
export function boxFromPoints(a: Point, b: Point): SafeRegion { return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) }; }
export function boxesIntersect(a: SafeRegion, b: SafeRegion) { return a.x <= b.right + EPS && a.right >= b.x - EPS && a.y <= b.bottom + EPS && a.bottom >= b.y - EPS; }
export function pageSideRegions(page: Page): SafeRegion[] {
  const outer = page.padding, bottom = page.height - outer;
  if (page.mode !== 'spread') return [{ x: outer, y: outer, right: pageWidth(page) - outer, bottom }];
  const centerInset = page.centerPaddingMode === 'equal' ? outer / 2 : page.centerPaddingMode === 'per-side' ? outer : 0;
  return [
    { x: outer, y: outer, right: page.baseWidth - centerInset, bottom },
    { x: page.baseWidth + centerInset, y: outer, right: pageWidth(page) - outer, bottom },
  ];
}
export function safeRegions(page: Page): SafeRegion[] {
  if (page.mode === 'spread' && page.centerPaddingMode !== 'none') return pageSideRegions(page);
  return [{ x: page.padding, y: page.padding, right: pageWidth(page) - page.padding, bottom: page.height - page.padding }];
}
export function dominantRegionForBox(b: SafeRegion, regions: SafeRegion[], fold: number) {
  if (regions.length === 1) return regions[0];
  const overlap = (r: SafeRegion) => Math.max(0, Math.min(b.right, r.right) - Math.max(b.x, r.x)) * Math.max(0, Math.min(b.bottom, r.bottom) - Math.max(b.y, r.y));
  const left = overlap(regions[0]), right = overlap(regions[regions.length - 1]);
  if (left === right) return (b.x + b.right) / 2 <= fold ? regions[0] : regions[regions.length - 1];
  return left > right ? regions[0] : regions[regions.length - 1];
}
export function dominantRegion(element: AlbumElement, regions: SafeRegion[], fold: number) { return dominantRegionForBox(bounds(element), regions, fold); }
function boxInsideRegion(b: ReturnType<typeof bounds>, region: SafeRegion) { return b.x >= region.x - EPS && b.y >= region.y - EPS && b.right <= region.right + EPS && b.bottom <= region.bottom + EPS; }
export function insidePage(e: AlbumElement, page: Page) {
  // Text clipped by a spread conversion may retain its original text box.
  const b = bounds(e);
  return safeRegions(page).some(region => boxInsideRegion(b, region));
}
export function validGeometry(g: Geometry, width: number, height: number) {
  const b = geometryBounds(g);
  if (!b || b.x < -EPS || b.y < -EPS || b.x + b.width > width + EPS || b.y + b.height > height + EPS) return false;
  if (g.paths?.length) return g.paths.every(path => path.length >= 3 && polygonArea(path) > EPS && path.every(point => point.x >= -EPS && point.y >= -EPS && point.x <= width + EPS && point.y <= height + EPS));
  let sign = 0;
  for (let i = 0; i < g.clip.length; i++) {
    const a = g.clip[i], b = g.clip[(i + 1) % g.clip.length], c = g.clip[(i + 2) % g.clip.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) > EPS) { if (sign && sign !== Math.sign(cross)) return false; sign = Math.sign(cross); }
  }
  return sign !== 0;
}
export function validPage(p: Page) { const regions = safeRegions(p); return regions.every(r => r.right - r.x > EPS && r.bottom - r.y > EPS) && p.elements.every(e => insidePage(e, p) && (e.type !== 'frame' || validGeometry(e.geometry, e.width, e.height))); }
export function clampMove(e: AlbumElement, p: Page): AlbumElement {
  const b = bounds(e), candidates = safeRegions(p).map(region => {
    const dx = Math.max(region.x - b.x, Math.min(0, region.right - b.right)), dy = Math.max(region.y - b.y, Math.min(0, region.bottom - b.bottom));
    return { element: { ...e, x: e.x + dx, y: e.y + dy }, distance: dx * dx + dy * dy, region };
  }).filter(candidate => boxInsideRegion(bounds(candidate.element), candidate.region));
  return candidates.sort((a, b) => a.distance - b.distance)[0]?.element ?? e;
}
export function clampGroupMove(elements: AlbumElement[], page: Page, dx: number, dy: number) {
  const candidate = (t: number) => elements.map(element => ({ ...element, x: element.x + dx * t, y: element.y + dy * t }));
  const proposed = candidate(1);
  if (proposed.every(element => insidePage(element, page))) return proposed;
  let low = 0, high = 1;
  for (let i = 0; i < 32; i++) { const mid = (low + high) / 2; if (candidate(mid).every(element => insidePage(element, page))) low = mid; else high = mid; }
  return candidate(low);
}
export function clampGroupTransit(elements: AlbumElement[], page: Page, dx: number, dy: number) {
  const moved = elements.map(element => ({ ...element, x: element.x + dx, y: element.y + dy })), b = unionElementBounds(moved), region = { x: page.padding, y: page.padding, right: pageWidth(page) - page.padding, bottom: page.height - page.padding };
  const adjustX = Math.max(region.x - b.x, Math.min(0, region.right - b.right)), adjustY = Math.max(region.y - b.y, Math.min(0, region.bottom - b.bottom));
  return moved.map(element => ({ ...element, x: element.x + adjustX, y: element.y + adjustY }));
}
export function settleGroupMove(elements: AlbumElement[], page: Page) {
  if (elements.every(element => insidePage(element, page))) return elements;
  const b = unionElementBounds(elements), candidates = safeRegions(page).map(region => {
    if (b.right - b.x > region.right - region.x + EPS || b.bottom - b.y > region.bottom - region.y + EPS) return null;
    const dx = Math.max(region.x - b.x, Math.min(0, region.right - b.right)), dy = Math.max(region.y - b.y, Math.min(0, region.bottom - b.bottom)), moved = elements.map(element => ({ ...element, x: element.x + dx, y: element.y + dy }));
    return moved.every(element => insidePage(element, page)) ? { moved, distance: dx * dx + dy * dy } : null;
  }).filter((candidate): candidate is { moved: AlbumElement[]; distance: number } => !!candidate).sort((a, b) => a.distance - b.distance);
  return candidates[0]?.moved ?? null;
}
function unionElementBounds(elements: AlbumElement[]): SafeRegion { const boxes = elements.map(bounds); return { x: Math.min(...boxes.map(b => b.x)), y: Math.min(...boxes.map(b => b.y)), right: Math.max(...boxes.map(b => b.right)), bottom: Math.max(...boxes.map(b => b.bottom)) }; }
export function centerInBox(e: AlbumElement, box: { x: number; y: number; right: number; bottom: number }, horizontal: boolean, vertical: boolean): AlbumElement {
  const b = bounds(e);
  return { ...e, x: e.x + (horizontal ? (box.x + box.right - b.x - b.right) / 2 : 0), y: e.y + (vertical ? (box.y + box.bottom - b.y - b.bottom) / 2 : 0) };
}
export function fillRectangleToSide(frame: FrameElement, page: Page): FrameElement | null {
  const base = frame.geometry.base, corners = [{ x: 0, y: 0 }, { x: frame.width, y: 0 }, { x: frame.width, y: frame.height }, { x: 0, y: frame.height }];
  const plainRectangle = !frame.geometry.paths && base.kind === 'rect' && Math.abs(base.x) < EPS && Math.abs(base.y) < EPS && Math.abs(base.width - frame.width) < EPS && Math.abs(base.height - frame.height) < EPS && frame.geometry.clip.length === 4 && corners.every(corner => frame.geometry.clip.some(point => Math.abs(point.x - corner.x) < EPS && Math.abs(point.y - corner.y) < EPS));
  if (!plainRectangle) return null;
  const region = dominantRegion(frame, pageSideRegions(page), page.baseWidth), width = region.right - region.x, height = region.bottom - region.y;
  return { ...(resizeElement(frame, width, height) as FrameElement), x: region.x, y: region.y, rotation: 0 };
}
export function clampTransform(from: AlbumElement, to: AlbumElement, page: Page): AlbumElement {
  if (insidePage(to, page)) return to;
  if (!insidePage(from, page)) return clampMove(from, page);
  const candidate = (t: number) => {
    const resized = resizeElement(from, from.width + (to.width - from.width) * t, from.height + (to.height - from.height) * t);
    return { ...resized, x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, rotation: from.rotation + (to.rotation - from.rotation) * t };
  };
  let low = 0, high = 1;
  for (let i = 0; i < 32; i++) { const mid = (low + high) / 2; if (insidePage(candidate(mid), page)) low = mid; else high = mid; }
  return candidate(low);
}
export function polygonArea(p: Point[]) { return Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2); }
export function clipHalfPlane(poly: Point[], normal: Point, threshold: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = a.x * normal.x + a.y * normal.y - threshold, db = b.x * normal.x + b.y * normal.y - threshold;
    if (da >= -EPS) out.push(a);
    if ((da > EPS && db < -EPS) || (da < -EPS && db > EPS)) { const t = da / (da - db); out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); }
  }
  return out.filter((p, i) => !i || Math.hypot(p.x - out[i - 1].x, p.y - out[i - 1].y) > EPS);
}
export function inPolygon(p: Point, polygon: Point[]) {
  let sign = 0;
  for (let i = 0; i < polygon.length; i++) { const a = polygon[i], b = polygon[(i + 1) % polygon.length]; const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x); if (Math.abs(c) > EPS) { if (sign && Math.sign(c) !== sign) return false; sign = Math.sign(c); } }
  return true;
}
export function geometryBounds(g: Geometry, rotation = 0) {
  let candidates = g.paths?.length ? g.paths.flat() : [...g.clip];
  if (!g.paths?.length && g.base.kind === 'ellipse') {
    const b = g.base, rx = b.width / 2, ry = b.height / 2, cx = b.x + rx, cy = b.y + ry;
    candidates = candidates.filter(p => ((p.x - cx) / rx) ** 2 + ((p.y - cy) / ry) ** 2 <= 1 + EPS);
    for (const axis of [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }]) { const n = rotate(axis, -rotation), d = Math.hypot(rx * n.x, ry * n.y), p = { x: cx + rx * rx * n.x / d, y: cy + ry * ry * n.y / d }; if (inPolygon(p, g.clip)) candidates.push(p); }
    for (let i = 0; i < g.clip.length; i++) {
      const p = g.clip[i], q = g.clip[(i + 1) % g.clip.length], x = (p.x - cx) / rx, y = (p.y - cy) / ry, dx = (q.x - p.x) / rx, dy = (q.y - p.y) / ry;
      const a = dx * dx + dy * dy, bb = 2 * (x * dx + y * dy), c = x * x + y * y - 1, d = bb * bb - 4 * a * c;
      if (d >= 0 && a > EPS * EPS) for (const t of [(-bb - Math.sqrt(d)) / (2 * a), (-bb + Math.sqrt(d)) / (2 * a)]) if (t >= -EPS && t <= 1 + EPS) candidates.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) });
    }
  }
  if (!candidates.length) return null;
  candidates = candidates.map(p => rotate(p, rotation));
  const x = Math.min(...candidates.map(p => p.x)), y = Math.min(...candidates.map(p => p.y));
  const width = Math.max(...candidates.map(p => p.x)) - x, height = Math.max(...candidates.map(p => p.y)) - y;
  return width > EPS && height > EPS ? { x, y, width, height } : null;
}
export function rebaseFrame(frame: FrameElement, clip: Point[]): FrameElement | null {
  if (clip.length < 3 || polygonArea(clip) < EPS) return null;
  const geometry = { ...frame.geometry, clip }, b = geometryBounds(geometry);
  if (!b || b.width < 0.01 || b.height < 0.01) return null;
  const shift = rotate(b, frame.rotation);
  return { ...frame, x: frame.x + shift.x, y: frame.y + shift.y, width: b.width, height: b.height,
    geometry: { base: { ...geometry.base, x: geometry.base.x - b.x, y: geometry.base.y - b.y }, clip: clip.map(p => ({ x: p.x - b.x, y: p.y - b.y })) },
    ...(frame.photo ? { photo: { ...frame.photo, x: frame.photo.x - b.x, y: frame.photo.y - b.y } } : {}),
  };
}
function rebasePathFrame(frame: FrameElement, paths: Point[][]): FrameElement | null {
  const usable = paths.filter(path => path.length >= 3 && polygonArea(path) > EPS), points = usable.flat();
  if (!points.length) return null;
  const left = Math.min(...points.map(point => point.x)), top = Math.min(...points.map(point => point.y)), right = Math.max(...points.map(point => point.x)), bottom = Math.max(...points.map(point => point.y)), width = right - left, height = bottom - top;
  if (width < .01 || height < .01) return null;
  const shift = rotate({ x: left, y: top }, frame.rotation), rebased = usable.map(path => path.map(point => ({ x: point.x - left, y: point.y - top })));
  return { ...frame, x: frame.x + shift.x, y: frame.y + shift.y, width, height, geometry: { base: { kind: 'rect', x: 0, y: 0, width, height }, clip: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }], paths: rebased }, ...(frame.photo ? { photo: { ...frame.photo, x: frame.photo.x - left, y: frame.photo.y - top } } : {}) };
}
export function coverPhoto(assetId: string, iw: number, ih: number, w: number, h: number): PhotoPlacement { const scale = Math.max(w / iw, h / ih); return { assetId, width: iw * scale, height: ih * scale, x: (w - iw * scale) / 2, y: (h - ih * scale) / 2 }; }
export function clampPhoto(p: PhotoPlacement, width: number, height: number): PhotoPlacement { const scale = Math.max(1, width / p.width, height / p.height); const w = p.width * scale, h = p.height * scale; return { ...p, width: w, height: h, x: Math.min(0, Math.max(width - w, p.x)), y: Math.min(0, Math.max(height - h, p.y)) }; }
export function resizeElement(e: AlbumElement, width: number, height: number, photoSource?: { width: number; height: number }): AlbumElement {
  const sx = width / e.width, sy = height / e.height;
  if (e.type === 'text') return { ...e, width, height, clip: e.clip?.map(p => ({ x: p.x * sx, y: p.y * sy })) };
  const b = e.geometry.base;
  let photo = e.photo;
  if (photo) {
    const resizeScale = Math.max(sx, sy), sourceScale = photoSource ? Math.max(photo.width / photoSource.width, photo.height / photoSource.height) : 1;
    const photoWidth = (photoSource ? photoSource.width * sourceScale : photo.width) * resizeScale, photoHeight = (photoSource ? photoSource.height * sourceScale : photo.height) * resizeScale;
    photo = clampPhoto({ ...photo, width: photoWidth, height: photoHeight, x: (photo.x + photo.width / 2) * sx - photoWidth / 2, y: (photo.y + photo.height / 2) * sy - photoHeight / 2 }, width, height);
  }
  return { ...e, width, height, geometry: { base: { ...b, x: b.x * sx, y: b.y * sy, width: b.width * sx, height: b.height * sy }, clip: e.geometry.clip.map(p => ({ x: p.x * sx, y: p.y * sy })), paths: e.geometry.paths?.map(path => path.map(p => ({ x: p.x * sx, y: p.y * sy }))) }, ...(photo ? { photo } : {}) };
}
export function clipElementToRect(e: AlbumElement, rect: { x: number; y: number; width: number; height: number }): AlbumElement | null {
  const planes = [[{ x: 1, y: 0 }, rect.x], [{ x: -1, y: 0 }, -rect.x - rect.width], [{ x: 0, y: 1 }, rect.y], [{ x: 0, y: -1 }, -rect.y - rect.height]] as [Point, number][];
  const clip = (source: Point[]) => { let poly = source; for (const [n, t] of planes) { const normal = rotate(n, -e.rotation); poly = clipHalfPlane(poly, normal, t - n.x * e.x - n.y * e.y); } return poly; };
  if (e.type === 'frame' && e.geometry.paths?.length) return rebasePathFrame(e, e.geometry.paths.map(clip));
  const poly = clip(e.type === 'frame' ? e.geometry.clip : e.clip ?? [{ x: 0, y: 0 }, { x: e.width, y: 0 }, { x: e.width, y: e.height }, { x: 0, y: e.height }]);
  if (poly.length < 3 || polygonArea(poly) < EPS) return null;
  return e.type === 'frame' ? rebaseFrame(e, poly) : { ...e, clip: poly };
}
export function clipPageToSafeArea(page: Page): Page {
  const regions = safeRegions(page), needsCut = page.elements.some(element => !insidePage(element, page));
  if (!needsCut) return { ...page, clipContentToPadding: false };
  const elements = page.elements.flatMap<AlbumElement>(element => {
    const region = dominantRegion(element, regions, page.baseWidth);
    const clipped = insidePage(element, page) ? element : clipElementToRect(element, { x: region.x, y: region.y, width: region.right - region.x, height: region.bottom - region.y });
    if (!clipped) return [];
    if (clipped.type !== 'frame') return [clipped];
    return [{ ...clipped, cutLink: undefined, cutPath: undefined } as FrameElement];
  });
  return { ...page, clipContentToPadding: false, elements };
}
export function convertPage(p: Page, choice: 'blank' | 'left' | 'right'): Page {
  if (p.mode === 'single') {
    const dx = choice === 'right' ? p.baseWidth : 0;
    return { ...p, mode: 'spread', elements: choice === 'blank' ? [] : p.elements.map(e => ({ ...e, x: e.x + dx })), backgroundPhoto: choice !== 'blank' && p.backgroundPhoto ? { ...p.backgroundPhoto, x: p.backgroundPhoto.x + dx } : undefined, backgroundClip: choice !== 'blank' && p.backgroundPhoto ? { x: dx, y: 0, width: p.baseWidth, height: p.height } : undefined };
  }
  const dx = choice === 'right' ? p.baseWidth : 0;
  const rect = { x: dx + p.padding, y: p.padding, width: p.baseWidth - 2 * p.padding, height: p.height - 2 * p.padding };
  const elements = p.elements.map(e => clipElementToRect(e, rect)).filter((e): e is AlbumElement => !!e).map(e => ({ ...e, x: e.x - dx }));
  const sourceClip = p.backgroundClip ?? { x: 0, y: 0, width: pageWidth(p), height: p.height };
  const clipLeft = Math.max(sourceClip.x, dx), clipRight = Math.min(sourceClip.x + sourceClip.width, dx + p.baseWidth);
  const backgroundPhoto = p.backgroundPhoto && clipRight - clipLeft > EPS ? { ...p.backgroundPhoto, x: p.backgroundPhoto.x - dx } : undefined;
  return { ...p, mode: 'single', elements, backgroundPhoto, backgroundClip: backgroundPhoto ? { x: clipLeft - dx, y: sourceClip.y, width: clipRight - clipLeft, height: sourceClip.height } : undefined };
}
