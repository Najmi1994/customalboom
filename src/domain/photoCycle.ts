import { clampPhoto } from './geometry';
import type { FrameElement, PhotoAssetRef, PhotoPlacement } from './model';

function fitPhotoToFrame(photo: PhotoPlacement, source: FrameElement, target: FrameElement, asset: PhotoAssetRef): PhotoPlacement {
  const focusX = (source.width / 2 - photo.x) / photo.width;
  const focusY = (source.height / 2 - photo.y) / photo.height;
  const scale = Math.max(target.width / asset.width, target.height / asset.height);
  const width = asset.width * scale, height = asset.height * scale;
  return clampPhoto({ ...photo, width, height, x: target.width / 2 - focusX * width, y: target.height / 2 - focusY * height }, target.width, target.height);
}

/** Cycles photo slots in visual page order. Frame 1 moves to frame 2 and the
 * last frame moves to frame 1. Empty slots are deliberately included. */
export function cycleFramePhotos(frames: readonly FrameElement[], assets: ReadonlyMap<string, PhotoAssetRef>) {
  const ordered = [...frames].sort((a, b) => a.y - b.y || a.x - b.x);
  const updates = new Map<string, FrameElement>();
  ordered.forEach((target, index) => {
    const source = ordered[(index - 1 + ordered.length) % ordered.length];
    if (!source.photo) { updates.set(target.id, { ...target, photo: undefined }); return; }
    const asset = assets.get(source.photo.assetId);
    if (!asset) throw new Error('A selected photo is missing its project metadata. Reopen the project or photo folder and try again.');
    updates.set(target.id, { ...target, photo: fitPhotoToFrame(source.photo, source, target, asset) });
  });
  return { ordered, updates };
}
