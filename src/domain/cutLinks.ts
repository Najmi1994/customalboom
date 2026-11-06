import { CutLink, CutShape, FRAME_BORDER_THICKNESS, FrameElement, Point } from './model';
import { clampPhoto, geometryBounds, resizeElement } from './geometry';
import type { CutExecutor } from './cutter';

const EPSILON = 1e-5;

export type CutOperation = {
  operationId: string; source: CutShape; start: Point; end: Point; gap: number;
  parent?: { operationId: string; side: 0 | 1 };
  children: [string | undefined, string | undefined];
  leaves: [FrameElement | undefined, FrameElement | undefined];
};
export type CutTree = { rootId: string; operations: Map<string, CutOperation>; frames: FrameElement[] };
type SpacerBox = { x: number; y: number; right: number; bottom: number };
export type GeometricSpacerNode = { kind: 'leaf'; frame: FrameElement; bounds: SpacerBox } | { kind: 'split'; axis: 'x' | 'y'; center: number; gap: number; bounds: SpacerBox; before: GeometricSpacerNode; after: GeometricSpacerNode };
export type GeometricSpacerLayout = { root: GeometricSpacerNode; frames: FrameElement[]; gaps: number[]; bounds: SpacerBox };
export type CutSelection = { valid: true; mode: 'history'; trees: CutTree[]; layouts: []; gaps: number[] } | { valid: true; mode: 'geometry'; trees: []; layouts: GeometricSpacerLayout[]; gaps: number[] } | { valid: false; reason: string; trees: []; layouts: []; gaps: [] };

export function cutShape(frame: FrameElement): CutShape {
  return { x: frame.x, y: frame.y, width: frame.width, height: frame.height, rotation: frame.rotation, geometry: structuredClone(frame.geometry) };
}

export function cutPath(frame: FrameElement): CutLink[] | undefined {
  return frame.cutPath?.length ? frame.cutPath : frame.cutLink ? [frame.cutLink] : undefined;
}

export function linkCutPieces(source: FrameElement, start: Point, end: Point, gap: number, pieces: [FrameElement, FrameElement], operationId: string): [FrameElement, FrameElement] {
  const inherited = cutPath(source) ?? [], sourceShape = cutShape(source);
  return pieces.map((piece, side) => {
    const link: CutLink = { operationId, side: side as 0 | 1, source: sourceShape, expected: cutShape(piece), start: structuredClone(start), end: structuredClone(end), gap };
    return { ...piece, cutLink: link, cutPath: [...structuredClone(inherited), link] };
  }) as [FrameElement, FrameElement];
}

export function analyzeCutSelection(elements: FrameElement[], selectedIds: string[]): CutSelection {
  const selectedSet = new Set(selectedIds), selected = elements.filter(frame => selectedSet.has(frame.id));
  if (selected.length < 2 || selected.length !== selectedSet.size) return invalid('Select at least two rectangular frames.');
  const selectedPaths = selected.map(frame => ({ frame, path: cutPath(frame) }));
  if (selectedPaths.every(item => item.path?.length) && selectedPaths.every(({ frame, path }) => sameShape(frame, path![path!.length - 1].expected))) {
    const history = analyzeHistory(elements, selectedSet, selectedPaths as { frame: FrameElement; path: CutLink[] }[]);
    if (history) return history;
  }
  const layout = buildGeometricLayout(selected);
  if (!layout) return invalid('Without cut history, select a complete non-overlapping layout made from straight, unrotated rectangles.');
  return { valid: true, mode: 'geometry', trees: [], layouts: [layout], gaps: layout.gaps };
}

function analyzeHistory(elements: FrameElement[], selectedSet: Set<string>, selectedPaths: { frame: FrameElement; path: CutLink[] }[]): Extract<CutSelection, { mode: 'history' }> | null {
  const roots = [...new Set(selectedPaths.map(item => item.path![0].operationId))], trees: CutTree[] = [];
  for (const rootId of roots) {
    const members = elements.filter(frame => cutPath(frame)?.[0].operationId === rootId);
    if (members.length < 2 || members.some(frame => !selectedSet.has(frame.id))) return null;
    const tree = buildTree(rootId, members);
    if (!tree) return null;
    trees.push(tree);
  }
  return { valid: true, mode: 'history', trees, layouts: [], gaps: trees.flatMap(tree => [...tree.operations.values()].map(operation => operation.gap)) };
}

export function sourceFrame(link: Pick<CutLink, 'operationId' | 'source'>, fill: string): FrameElement {
  return { id: link.operationId, type: 'frame', fill, locked: false, borderEnabled: false, borderThickness: FRAME_BORDER_THICKNESS, borderMargin: 0, borderColor: '#000000', ...structuredClone(link.source) };
}

export function mergeRecutPiece(current: FrameElement, recut: FrameElement, path: CutLink[]): FrameElement {
  const photo = current.photo ? clampPhoto({ ...current.photo, x: current.photo.x + recut.geometry.base.x - current.geometry.base.x, y: current.photo.y + recut.geometry.base.y - current.geometry.base.y }, recut.width, recut.height) : undefined;
  const nextPath = structuredClone(path), cutLink = nextPath[nextPath.length - 1];
  return {
    ...current,
    x: recut.x,
    y: recut.y,
    width: recut.width,
    height: recut.height,
    rotation: recut.rotation,
    geometry: recut.geometry,
    ...(photo ? { photo } : { photo: undefined }),
    cutLink,
    cutPath: nextPath,
  };
}

export async function recutCutTree(tree: CutTree, gap: number, cut: CutExecutor): Promise<Map<string, FrameElement>> {
  const updates = new Map<string, FrameElement>();
  async function visit(operationId: string, frame: FrameElement, path: CutLink[]): Promise<void> {
    const operation = tree.operations.get(operationId)!;
    const pieces = await cut(frame, operation.start, operation.end, gap);
    await Promise.all(pieces.map(async (piece, sideIndex) => {
      const side = sideIndex as 0 | 1, link: CutLink = { operationId, side, source: cutShape(frame), expected: cutShape(piece), start: structuredClone(operation.start), end: structuredClone(operation.end), gap }, nextPath = [...path, link], child = operation.children[side], leaf = operation.leaves[side];
      if (child) await visit(child, { ...piece, id: child, photo: undefined, cutLink: undefined, cutPath: undefined }, nextPath);
      else if (leaf) updates.set(leaf.id, mergeRecutPiece(leaf, piece, nextPath));
      else throw new Error('This cut layout is incomplete.');
    }));
  }
  const root = tree.operations.get(tree.rootId)!;
  await visit(tree.rootId, sourceFrame(root, tree.frames[0].fill), []);
  if (updates.size !== tree.frames.length) throw new Error('This cut layout is incomplete.');
  return updates;
}

export function resizeGeometricLayout(layout: GeometricSpacerLayout, gap: number, photoSource: (frame: FrameElement) => { width: number; height: number } | undefined): Map<string, FrameElement> {
  const updates = new Map<string, FrameElement>();
  function visit(node: GeometricSpacerNode, box: SpacerBox) {
    if (node.kind === 'leaf') {
      const width = box.right - box.x, height = box.bottom - box.y;
      if (width < .1 || height < .1) throw new Error('The new gap leaves too little room for one or more frames.');
      const resized = resizeElement(node.frame, width, height, photoSource(node.frame)) as FrameElement;
      updates.set(node.frame.id, { ...resized, x: box.x, y: box.y, cutLink: undefined, cutPath: undefined }); return;
    }
    if (node.axis === 'x') {
      const before = { ...box, right: node.center - gap / 2 }, after = { ...box, x: node.center + gap / 2 };
      if (before.right <= before.x || after.right <= after.x) throw new Error('The new gap is too large for this layout.');
      visit(node.before, before); visit(node.after, after);
    } else {
      const before = { ...box, bottom: node.center - gap / 2 }, after = { ...box, y: node.center + gap / 2 };
      if (before.bottom <= before.y || after.bottom <= after.y) throw new Error('The new gap is too large for this layout.');
      visit(node.before, before); visit(node.after, after);
    }
  }
  visit(layout.root, layout.bounds); return updates;
}

function buildTree(rootId: string, frames: FrameElement[]): CutTree | null {
  const operations = new Map<string, CutOperation>(); let valid = true;
  for (const frame of frames) {
    const path = cutPath(frame)!;
    if (path[0].operationId !== rootId) return null;
    path.forEach((link, index) => {
      const parentLink = path[index - 1], parent = parentLink ? { operationId: parentLink.operationId, side: parentLink.side } : undefined;
      let operation = operations.get(link.operationId);
      if (!operation) {
        operation = { operationId: link.operationId, source: structuredClone(link.source), start: structuredClone(link.start), end: structuredClone(link.end), gap: link.gap, parent, children: [undefined, undefined], leaves: [undefined, undefined] };
        operations.set(link.operationId, operation);
      } else if (!sameOperation(operation, link, parent)) { valid = false; return; }
      const child = path[index + 1];
      if (child) {
        if (operation.leaves[link.side] || operation.children[link.side] && operation.children[link.side] !== child.operationId) valid = false;
        else operation.children[link.side] = child.operationId;
      } else {
        if (operation.children[link.side] || operation.leaves[link.side] && operation.leaves[link.side]!.id !== frame.id) valid = false;
        else operation.leaves[link.side] = frame;
      }
    });
  }
  const root = operations.get(rootId); if (!valid || !root || root.parent) return null;
  for (const operation of operations.values()) for (const side of [0, 1] as const) {
    const child = operation.children[side], leaf = operation.leaves[side];
    if ((child ? 1 : 0) + (leaf ? 1 : 0) !== 1 || child && !operations.has(child)) return null;
    if (child) { const next = operations.get(child)!; if (next.parent?.operationId !== operation.operationId || next.parent.side !== side) return null; }
  }
  if (!allReachable(rootId, operations)) return null;
  return { rootId, operations, frames };
}
function allReachable(rootId: string, operations: Map<string, CutOperation>) { const visited = new Set<string>(), visit = (id: string) => { if (visited.has(id)) return; visited.add(id); operations.get(id)?.children.forEach(child => { if (child) visit(child); }); }; visit(rootId); return visited.size === operations.size; }
function sameOperation(operation: CutOperation, link: CutLink, parent?: { operationId: string; side: 0 | 1 }) { return operation.gap === link.gap && JSON.stringify(operation.source) === JSON.stringify(link.source) && JSON.stringify(operation.start) === JSON.stringify(link.start) && JSON.stringify(operation.end) === JSON.stringify(link.end) && JSON.stringify(operation.parent) === JSON.stringify(parent); }
function buildGeometricLayout(frames: FrameElement[]): GeometricSpacerLayout | null {
  if (frames.some(frame => !isStraightRectangle(frame))) return null;
  const bounds = frameBounds(frames), root = partitionRectangles(frames);
  if (!root) return null;
  const gaps: number[] = [], collect = (node: GeometricSpacerNode) => { if (node.kind === 'split') { gaps.push(node.gap); collect(node.before); collect(node.after); } };
  collect(root); return gaps.length ? { root, frames, gaps, bounds } : null;
}
function partitionRectangles(frames: FrameElement[]): GeometricSpacerNode | null {
  const bounds = frameBounds(frames);
  if (frames.length === 1) return { kind: 'leaf', frame: frames[0], bounds };
  const candidates: { axis: 'x' | 'y'; center: number; gap: number; before: FrameElement[]; after: FrameElement[] }[] = [];
  for (const axis of ['x', 'y'] as const) {
    const centers = [...new Set(frames.map(frame => axis === 'x' ? frame.x + frame.width / 2 : frame.y + frame.height / 2))].sort((a, b) => a - b);
    for (let index = 0; index < centers.length - 1; index++) {
      const threshold = (centers[index] + centers[index + 1]) / 2, before = frames.filter(frame => (axis === 'x' ? frame.x + frame.width / 2 : frame.y + frame.height / 2) < threshold), after = frames.filter(frame => !before.includes(frame));
      if (!before.length || !after.length) continue;
      const beforeEdge = Math.max(...before.map(frame => axis === 'x' ? frame.x + frame.width : frame.y + frame.height)), afterEdge = Math.min(...after.map(frame => axis === 'x' ? frame.x : frame.y)), gap = afterEdge - beforeEdge;
      if (gap > EPSILON) candidates.push({ axis, center: (beforeEdge + afterEdge) / 2, gap, before, after });
    }
  }
  candidates.sort((left, right) => left.gap - right.gap);
  for (const candidate of candidates) {
    const before = partitionRectangles(candidate.before), after = partitionRectangles(candidate.after);
    if (before && after) return { kind: 'split', axis: candidate.axis, center: candidate.center, gap: candidate.gap, bounds, before, after };
  }
  return null;
}
function frameBounds(frames: FrameElement[]): SpacerBox { return { x: Math.min(...frames.map(frame => frame.x)), y: Math.min(...frames.map(frame => frame.y)), right: Math.max(...frames.map(frame => frame.x + frame.width)), bottom: Math.max(...frames.map(frame => frame.y + frame.height)) }; }
function polygonArea(points: Point[]) { let area = 0; for (let index = 0; index < points.length; index++) { const next = points[(index + 1) % points.length]; area += points[index].x * next.y - next.x * points[index].y; } return Math.abs(area) / 2; }
function isStraightRectangle(frame: FrameElement) { const rotation = ((frame.rotation % 360) + 360) % 360, box = geometryBounds(frame.geometry); return !frame.geometry.paths && (rotation < EPSILON || Math.abs(rotation - 360) < EPSILON) && frame.geometry.base.kind === 'rect' && !!box && near(box.x, 0) && near(box.y, 0) && near(box.width, frame.width) && near(box.height, frame.height) && near(polygonArea(frame.geometry.clip), frame.width * frame.height); }
function invalid(reason: string): CutSelection { return { valid: false, reason, trees: [], layouts: [], gaps: [] }; }
function near(left: number, right: number) { return Math.abs(left - right) <= EPSILON; }
function samePoint(left: Point, right: Point) { return near(left.x, right.x) && near(left.y, right.y); }
function sameShape(frame: FrameElement, expected: CutShape) {
  const actual = cutShape(frame), a = actual.geometry, b = expected.geometry;
  return near(actual.x, expected.x) && near(actual.y, expected.y) && near(actual.width, expected.width) && near(actual.height, expected.height) && near(actual.rotation, expected.rotation)
    && a.base.kind === b.base.kind && near(a.base.x, b.base.x) && near(a.base.y, b.base.y) && near(a.base.width, b.base.width) && near(a.base.height, b.base.height)
    && a.clip.length === b.clip.length && a.clip.every((point, index) => samePoint(point, b.clip[index]));
}
