export const PHOTO_ITEM_WIDTH = 92;
export const PHOTO_ITEM_GAP = 10;
export const PHOTO_ITEM_STRIDE = PHOTO_ITEM_WIDTH + PHOTO_ITEM_GAP;
export const PHOTO_OVERSCAN = 8;

export type VirtualPhotoRange = { start: number; end: number };

export function virtualPhotoRange(
  count: number,
  scrollLeft: number,
  viewportWidth: number,
  stride = PHOTO_ITEM_STRIDE,
  overscan = PHOTO_OVERSCAN,
): VirtualPhotoRange {
  if (count <= 0) return { start: 0, end: 0 };
  const safeScroll = Math.max(0, scrollLeft), safeWidth = Math.max(0, viewportWidth);
  const start = Math.max(0, Math.floor(safeScroll / stride) - overscan);
  const end = Math.min(count, Math.max(start + 1, Math.ceil((safeScroll + safeWidth) / stride) + overscan));
  return { start, end };
}

export function virtualPhotoSpacer(items: number): number {
  return items > 0 ? items * PHOTO_ITEM_STRIDE - PHOTO_ITEM_GAP : 0;
}
