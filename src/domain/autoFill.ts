type Dimensions = { width: number; height: number };
type Photo = Dimensions & { id: string };

function orientation({ width, height }: Dimensions) {
  return width === height ? 'square' : width > height ? 'landscape' : 'portrait';
}

/** Reserve matching orientations before using leftovers, so an early mismatch
 * cannot take the only suitable photo from a later frame. Ties preserve tray order. */
export function matchAutoFillPhotos<F extends Dimensions & { id: string }, P extends Photo>(frames: readonly F[], photos: readonly P[], repeat = false): Map<string, P> {
  const candidates = [...new Map(photos.map(photo => [photo.id, photo])).values()].map(photo => ({ photo, direction: orientation(photo), ratio: Math.log(photo.width / photo.height) }));
  const assignments = new Map<string, P>(), uses = new Map<string, number>();
  function assign(frame: F, matchingOnly: boolean) {
    let best: P | undefined, bestUses = Infinity, bestCrop = Infinity;
    const direction = orientation(frame), ratio = Math.log(frame.width / frame.height);
    for (const candidate of candidates) {
      const { photo } = candidate;
      const count = uses.get(photo.id) ?? 0;
      if ((!repeat && count > 0) || (matchingOnly && candidate.direction !== direction)) continue;
      // Log ratio distance is symmetric for portrait/landscape and tracks cover crop loss.
      const crop = Math.abs(candidate.ratio - ratio);
      if (count < bestUses || (count === bestUses && crop < bestCrop)) { best = photo; bestUses = count; bestCrop = crop; }
    }
    if (best) { assignments.set(frame.id, best); uses.set(best.id, bestUses + 1); }
  }
  frames.forEach(frame => assign(frame, true));
  frames.forEach(frame => { if (!assignments.has(frame.id)) assign(frame, false); });
  return assignments;
}
