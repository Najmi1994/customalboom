import { FrameElement } from './model';
import { localToPage, pageToLocal } from './geometry';
import { linkCutPieces } from './cutLinks';
import type { CutExecutor } from './cutter';

export type DivisionDirection = 'horizontal' | 'vertical';

export async function divideFrame(frame: FrameElement, count: number, direction: DivisionDirection, gap: number, cut: CutExecutor, makeId: () => string): Promise<FrameElement[]> {
  if (frame.photo) throw new Error('Division works on one empty frame at a time.');
  if (frame.geometry.paths) throw new Error('Union Shapes cannot be divided.');
  if (!Number.isInteger(count) || count < 2 || count > 20) throw new Error('Division count must be a whole number from 2 to 20.');
  if (!Number.isFinite(gap) || gap < 0) throw new Error('Division gap must be zero or greater.');
  const total = direction === 'horizontal' ? frame.width : frame.height, partSize = (total - gap * (count - 1)) / count;
  if (partSize < .1) throw new Error('The current Cutter Gap is too large for this number of divisions.');

  const completed: FrameElement[] = [];
  let remainder = structuredClone(frame);
  for (let index = 0; index < count - 1; index++) {
    const margin = Math.max(remainder.width, remainder.height, gap, 10) + 10, cutAt = partSize + gap / 2;
    const localStart = direction === 'horizontal' ? { x: cutAt, y: -margin } : { x: -margin, y: cutAt };
    const localEnd = direction === 'horizontal' ? { x: cutAt, y: remainder.height + margin } : { x: remainder.width + margin, y: cutAt };
    const start = localToPage(localStart, remainder), end = localToPage(localEnd, remainder), raw = await cut(remainder, start, end, gap);
    if (raw.length !== 2) throw new Error('Division did not return two usable pieces.');
    const linked = linkCutPieces(remainder, start, end, gap, raw, makeId()).map(piece => ({ ...piece, id: makeId() })) as [FrameElement, FrameElement];
    const position = (piece: FrameElement) => {
      const center = localToPage({ x: piece.width / 2, y: piece.height / 2 }, piece), local = pageToLocal(center, remainder);
      return direction === 'horizontal' ? local.x : local.y;
    };
    const before = position(linked[0]) <= position(linked[1]) ? 0 : 1;
    completed.push(linked[before]);
    remainder = linked[before === 0 ? 1 : 0];
  }
  completed.push(remainder);
  return completed;
}
