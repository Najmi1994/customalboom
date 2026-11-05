import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { AlbumElement, FrameElement, Page } from '../domain/model';
import type { PhotoLibrary } from '../io/photos';
import { samePhoto } from '../domain/photoAdjustments';
export function usePhotoEdit({ page, library, busy, onBegin, onChange, notify }: { page: Page; library: PhotoLibrary; busy: boolean; onBegin: (id: string) => void; onChange: (elements: AlbumElement[]) => void; notify: (message: string) => void }) {
  const [photoDraft, setPhotoDraft] = useState<FrameElement | null>(null), [comparePhoto, setComparePhoto] = useState(false);
  const photoOriginal = useRef<FrameElement | null>(null);
  function begin(frame: FrameElement) {
    if (photoDraft || busy) return;
    if (!frame.photo || !library.has(frame.photo.assetId)) { notify('Reconnect this photo before adjusting it.'); return; }
    photoOriginal.current = frame; setPhotoDraft(structuredClone(frame)); setComparePhoto(false); onBegin(frame.id);
  }
  function finish(save: boolean) {
    if (save && photoDraft) {
      const existing = page.elements.find(e => e.id === photoDraft.id);
      if (existing !== photoOriginal.current) notify('The frame changed. Please reopen Photo Adjustments.');
      else if (!samePhoto(photoOriginal.current?.photo, photoDraft.photo)) onChange(page.elements.map(e => e.id === photoDraft.id ? photoDraft : e));
    }
    setPhotoDraft(null); setComparePhoto(false); photoOriginal.current = null;
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.canvas-area')?.focus());
  }
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    if (!photoDraft) return;
    const nodes = [...document.querySelectorAll<HTMLElement>('.app-header,.workspace-toolbar,.photos-panel,.pages-panel,.missing-banner')];
    const previous = nodes.map(node => node.inert); nodes.forEach(node => { node.inert = true; });
    return () => nodes.forEach((node, index) => { node.inert = previous[index]; });
  }, [!!photoDraft]);
  useEffect(() => {
    if (!photoDraft) return;
    function key(e: KeyboardEvent) {
      if (e.isComposing) return;
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault(); e.stopImmediatePropagation();
        if (e.repeat) return;
        // Commit and normalize a focused number field before saving the latest draft.
        flushSync(() => { if (e.target instanceof HTMLInputElement) e.target.blur(); });
        finishRef.current(true); return;
      }
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); finish(false); return; }
      if ((e.ctrlKey || e.metaKey) && ['s', 'g', 'u', 'm'].includes(e.key.toLowerCase())) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      const input = (e.target as HTMLElement)?.matches('input,textarea,select,[contenteditable="true"]');
      // Stop editor shortcuts at capture phase, while leaving native input and
      // panel button keyboard interaction available at their own targets.
      if (!input && (e.target as HTMLElement)?.closest('.photo-adjustments,.photo-edit-hint')) return;
      if (input) return;
      if (e.key !== 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); }
    }
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });

  return { photoDraft, setPhotoDraft, comparePhoto, setComparePhoto, begin, finish };
}
