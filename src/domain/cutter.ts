import { z } from 'zod';
import { clipHalfPlane, pageToLocal, rebaseFrame, validGeometry } from './geometry';
import { frameSchema, pointSchema, type FrameElement, type Point } from './model';

export const cutSchema = z.object({
  frame: frameSchema
    .refine(frame => !frame.photo, 'Only empty frames can be cut.')
    .refine(frame => !frame.geometry.paths, 'Union Shapes cannot be cut.'),
  start: pointSchema,
  end: pointSchema,
  gap: z.number().finite().min(0).max(1440),
}).strict();

export type CutInput = z.infer<typeof cutSchema>;
export type CutResult = [FrameElement, FrameElement];
export type CutExecutor = (frame: FrameElement, start: Point, end: Point, gap: number) => CutResult | Promise<CutResult>;

export function cutFrame(input: CutInput): CutResult {
  const { frame, start, end, gap } = cutSchema.parse(input);
  if (!validGeometry(frame.geometry, frame.width, frame.height)) throw new Error('Invalid frame geometry.');

  const a = pageToLocal(start, frame), b = pageToLocal(end, frame), length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 0.1) throw new Error('Draw a longer cutting line.');

  const normal = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
  const threshold = normal.x * a.x + normal.y * a.y;
  const pieces = [
    rebaseFrame(frame, clipHalfPlane(frame.geometry.clip, normal, threshold + gap / 2)),
    rebaseFrame(frame, clipHalfPlane(frame.geometry.clip, { x: -normal.x, y: -normal.y }, -threshold + gap / 2)),
  ];

  if (pieces.some(piece => !piece || piece.width < 0.1 || piece.height < 0.1 || piece.geometry.clip.length > 250)) {
    throw new Error('The line and gap must leave two usable pieces.');
  }
  return pieces as CutResult;
}
