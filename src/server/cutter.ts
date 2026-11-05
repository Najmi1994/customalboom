import { z } from 'zod';
import { frameSchema, pointSchema, FrameElement } from '../domain/model';
import { pageToLocal, clipHalfPlane, rebaseFrame, validGeometry } from '../domain/geometry';
export const cutSchema = z.object({ frame: frameSchema.refine(f => !f.photo, 'Only empty frames can be cut.').refine(f => !f.geometry.paths, 'Union Shapes cannot be cut.'), start: pointSchema, end: pointSchema, gap: z.number().finite().min(0).max(1440) }).strict();
export function cutFrame(input: z.infer<typeof cutSchema>): [FrameElement, FrameElement] {
  const { frame, gap } = input;
  if (!validGeometry(frame.geometry, frame.width, frame.height)) throw new Error('Invalid frame geometry.');
  const a = pageToLocal(input.start, frame), b = pageToLocal(input.end, frame), length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 0.1) throw new Error('Draw a longer cutting line.');
  const n = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length }, t = n.x * a.x + n.y * a.y;
  const pieces = [rebaseFrame(frame, clipHalfPlane(frame.geometry.clip, n, t + gap / 2)), rebaseFrame(frame, clipHalfPlane(frame.geometry.clip, { x: -n.x, y: -n.y }, -t + gap / 2))];
  if (pieces.some(p => !p || p.width < 0.1 || p.height < 0.1 || p.geometry.clip.length > 250)) throw new Error('The line and gap must leave two usable pieces.');
  return pieces as [FrameElement, FrameElement];
}
