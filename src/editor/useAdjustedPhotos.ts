import { useEffect, useState } from 'react';
import type { FrameElement, Page } from '../domain/model';
import type { PhotoLibrary } from '../io/photos';
import { adjustmentKey, isNeutral } from '../domain/photoAdjustments';
import { previewPhoto } from '../render/adjustedPhotos';

export function useAdjustedPhotos(page: Page, library: PhotoLibrary, draft: FrameElement | null, compare: boolean, notify: (s: string) => void) {
  const [images, setImages] = useState(new Map<string, { source: HTMLImageElement; key: string; image: CanvasImageSource }>());
  const frames = page.elements.filter((e): e is FrameElement => e.type === 'frame').map(e => e.id === draft?.id ? draft : e);
  const signature = frames.map(e => `${e.id}:${e.photo?.assetId}:${adjustmentKey(e.photo?.adjustments)}`).join('|');
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const next = new Map<string, { source: HTMLImageElement; key: string; image: CanvasImageSource }>();
        for (const frame of frames) {
          if (cancelled) return;
          const p = frame.photo, photo = p && library.get(p.assetId);
          if (!p || !photo || isNeutral(p.adjustments)) continue;
          const image = await previewPhoto(photo, p.adjustments);
          if (cancelled) return;
          next.set(frame.id, { source: photo.image, key: adjustmentKey(p.adjustments), image });
        }
        if (!cancelled) setImages(next);
      })().catch(error => { if (!cancelled) notify(error instanceof Error ? error.message : 'Unable to adjust photo.'); });
    }, 35);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [signature, library, notify]);
  return (frame: FrameElement): CanvasImageSource | undefined => {
    if (!frame.photo) return undefined;
    const source = library.get(frame.photo.assetId)?.image;
    if (compare && frame.id === draft?.id || isNeutral(frame.photo.adjustments)) return source;
    const cached = images.get(frame.id);
    return cached && cached.source === source && (frame.id === draft?.id || cached.key === adjustmentKey(frame.photo.adjustments)) ? cached.image : source;
  };
}
