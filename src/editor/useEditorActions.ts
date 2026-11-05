import { useCallback } from 'react';
import { AlbumElement, FrameElement, Page, makeFrame, makePage, makeText, pageWidth, photoUsage, uid } from '../domain/model';
import { SafeRegion, bounds, clampMove, coverPhoto, dominantRegionForBox, fillRectangleToSide, flipSpreadSide, insidePage, pageSideRegions, resizeElement, safeRegions, validPage } from '../domain/geometry';
import { PhotoLibrary } from '../io/photos';
import { useHistory } from './useHistory';
import { cutPath } from '../domain/cutLinks';
import { unionSelectedFrames } from '../domain/union';

export function useEditorActions(history: ReturnType<typeof useHistory>, page: Page, selected: string[], setSelected: (s: string[]) => void, library: PhotoLibrary, notify: (s: string) => void) {
  const { apply, current } = history;
  const selectedElements = page.elements.filter(e => selected.includes(e.id));
  const updatePage = useCallback((fn: (page: Page) => Page) => { apply(p => ({ ...p, pages: p.pages.map(item => item.id === page.id ? fn(item) : item) })); }, [apply, page.id]);
  function setElements(elements: AlbumElement[]) { if (elements.length > 500) return notify('A page can contain up to 500 objects.'); if (!elements.every(e => insidePage(e, page))) return notify('Objects must stay inside the page padding.'); updatePage(p => ({ ...p, elements })); }
  function updatePageSettings(patch: Partial<Page>) { const next = { ...page, ...patch }; if (Object.hasOwn(patch, "backgroundPhoto")) next.backgroundClip = undefined; if (!validPage(next)) return notify(patch.centerPaddingMode ? 'Every frame and text object must fit entirely inside the left or right safe region.' : 'This size or padding would put objects outside the safe area. Adjust the layout first.'); if (patch.baseWidth || patch.height) { const photo = next.backgroundPhoto && library.get(next.backgroundPhoto.assetId); if (photo) { next.backgroundPhoto = coverPhoto(photo.ref.id, photo.ref.width, photo.ref.height, pageWidth(next), next.height); next.backgroundClip = undefined; } } updatePage(() => next); }
  function updateElement(patch: Partial<AlbumElement>) {
    const element = selectedElements[0]; if (!element) return;
    let changed = { ...element, ...patch } as AlbumElement;
    if (patch.width || patch.height) { let width = patch.width ?? element.width, height = patch.height ?? element.height; if (element.type === 'frame' && element.geometry.base.kind === 'ellipse') { if (patch.width) height = element.height * width / element.width; else width = element.width * height / element.height; } const source = element.type === 'frame' && element.photo ? library.get(element.photo.assetId)?.ref : undefined; changed = resizeElement(element, width, height, source); }
    if (!insidePage(changed, page)) return notify('That change would cross the page padding.');
    setElements(page.elements.map(e => e.id === changed.id ? changed : e));
  }
  function addElement(kind: 'rect' | 'ellipse' | 'text') {
    const region = safeRegions(page)[0], w = region.right - region.x, h = region.bottom - region.y;
    if (Math.min(w, h) < 20) return notify('Reduce the padding to make room for a frame.');
    const size = Math.min(w * .42, h * .56), width = kind === 'ellipse' ? size : Math.min(w * .45, h * .72), height = kind === 'ellipse' ? size : Math.min(h * .5, width * .75);
    const x = region.x + (w - width) / 2, y = region.y + (h - height) / 2;
    let e: AlbumElement = kind === 'text' ? { ...makeText(x, y, width), height: Math.min(90, h), fontSize: Math.min(28, h / 4) } : makeFrame(kind, x, y, width, height);
    e = clampMove(e, page); setElements([...page.elements, e]); setSelected([e.id]);
  }
  function deleteElements() {
    if (!selected.length) return;
    const brokenCutRoots = new Set(selectedElements.flatMap(element => element.type === 'frame' && cutPath(element) ? [cutPath(element)![0].operationId] : []));
    setElements(page.elements.filter(element => !selected.includes(element.id)).map(element => element.type === 'frame' && cutPath(element) && brokenCutRoots.has(cutPath(element)![0].operationId) ? { ...element, cutLink: undefined, cutPath: undefined } : element));
    setSelected([]);
  }
  function groupFrames() {
    if (!selectedElements.length || selectedElements.some(element => element.type !== 'frame')) return notify('Select two or more frames to group. Only frames can be grouped.');
    const frames = selectedElements as FrameElement[], groupId = frames[0].groupId, completeGroup = groupId && frames.every(frame => frame.groupId === groupId) && page.elements.filter(element => element.type === 'frame' && element.groupId === groupId).every(element => selected.includes(element.id));
    if (completeGroup) return notify('These frames are already grouped. Press Ctrl + U to ungroup.');
    if (frames.length < 2) return notify('Select at least two frames to create a group.');
    const nextGroup = uid(); setElements(page.elements.map(element => element.type === 'frame' && selected.includes(element.id) ? { ...element, groupId: nextGroup } : element)); notify(`${frames.length} frames grouped. Press Ctrl + U to ungroup.`);
  }
  function ungroupFrames() {
    const groupIds = new Set(selectedElements.flatMap(element => element.type === 'frame' && element.groupId ? [element.groupId] : []));
    if (!groupIds.size) return notify('Select a grouped frame to ungroup.');
    setElements(page.elements.map(element => { if (element.type !== 'frame' || !element.groupId || !groupIds.has(element.groupId)) return element; const { groupId: _, ...ungrouped } = element; return ungrouped; }));
    notify(groupIds.size === 1 ? 'Frames ungrouped.' : `${groupIds.size} frame groups ungrouped.`);
  }
  function unionFrames() {
    try {
      const merged = unionSelectedFrames(selectedElements);
      if (!insidePage(merged, page)) return notify('The Union Shape must stay inside one page safe area.');
      const selectedIds = new Set(selectedElements.map(element => element.id));
      const topIndex = page.elements.reduce((index, element, currentIndex) => selectedIds.has(element.id) ? currentIndex : index, -1);
      const insertionIndex = page.elements.slice(0, topIndex).filter(element => !selectedIds.has(element.id)).length;
      const elements = page.elements.filter(element => !selectedIds.has(element.id));
      elements.splice(insertionIndex, 0, merged);
      setElements(elements); setSelected([merged.id]);
      notify(`${selectedElements.length} frames merged into one Union Shape.`);
    } catch (error) { notify(error instanceof Error ? error.message : 'The selected frames could not be merged.'); }
  }
  function align(kind: string) {
    if (!selectedElements.length) return;
    const units = selectionUnits(selectedElements), boxes = units.map(unitBounds);
    if (kind.startsWith('distribute') && units.length < 3) return notify('Select at least three objects or groups to distribute them.');
    const target = units.length === 1 ? dominantRegionForBox(boxes[0], safeRegions(page), page.baseWidth) : unionBounds(boxes);
    let changed: AlbumElement[];
    if (kind.startsWith('distribute')) {
      const horizontal = kind === 'distributeX', ordered = [...units].sort((a, b) => horizontal ? unitBounds(a).x - unitBounds(b).x : unitBounds(a).y - unitBounds(b).y);
      const total = ordered.reduce((n, unit) => { const b = unitBounds(unit); return n + (horizontal ? b.right - b.x : b.bottom - b.y); }, 0), span = horizontal ? target.right - target.x : target.bottom - target.y, gap = (span - total) / (ordered.length - 1);
      let at = horizontal ? target.x : target.y;
      changed = ordered.flatMap(unit => { const b = unitBounds(unit), dx = horizontal ? at - b.x : 0, dy = !horizontal ? at - b.y : 0; at += (horizontal ? b.right - b.x : b.bottom - b.y) + gap; return translateUnit(unit, dx, dy); });
    } else changed = units.flatMap(unit => { const b = unitBounds(unit), dx = kind === 'left' ? target.x - b.x : kind === 'right' ? target.right - b.right : kind === 'center' ? (target.x + target.right - b.x - b.right) / 2 : 0, dy = kind === 'top' ? target.y - b.y : kind === 'bottom' ? target.bottom - b.bottom : kind === 'middle' ? (target.y + target.bottom - b.y - b.bottom) / 2 : 0; return translateUnit(unit, dx, dy); });
    const map = new Map(changed.map(e => [e.id, e])); setElements(page.elements.map(e => map.get(e.id) ?? e));
  }
  function shortcutAlign(kind: 'page' | 'middle' | 'leftCenter' | 'rightCenter') {
    if (!selectedElements.length) return;
    const horizontal = kind !== 'middle', vertical = kind === 'page' || kind === 'middle';
    const sides = pageSideRegions(page), full = safeRegions(page)[0];
    const changes = selectionUnits(selectedElements).flatMap(unit => { const b = unitBounds(unit), box = kind === 'leftCenter' ? sides[0] : kind === 'rightCenter' ? sides[sides.length - 1] : kind === 'page' && page.mode === 'spread' ? dominantRegionForBox(b, sides, page.baseWidth) : full, dx = horizontal ? (box.x + box.right - b.x - b.right) / 2 : 0, dy = vertical ? (box.y + box.bottom - b.y - b.bottom) / 2 : 0; return translateUnit(unit, dx, dy); });
    const map = new Map(changes.map(e => [e.id, e])); setElements(page.elements.map(e => map.get(e.id) ?? e));
  }
  function fillRectangleSide() {
    if (selectedElements.length !== 1) return notify('Select one rectangle frame to fill its page side.');
    const element = selectedElements[0];
    if (element.type !== 'frame' || element.geometry.base.kind !== 'rect') return notify('Shortcut E is only available for rectangle frames.');
    const filled = fillRectangleToSide(element, page);
    if (!filled) return notify('Shortcut E is not available for cut frame pieces.');
    setElements(page.elements.map(item => item.id === filled.id ? filled : item));
  }
  function flip(axis: 'horizontal' | 'vertical') {
    if (!selectedElements.length) return;
    const enabled = !selectedElements.every(element => axis === 'horizontal' ? element.flipX : element.flipY);
    setElements(page.elements.map(element => {
      if (!selected.includes(element.id)) return element;
      return axis === 'horizontal' ? { ...element, flipX: enabled } : { ...element, flipY: enabled };
    }));
  }
  function duplicatePosition(direction: 'left' | 'right' | 'up' | 'down', gap: number) {
    if (!selectedElements.length) return notify('Select one or more objects to duplicate.');
    const selectionBounds = unionBounds(selectedElements.map(bounds)), dx = direction === 'left' ? -(selectionBounds.right - selectionBounds.x + gap) : direction === 'right' ? selectionBounds.right - selectionBounds.x + gap : 0, dy = direction === 'up' ? -(selectionBounds.bottom - selectionBounds.y + gap) : direction === 'down' ? selectionBounds.bottom - selectionBounds.y + gap : 0;
    const groupIds = new Map<string, string>(); let photoRemoved = false;
    const copies = selectedElements.map(element => {
      let copy = { ...structuredClone(element), id: uid(), x: element.x + dx, y: element.y + dy } as AlbumElement;
      if (copy.type === 'frame') {
        const groupId = copy.groupId;
        let nextGroupId: string | undefined;
        if (groupId) {
          nextGroupId = groupIds.get(groupId);
          if (!nextGroupId) { nextGroupId = uid(); groupIds.set(groupId, nextGroupId); }
        }
        copy = { ...copy, cutLink: undefined, cutPath: undefined, ...(nextGroupId ? { groupId: nextGroupId } : {}) };
        if (copy.photo && !current.current.allowDuplicates) { copy = { ...copy, photo: undefined }; photoRemoved = true; }
      }
      return copy;
    });
    if (!copies.every(element => insidePage(element, page))) return notify('The duplicate would cross the page padding. Reduce the spacing or choose another direction.');
    setElements([...page.elements, ...copies]); setSelected(copies.map(element => element.id));
    if (photoRemoved) notify('Frames were duplicated without photos because duplicate photos are disabled.');
  }
  function layer(direction: number) { const elements = [...page.elements]; const indices = elements.map((e, i) => selected.includes(e.id) ? i : -1).filter(i => i >= 0); if (direction > 0) indices.reverse(); for (const i of indices) { const next = i + direction; if (next >= 0 && next < elements.length && !selected.includes(elements[next].id)) [elements[i], elements[next]] = [elements[next], elements[i]]; } setElements(elements); }
  function assignPhoto(assetId: string, frameId?: string, background = false) {
    const local = library.get(assetId); if (!local) return notify('Please reopen the folder containing this photo.');
    const target = page.elements.find(e => e.id === frameId), same = background ? page.backgroundPhoto?.assetId === assetId : target?.type === 'frame' && target.photo?.assetId === assetId;
    if (!current.current.allowDuplicates && (photoUsage(current.current).get(assetId) ?? 0) > 0 && !same) return notify('This photo is already used in the album. Enable “Allow duplicate photo” to use it again.');
    if (!current.current.assets.some(a => a.id === assetId)) history.mergeAssets([local.ref]);
    if (background) updatePage(p => ({ ...p, backgroundClip: undefined, backgroundPhoto: coverPhoto(assetId, local.ref.width, local.ref.height, pageWidth(p), p.height) }));
    else if (target?.type === 'frame') { updatePage(p => ({ ...p, elements: p.elements.map(e => e.id === frameId && e.type === 'frame' ? { ...e, photo: coverPhoto(assetId, local.ref.width, local.ref.height, e.width, e.height) } : e) })); setSelected([frameId!]); }
    else notify('Select a frame, or drag this photo onto one.');
  }
  function removePhotos() {
    const frames = selectedElements.filter((element): element is FrameElement => element.type === 'frame' && !!element.photo);
    if (!frames.length) return notify('Select one or more frames containing photos first.');
    const ids = new Set(frames.map(frame => frame.id));
    setElements(page.elements.map(element => element.type === 'frame' && ids.has(element.id) ? { ...element, photo: undefined } : element));
  }
  function autoFill(selectedPhotoIds: string[] = [], eligiblePhotoIds?: readonly string[]) {
    const frames = page.elements.filter((e): e is FrameElement => e.type === 'frame' && !e.photo).sort((a, b) => a.y - b.y || a.x - b.x), used = photoUsage(current.current);
    const selectedMode = selectedPhotoIds.length > 0;
    const candidates = selectedMode
      ? selectedPhotoIds.map(id => library.get(id)).filter((photo): photo is NonNullable<typeof photo> => !!photo)
      : (eligiblePhotoIds ? eligiblePhotoIds.map(id => library.get(id)).filter((photo): photo is NonNullable<typeof photo> => !!photo) : [...library.values()]).sort((a, b) => a.ref.name.localeCompare(b.ref.name, undefined, { numeric: true }));
    const available = candidates.filter(photo => current.current.allowDuplicates || !used.has(photo.ref.id));
    if (!frames.length) return notify('Add some empty frames to this page first.');
    if (!available.length) return notify(selectedMode ? 'None of the selected photos are available. Enable “Allow duplicate photo” if they are already used.' : 'No unused photos are available.');
    const updates = new Map<string, FrameElement>();
    const assigned = new Map<string, typeof available[number]>();
    frames.forEach((frame, index) => {
      const photo = available[selectedMode ? index : current.current.allowDuplicates ? index % available.length : index];
      if (photo) { updates.set(frame.id, { ...frame, photo: coverPhoto(photo.ref.id, photo.ref.width, photo.ref.height, frame.width, frame.height) }); assigned.set(photo.ref.id, photo); }
    });
    history.mergeAssets([...assigned.values()].map(photo => photo.ref));
    updatePage(currentPage => ({ ...currentPage, elements: currentPage.elements.map(element => updates.get(element.id) ?? element) }));
    if (selectedMode) {
      const empty = frames.length - updates.size, ignored = Math.max(0, available.length - updates.size);
      notify(`${updates.size} frame${updates.size === 1 ? '' : 's'} filled from selected photos.${empty ? ` ${empty} frame${empty === 1 ? '' : 's'} left empty.` : ''}${ignored ? ` ${ignored} extra photo${ignored === 1 ? '' : 's'} ignored.` : ''}`);
    } else notify(`${updates.size} frame${updates.size === 1 ? '' : 's'} filled. Double-click a photo to adjust its crop.`);
  }
  function addPage() { if (current.current.pages.length >= 200) { notify('An album can contain up to 200 pages.'); return page.id; } const p = makePage(page); apply(doc => ({ ...doc, pages: [...doc.pages, p] })); return p.id; }
  function duplicatePage(id: string) {
    if (current.current.pages.length >= 200) { notify('An album can contain up to 200 pages.'); return id; }
    const source = current.current.pages.find(item => item.id === id); if (!source) return id;
    const groupIds = new Map<string, string>(), operationIds = new Map<string, string>();
    const remap = (map: Map<string, string>, oldId: string) => { let next = map.get(oldId); if (!next) { next = uid(); map.set(oldId, next); } return next; };
    const clone = structuredClone(source);
    clone.id = uid();
    clone.elements = clone.elements.map(element => {
      const next = { ...element, id: uid() } as AlbumElement;
      if (next.type !== 'frame') return next;
      if (next.groupId) next.groupId = remap(groupIds, next.groupId);
      const remapLink = (link: NonNullable<FrameElement['cutLink']>) => ({ ...link, operationId: remap(operationIds, link.operationId) });
      if (next.cutPath?.length) next.cutPath = next.cutPath.map(remapLink);
      if (next.cutLink) next.cutLink = remapLink(next.cutLink);
      return next;
    });
    apply(doc => { const pages = [...doc.pages], index = pages.findIndex(item => item.id === id); if (index < 0) return doc; pages.splice(index + 1, 0, clone); return { ...doc, pages }; });
    notify('Page duplicated.');
    return clone.id;
  }
  function flipSide() {
    if (page.mode !== 'spread') return;
    const elements = flipSpreadSide(page);
    if (!elements.every(element => insidePage(element, page))) return notify('The layout cannot be flipped while an object crosses the spread safe area.');
    setElements(elements);
    notify('Layout positions flipped across the spread. Photos were not mirrored.');
  }
  function movePage(id: string, direction: number) { apply(doc => { const pages = [...doc.pages], index = pages.findIndex(p => p.id === id), target = Math.max(0, Math.min(pages.length - 1, index + direction)); pages.splice(target, 0, ...pages.splice(index, 1)); return { ...doc, pages }; }); }
  function reorderPage(id: string, target: number) { apply(doc => { const pages = [...doc.pages], index = pages.findIndex(p => p.id === id), destination = Math.max(0, Math.min(pages.length - 1, target)); if (index < 0 || index === destination) return doc; const [moved] = pages.splice(index, 1); pages.splice(destination, 0, moved); return { ...doc, pages }; }); }
  return { selectedElements, updatePage, setElements, updatePageSettings, updateElement, addElement, deleteElements, toggleGroup: groupFrames, ungroupFrames, unionFrames, align, shortcutAlign, fillRectangleSide, flip, duplicatePosition, layer, assignPhoto, removePhotos, autoFill, addPage, duplicatePage, flipSide, movePage, reorderPage };
}

function selectionUnits(elements: AlbumElement[]) { const units = new Map<string, AlbumElement[]>(); elements.forEach(element => { const key = element.type === 'frame' && element.groupId ? `group:${element.groupId}` : element.id; units.set(key, [...(units.get(key) ?? []), element]); }); return [...units.values()]; }
function unitBounds(elements: AlbumElement[]): SafeRegion { return unionBounds(elements.map(bounds)); }
function unionBounds(boxes: SafeRegion[]): SafeRegion { return { x: Math.min(...boxes.map(box => box.x)), y: Math.min(...boxes.map(box => box.y)), right: Math.max(...boxes.map(box => box.right)), bottom: Math.max(...boxes.map(box => box.bottom)) }; }
function translateUnit(elements: AlbumElement[], dx: number, dy: number) { return elements.map(element => ({ ...element, x: element.x + dx, y: element.y + dy })); }
