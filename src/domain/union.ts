import { AlbumElement, FrameElement, Point, uid } from './model';
import { localToPage } from './geometry';

const EPS = 1e-5;

function signedArea(points: Point[]) { return points.reduce((sum, point, index) => { const next = points[(index + 1) % points.length]; return sum + point.x * next.y - next.x * point.y; }, 0) / 2; }
function cross(a: Point, b: Point, c: Point) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }

function clipConvex(subject: Point[], clip: Point[]) {
  const orientation = Math.sign(signedArea(clip)) || 1;
  let output = subject;
  for (let edge = 0; edge < clip.length && output.length; edge++) {
    const a = clip[edge], b = clip[(edge + 1) % clip.length], input = output; output = [];
    const inside = (point: Point) => cross(a, b, point) * orientation >= -EPS;
    const intersection = (p: Point, q: Point) => { const px = q.x - p.x, py = q.y - p.y, ax = b.x - a.x, ay = b.y - a.y, denominator = px * ay - py * ax; if (Math.abs(denominator) < EPS) return q; const t = ((a.x - p.x) * ay - (a.y - p.y) * ax) / denominator; return { x: p.x + px * t, y: p.y + py * t }; };
    for (let index = 0; index < input.length; index++) {
      const p = input[index], q = input[(index + 1) % input.length], pin = inside(p), qin = inside(q);
      if (pin && qin) output.push(q); else if (pin && !qin) output.push(intersection(p, q)); else if (!pin && qin) output.push(intersection(p, q), q);
    }
  }
  return output;
}

export function frameLocalPaths(frame: FrameElement): Point[][] {
  if (frame.geometry.paths?.length) return frame.geometry.paths.map(path => path.map(point => ({ ...point })));
  if (frame.geometry.base.kind === 'rect') return [frame.geometry.clip.map(point => ({ ...point }))];
  const base = frame.geometry.base, rx = base.width / 2, ry = base.height / 2, cx = base.x + rx, cy = base.y + ry;
  const ellipse = Array.from({ length: 128 }, (_, index) => { const angle = index * Math.PI * 2 / 128; return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry }; });
  const clipped = clipConvex(ellipse, frame.geometry.clip);
  return clipped.length >= 3 ? [clipped] : [];
}

export function frameVisiblePaths(frame: FrameElement): Point[][] {
  return frameLocalPaths(frame).map(path => {
    const pagePath = path.map(point => localToPage({ x: frame.flipX ? frame.width - point.x : point.x, y: frame.flipY ? frame.height - point.y : point.y }, frame));
    return signedArea(pagePath) < 0 ? pagePath.reverse() : pagePath;
  });
}

function onSegment(a: Point, b: Point, p: Point) { return Math.abs(cross(a, b, p)) <= EPS && p.x >= Math.min(a.x, b.x) - EPS && p.x <= Math.max(a.x, b.x) + EPS && p.y >= Math.min(a.y, b.y) - EPS && p.y <= Math.max(a.y, b.y) + EPS; }
function segmentsTouch(a: Point, b: Point, c: Point, d: Point) {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (((abC > EPS && abD < -EPS) || (abC < -EPS && abD > EPS)) && ((cdA > EPS && cdB < -EPS) || (cdA < -EPS && cdB > EPS))) return true;
  return onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}
function contains(path: Point[], point: Point) { let inside = false; for (let i = 0, j = path.length - 1; i < path.length; j = i++) { const a = path[i], b = path[j]; if (onSegment(a, b, point)) return true; if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside; } return inside; }
function pathsTouch(first: Point[], second: Point[]) {
  for (let a = 0; a < first.length; a++) for (let b = 0; b < second.length; b++) if (segmentsTouch(first[a], first[(a + 1) % first.length], second[b], second[(b + 1) % second.length])) return true;
  return contains(first, second[0]) || contains(second, first[0]);
}

export function unionSelectedFrames(elements: AlbumElement[]): FrameElement {
  if (elements.length < 2) throw new Error('Select at least two empty frames to create a Union Shape.');
  if (elements.some(element => element.type !== 'frame')) throw new Error('Union Shape only supports frames. Remove text from the selection.');
  const frames = elements as FrameElement[];
  if (frames.some(frame => frame.locked)) throw new Error('Unlock the selected frames before creating a Union Shape.');
  if (frames.some(frame => frame.photo)) throw new Error('Remove photos from the selected frames before creating a Union Shape.');
  const pathsByFrame = frames.map(frameVisiblePaths);
  if (pathsByFrame.some(paths => !paths.length)) throw new Error('One of the selected frames has invalid geometry.');
  const totalPaths = pathsByFrame.reduce((total, paths) => total + paths.length, 0);
  if (totalPaths > 64) throw new Error('This Union Shape would be too complex. Combine fewer frames at a time.');
  const reached = new Set([0]), queue = [0];
  while (queue.length) { const current = queue.shift()!; for (let other = 0; other < frames.length; other++) if (!reached.has(other) && pathsByFrame[current].some(first => pathsByFrame[other].some(second => pathsTouch(first, second)))) { reached.add(other); queue.push(other); } }
  if (reached.size !== frames.length) throw new Error('Every selected frame must touch or overlap another selected frame.');
  const pagePaths = pathsByFrame.flat(), points = pagePaths.flat(), left = Math.min(...points.map(point => point.x)), top = Math.min(...points.map(point => point.y)), right = Math.max(...points.map(point => point.x)), bottom = Math.max(...points.map(point => point.y)), width = right - left, height = bottom - top;
  if (width < .01 || height < .01) throw new Error('The selected frames cannot form a usable Union Shape.');
  const paths = pagePaths.map(path => path.map(point => ({ x: point.x - left, y: point.y - top })));
  const style = frames[frames.length - 1];
  return { id: uid(), type: 'frame', x: left, y: top, width, height, rotation: 0, fill: style.fill, locked: false, borderEnabled: style.borderEnabled, borderThickness: style.borderThickness, borderMargin: style.borderMargin, borderColor: style.borderColor, geometry: { base: { kind: 'rect', x: 0, y: 0, width, height }, clip: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }], paths } };
}
