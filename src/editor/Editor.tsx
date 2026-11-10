'use client';
import SupportMessage from '../support/SupportMessage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeftRight, AtSign, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Coffee, Copy, Eye, FileArchive, FileImage, FilePlus2, FileText, FolderOpen, Grid2X2, Landmark, LayoutGrid, Loader2, Lock, LockOpen, Maximize2, Minimize2, Moon, Plus, Redo2, Save, Search, Store, Sun, Undo2, X } from 'lucide-react';
import { AlbumElement, FrameElement, LayoutTemplate, Page, Point, asAlbumTemplate, asTemplate, formatMeasure, makeProject, pageWidth, photoUsage, photoUsageForAssets, setPageFramesLocked, uid } from '../domain/model';
import { clipPageToSafeArea, convertPage, halfCutLine, insidePage, safeRegions } from '../domain/geometry';
import { analyzeCutSelection, cutPath, linkCutPieces, recutCutTree, resizeGeometricLayout } from '../domain/cutLinks';
import { cutFrame, type CutExecutor } from '../domain/cutter';
import { DivisionDirection, divideFrame } from '../domain/division';
import { PhotoLibrary, PhotoReader, recommendedPhotoImportConcurrency } from '../io/photos';
import { chooseDirectory, download, loadTemplates, parseProject, parseTemplate, permission, readJson, readValue, safeName, storeValue } from '../io/storage';
import { ManagedPhotoFolder, PHOTO_FOLDERS_KEY, exclusiveFolderAssetIds, readPhotoFolder, restorePhotoFolders, storePhotoFolders } from '../io/photoFolders';
import { prepareProjectPackage, readProjectPackage, writeProjectPackage, type OpenedProjectPackage, type ProjectPackageProgress } from '../io/projectPackage';
import type { ExportKind } from '../io/export';
import { useHistory } from './useHistory';
import { useEditorActions } from './useEditorActions';
import { useFileSaveReminder } from './useFileSaveReminder';
import { FILE_SAVE_RECORD_KEY } from './fileSaveState';
import { LeftPanel, PagePreview, PagesPanel, PhotosPanel } from './Panels';
import { builtinLayouts } from './builtinLayouts';
import Canvas from './Canvas';
import Modal from './Modal';
import PrintShopModal from './PrintShopModal';
import PhotoAdjustmentsPanel from './PhotoAdjustmentsPanel';
import PhotoFolderManagerModal, { FolderRemovalDetails } from './PhotoFolderManagerModal';
import { usePhotoEdit } from './usePhotoEdit';
import { DEFAULT_SUPPORT_SETTINGS, type SupportSettings } from '../print-shops/domain';
import type { PublicTemplate } from '../templates/domain';
import { BUILTIN_FONTS, googleFontsStylesheet, uniqueFontFamilies } from '../fonts/domain';

type PublicTemplateCategory = { id: string; name: string };
type PublicTemplateCatalog = { categories: PublicTemplateCategory[]; templates: PublicTemplate[] };
const executeLocalCut = ((frame, start, end, gap) => cutFrame({ frame, start, end, gap })) satisfies CutExecutor;

export default function Editor() {
  useEffect(() => {
    const blockF12 = (event: KeyboardEvent) => { if (event.key === 'F12' || event.code === 'F12') { event.preventDefault(); event.stopImmediatePropagation(); } };
    window.addEventListener('keydown', blockF12, true);
    return () => window.removeEventListener('keydown', blockF12, true);
  }, []);
  const history = useHistory(), { project, current, apply } = history;
  const [ready, setReady] = useState(false), [pageId, setPageId] = useState(''), [selected, setSelected] = useState<string[]>([]);
  const [leftPanelTab, setLeftPanelTab] = useState<'build' | 'page'>('build');
  const [library, setLibrary] = useState<PhotoLibrary>(new Map()), libraryRef = useRef<PhotoLibrary>(new Map()), embeddedLibraryRef = useRef<PhotoLibrary>(new Map());
  const [embeddedPhotoIds, setEmbeddedPhotoIds] = useState<ReadonlySet<string>>(new Set());
  const [photoFolders, setPhotoFolders] = useState<ManagedPhotoFolder[]>([]), photoFoldersRef = useRef<ManagedPhotoFolder[]>([]), folderLibrariesRef = useRef<Map<string, PhotoLibrary>>(new Map());
  const [theme, setTheme] = useState<'light' | 'gray'>('light'), [toast, setToast] = useState(''), toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tool, setTool] = useState<'select' | 'hand' | 'cut' | 'half-cut'>('select'), [cutGap, setCutGap] = useState(9), [duplicateGap, setDuplicateGap] = useState(9), [duplicateDirection, setDuplicateDirection] = useState<'left' | 'right' | 'up' | 'down'>('right'), [busyCut, setBusyCut] = useState(false), [busySpacer, setBusySpacer] = useState(false);
  const [importing, setImporting] = useState(''), [importingFolderId, setImportingFolderId] = useState<string>(), [selectedPhotos, setSelectedPhotos] = useState<string[]>([]), [backgroundMode, setBackgroundMode] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false), [printShopsOpen, setPrintShopsOpen] = useState(false), [templates, setTemplates] = useState<LayoutTemplate[]>([]), [templateFolder, setTemplateFolder] = useState<FileSystemDirectoryHandle | undefined>(), [templateTab, setTemplateTab] = useState<'starter' | 'saved' | 'more'>('starter');
  const [onlineCatalog, setOnlineCatalog] = useState<PublicTemplateCatalog>({ categories: [], templates: [] }), [onlineStatus, setOnlineStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle'), [onlineCategory, setOnlineCategory] = useState('all'), [onlineQuery, setOnlineQuery] = useState(''), [loadingOnlineId, setLoadingOnlineId] = useState('');
  const [googleFonts, setGoogleFonts] = useState<string[]>([]);
  const [onlineDrilldown, setOnlineDrilldown] = useState<{ template: LayoutTemplate; summary: PublicTemplate } | null>(null);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false), [saveTemplateScope, setSaveTemplateScope] = useState<'current' | 'all' | null>(null), [templateName, setTemplateName] = useState(''), [savingTemplate, setSavingTemplate] = useState(false);
  const [modeOpen, setModeOpen] = useState(false), [modeChoice, setModeChoice] = useState<'blank' | 'left' | 'right'>('left');
  const [confirm, setConfirm] = useState<{ title: string; message: string; action: () => void } | null>(null);
  const [paddingWarning, setPaddingWarning] = useState<{ patch: Partial<Page>; frames: number; texts: number } | null>(null);
  const [menu, setMenu] = useState<'file' | 'export' | null>(null), [helpOpen, setHelpOpen] = useState(false), [coffeeOpen, setCoffeeOpen] = useState(false), [saveWarningOpen, setSaveWarningOpen] = useState(false), [folderManagerOpen, setFolderManagerOpen] = useState(false), [folderRemoval, setFolderRemoval] = useState<FolderRemovalDetails>(), [isFullscreen, setIsFullscreen] = useState(false), [previewPageId, setPreviewPageId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<{ kind: ExportKind; done: number; total: number } | null>(null), abortExport = useRef<AbortController | null>(null);
  const [packageTransfer, setPackageTransfer] = useState<({ kind: 'saving' | 'opening' } & ProjectPackageProgress) | null>(null), packageAbort = useRef<AbortController | null>(null);
  const [saveStatus, setSaveStatus] = useState('Checking browser autosave…'), importingRef = useRef(false), alive = useRef(true), projectInput = useRef<HTMLInputElement>(null);
  const fileSave = useFileSaveReminder();
  const page = project.pages.find(p => p.id === pageId) ?? project.pages[0];
  const previewMode = previewPageId !== null, previewPage = project.pages.find(p => p.id === previewPageId) ?? page, previewIndex = project.pages.findIndex(p => p.id === previewPage.id);
  const usage = useMemo(() => photoUsage(project), [project]);
  const visiblePhotoIds = useMemo(() => new Set([...embeddedPhotoIds, ...photoFolders.filter(folder => folder.show).flatMap(folder => folder.currentAssetIds)]), [embeddedPhotoIds, photoFolders]);
  const typefaces = useMemo(() => uniqueFontFamilies([...BUILTIN_FONTS, ...googleFonts]), [googleFonts]);
  const notify = useCallback((message: string) => { setToast(message); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 5500); }, []);
  const report = useCallback((error: unknown) => { if (error instanceof DOMException && error.name === 'AbortError') return; notify(error instanceof Error ? error.message : 'Something went wrong. Please try again.'); }, [notify]);
  const actions = useEditorActions(history, page, selected, setSelected, library, notify);
  function requestPageSettings(patch: Partial<Page>) {
    if (patch.padding !== undefined && patch.padding > page.padding) {
      const next = { ...page, ...patch }, regions = safeRegions(next);
      if (regions.every(region => region.right > region.x && region.bottom > region.y)) {
        const affected = page.elements.filter(element => !insidePage(element, next));
        if (affected.length) {
          setPaddingWarning({ patch, frames: affected.filter(element => element.type === 'frame').length, texts: affected.filter(element => element.type === 'text').length });
          return;
        }
      }
    }
    actions.updatePageSettings({ ...patch, clipContentToPadding: false });
  }
  const { photoDraft, setPhotoDraft, comparePhoto, setComparePhoto, begin: beginPhotoEdit, finish: finishPhotoEdit } = usePhotoEdit({ page, library, busy: !!(exporting || packageTransfer || busyCut || busySpacer || importing), onBegin: id => { setMenu(null); setTool('select'); setSelected([id]); setLeftPanelTab('build'); }, onChange: actions.setElements, notify });
  const selectPage = (id: string) => { setPageId(id); setSelected([]); setTool('select'); setBackgroundMode(false); };
  const selectAdjacentPage = (direction: -1 | 1) => { const index = project.pages.findIndex(item => item.id === page.id); if (index < 0) return; const next = Math.max(0, Math.min(project.pages.length - 1, index + direction)); selectPage(project.pages[next].id); requestAnimationFrame(() => document.querySelector(`[data-page-id="${project.pages[next].id}"]`)?.scrollIntoView({ block: 'nearest' })); };
  const enterPreview = () => { setMenu(null); setToast(''); setPreviewPageId(page.id); };
  const exitPreview = () => { const target = previewPageId; setPreviewPageId(null); if (target && target !== page.id) selectPage(target); };
  const movePreview = (direction: number) => { const next = previewIndex + direction; if (next >= 0 && next < project.pages.length) setPreviewPageId(project.pages[next].id); };
  function toggleCutterMode() { if (tool === 'cut') { setTool('select'); return; } const target = actions.selectedElements.length === 1 && actions.selectedElements[0]?.type === 'frame' && !actions.selectedElements[0].photo; if (target) setTool('cut'); else notify('Select one empty frame first, then start the cutter.'); }
  function toggleHalfCutterMode() { if (tool === 'half-cut') { setTool('select'); return; } const target = actions.selectedElements.length === 1 && actions.selectedElements[0]?.type === 'frame' && !actions.selectedElements[0].photo; if (target) setTool('half-cut'); else notify('Select one empty frame first, then start the 50/50 cutter.'); }
  const commitPhotoFolders = useCallback(async (next: ManagedPhotoFolder[]) => {
    photoFoldersRef.current = next; setPhotoFolders(next);
    await storeValue(PHOTO_FOLDERS_KEY, storePhotoFolders(next));
  }, []);
  useEffect(() => {
    let controller: AbortController | undefined;
    const refreshFonts = () => {
      controller?.abort(); controller = new AbortController();
      fetch('/api/fonts', { signal: controller.signal }).then(response => response.ok ? response.json() as Promise<{ fonts: string[] }> : Promise.reject()).then(payload => setGoogleFonts(payload.fonts)).catch(() => {});
    };
    const refreshVisibleFonts = () => { if (document.visibilityState === 'visible') refreshFonts(); };
    refreshFonts();
    window.addEventListener('focus', refreshFonts); document.addEventListener('visibilitychange', refreshVisibleFonts);
    return () => { controller?.abort(); window.removeEventListener('focus', refreshFonts); document.removeEventListener('visibilitychange', refreshVisibleFonts); };
  }, []);
  useEffect(() => {
    const id = 'customalboom-google-fonts';
    document.getElementById(id)?.remove();
    if (!googleFonts.length) return;
    const link = document.createElement('link'); link.id = id; link.rel = 'stylesheet'; link.href = googleFontsStylesheet(googleFonts); document.head.append(link);
    return () => link.remove();
  }, [googleFonts]);
  const rebuildCombinedLibrary = useCallback((folders = photoFoldersRef.current) => {
    const combined: PhotoLibrary = new Map(embeddedLibraryRef.current);
    for (const folder of folders) for (const [id, photo] of folderLibrariesRef.current.get(folder.id) ?? []) if (!combined.has(id)) combined.set(id, photo);
    libraryRef.current = combined; setLibrary(new Map(combined));
  }, []);
  const replaceEmbeddedLibrary = useCallback((next: PhotoLibrary) => {
    embeddedLibraryRef.current.forEach(photo => URL.revokeObjectURL(photo.previewUrl));
    embeddedLibraryRef.current = next; setEmbeddedPhotoIds(new Set(next.keys())); rebuildCombinedLibrary();
  }, [rebuildCombinedLibrary]);
  const importFolder = useCallback(async (folderId: string, promptPermission = true) => {
    if (importingRef.current) return;
    const folder = photoFoldersRef.current.find(item => item.id === folderId); if (!folder) return;
    if (!await permission(folder.handle, 'read', promptPermission)) {
      await commitPhotoFolders(photoFoldersRef.current.map(item => item.id === folderId ? { ...item, status: 'reconnect' } : item)); return;
    }
    importingRef.current = true; setImportingFolderId(folderId); setImporting(`Reading ${folder.name}…`);
    const readers: PhotoReader[] = [], nextLibrary: PhotoLibrary = new Map(), assets: typeof project.assets = [], seen = new Set<string>(); let count = 0, checked = 0, failed = 0, limited = 0, lastProgressAt = 0;
    const otherAssetIds = new Set([...embeddedLibraryRef.current.keys(), ...[...folderLibrariesRef.current.entries()].filter(([id]) => id !== folderId).flatMap(([, photos]) => [...photos.keys()])]), acceptedAssetIds = new Set(otherAssetIds);
    try {
      const iterator = readPhotoFolder(folder.handle)[Symbol.asyncIterator](), concurrency = recommendedPhotoImportConcurrency();
      for (let index = 0; index < concurrency; index++) readers.push(new PhotoReader());
      const publishProgress = () => { const now = performance.now(); if (now - lastProgressAt < 150) return; lastProgressAt = now; if (alive.current) setImporting(`Reading ${folder.name} · ${count} ready · ${checked} checked`); };
      await Promise.all(readers.map(async reader => {
        while (alive.current) {
          const entry = await iterator.next(); if (entry.done) return;
          try {
            const photo = await reader.read(entry.value.file, entry.value.path);
            if (seen.has(photo.ref.id)) { URL.revokeObjectURL(photo.previewUrl); continue; }
            seen.add(photo.ref.id);
            if (!acceptedAssetIds.has(photo.ref.id) && acceptedAssetIds.size >= 10000) { URL.revokeObjectURL(photo.previewUrl); limited++; continue; }
            acceptedAssetIds.add(photo.ref.id); nextLibrary.set(photo.ref.id, photo); assets.push(photo.ref); count++;
          } catch { failed++; }
          finally { checked++; publishProgress(); }
        }
      }));
      if (!alive.current) return;
      const previous = folderLibrariesRef.current.get(folderId); folderLibrariesRef.current.set(folderId, nextLibrary); previous?.forEach(photo => URL.revokeObjectURL(photo.previewUrl));
      const knownAssetIds = [...new Set([...folder.knownAssetIds, ...nextLibrary.keys()])];
      const nextFolders = photoFoldersRef.current.map(item => item.id === folderId ? { ...item, name: folder.handle.name, knownAssetIds, currentAssetIds: [...nextLibrary.keys()], photoCount: nextLibrary.size, status: 'connected' as const } : item);
      await commitPhotoFolders(nextFolders); rebuildCombinedLibrary(nextFolders); history.mergeAssets(assets);
      notify(`${count} photo${count === 1 ? '' : 's'} ready from ${folder.name}${failed ? ` · ${failed} unreadable file${failed === 1 ? '' : 's'} skipped` : ''}${limited ? ` · ${limited} over the 10,000-photo limit` : ''}.`);
    } catch (error) {
      nextLibrary.forEach(photo => URL.revokeObjectURL(photo.previewUrl));
      await commitPhotoFolders(photoFoldersRef.current.map(item => item.id === folderId ? { ...item, status: 'reconnect' } : item)); report(error);
    } finally { readers.forEach(reader => reader.dispose()); importingRef.current = false; if (alive.current) { setImporting(''); setImportingFolderId(undefined); } }
  }, [commitPhotoFolders, history.mergeAssets, notify, rebuildCombinedLibrary, report]);
  async function addPhotoFolder() {
    try {
      const handle = await chooseDirectory();
      for (const existing of photoFoldersRef.current) if (await existing.handle.isSameEntry(handle)) { notify(`${existing.name} is already managed.`); await importFolder(existing.id); return; }
      const folder: ManagedPhotoFolder = { id: uid(), name: handle.name, handle, show: true, knownAssetIds: [], currentAssetIds: [], photoCount: 0, status: 'connected' };
      await commitPhotoFolders([...photoFoldersRef.current, folder]); await importFolder(folder.id);
    } catch (error) { report(error); }
  }
  function togglePhotoFolder(id: string, show: boolean) { void commitPhotoFolders(photoFoldersRef.current.map(folder => folder.id === id ? { ...folder, show } : folder)).catch(report); }
  function requestFolderRemoval(id: string) {
    const folder = photoFoldersRef.current.find(item => item.id === id); if (!folder) return;
    const exclusive = exclusiveFolderAssetIds(folder, photoFoldersRef.current.filter(item => item.id !== id)), counts = photoUsageForAssets(current.current, exclusive);
    setFolderRemoval({ folder, ...counts, exclusivePhotos: exclusive.size });
  }
  async function confirmFolderRemoval() {
    if (!folderRemoval) return;
    const remaining = photoFoldersRef.current.filter(item => item.id !== folderRemoval.folder.id), exclusive = exclusiveFolderAssetIds(folderRemoval.folder, remaining);
    history.purgeAssets(exclusive); folderLibrariesRef.current.get(folderRemoval.folder.id)?.forEach(photo => URL.revokeObjectURL(photo.previewUrl)); folderLibrariesRef.current.delete(folderRemoval.folder.id);
    await commitPhotoFolders(remaining); rebuildCombinedLibrary(remaining); setSelectedPhotos(ids => ids.filter(id => !exclusive.has(id))); setFolderRemoval(undefined);
    notify(`${folderRemoval.folder.name} removed${folderRemoval.frames + folderRemoval.backgrounds ? ' with its placed photos' : ''}.`);
  }
  useEffect(() => {
    alive.current = true; let cancelled = false;
    (async () => {
      try {
        const saved = await readValue<unknown>('project'); let restoredProject = current.current; if (saved && !cancelled) { const p = parseProject(saved); restoredProject = p; history.replace(p); setPageId(p.pages[0].id); }
        const fileRecord = await readValue<unknown>(FILE_SAVE_RECORD_KEY).catch(() => undefined);
        if (!cancelled) fileSave.reset(restoredProject, !!saved, fileRecord);
        const savedTheme = await readValue<'light' | 'gray'>('theme'); if (savedTheme && !cancelled) setTheme(savedTheme);
        const tf = await readValue<FileSystemDirectoryHandle>('templateFolder'); if (tf && !cancelled) { setTemplateFolder(tf); if (await permission(tf, 'read', false)) setTemplates((await loadTemplates(tf)).templates); }
        const storedFolders = await readValue<unknown>(PHOTO_FOLDERS_KEY); let folders = restorePhotoFolders(storedFolders);
        if (storedFolders === undefined && !folders.length) {
          const legacy = await readValue<FileSystemDirectoryHandle>('photoFolder');
          if (legacy) { const knownAssetIds = restoredProject.assets.map(asset => asset.id); folders = [{ id: uid(), name: legacy.name, handle: legacy, show: true, knownAssetIds, status: 'reconnect', currentAssetIds: [], photoCount: knownAssetIds.length }]; await storeValue(PHOTO_FOLDERS_KEY, storePhotoFolders(folders)); }
          else await storeValue(PHOTO_FOLDERS_KEY, storePhotoFolders([]));
        }
        const checked: ManagedPhotoFolder[] = [];
        for (const folder of folders) checked.push({ ...folder, status: await permission(folder.handle, 'read', false) ? 'connected' : 'reconnect' });
        if (!cancelled) { photoFoldersRef.current = checked; setPhotoFolders(checked); void (async () => { for (const folder of checked) if (folder.status === 'connected' && !cancelled) await importFolder(folder.id, false); })(); }
      } catch { if (!cancelled) { fileSave.reset(current.current); notify('Your previous browser save could not be restored. You can still open a project file.'); } }
      finally { if (!cancelled) setReady(true); }
    })();
    return () => { cancelled = true; alive.current = false; embeddedLibraryRef.current.forEach(photo => URL.revokeObjectURL(photo.previewUrl)); };
  }, []);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const pending = setTimeout(() => setSaveStatus('Autosaving in browser…'), 0);
    const timer = setTimeout(() => {
      fileSave.observe(project);
      storeValue('project', project).then(() => { if (!cancelled) setSaveStatus('Autosaved in browser'); }).catch(() => {
        if (!cancelled) { setSaveStatus('Browser autosave unavailable'); notify('Browser storage is unavailable or full. Save a project file to keep your work.'); }
      });
    }, 650);
    return () => { cancelled = true; clearTimeout(pending); clearTimeout(timer); };
  }, [project, ready, notify, fileSave.observe]);
  useEffect(() => { if (ready) storeValue('theme', theme).catch(() => {}); }, [theme, ready]);
  useEffect(() => { setSelected(ids => ids.filter(id => page.elements.some(e => e.id === id))); }, [page]);
  useEffect(() => { setSelectedPhotos(ids => ids.filter(id => library.has(id) && visiblePhotoIds.has(id))); }, [library, visiblePhotoIds]);
  useEffect(() => { const sync = () => setIsFullscreen(!!document.fullscreenElement); sync(); document.addEventListener('fullscreenchange', sync); return () => document.removeEventListener('fullscreenchange', sync); }, []);
  useEffect(() => { function key(e: KeyboardEvent) { const pressed = e.key.toLowerCase(); if ((e.ctrlKey || e.metaKey) && pressed === 'p') { e.preventDefault(); if (document.querySelector('[role="dialog"]')) return; if (photoDraft) { notify('Finish or cancel Photo Adjustments before opening Preview.'); return; } previewMode ? exitPreview() : enterPreview(); return; } if (photoDraft) return; if ((e.ctrlKey || e.metaKey) && pressed === 'm') { e.preventDefault(); setHelpOpen(open => !open); return; } if ((e.ctrlKey || e.metaKey) && pressed === 'f') { e.preventDefault(); void toggleFullscreen(); return; } if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName) || document.querySelector('[role="dialog"]')) return; if ((e.ctrlKey || e.metaKey) && pressed === 'z') { e.preventDefault(); e.shiftKey ? history.redo() : history.undo(); } else if ((e.ctrlKey || e.metaKey) && pressed === 'y') { e.preventDefault(); history.redo(); } else if ((e.ctrlKey || e.metaKey) && pressed === 's') { e.preventDefault(); saveProject(); } else if ((e.ctrlKey || e.metaKey) && pressed === 'k') { e.preventDefault(); actions.unionFrames(); } else if ((e.ctrlKey || e.metaKey) && pressed === 'g') { e.preventDefault(); actions.toggleGroup(); } else if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); selectAdjacentPage(e.key === 'ArrowUp' ? -1 : 1); } else if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'PageUp' || e.key === 'PageDown')) { e.preventDefault(); selectAdjacentPage(e.key === 'PageUp' ? -1 : 1); } else if (!e.ctrlKey && !e.metaKey && !e.altKey && pressed === 's') { e.preventDefault(); actions.addElement('rect'); setTool('select'); setLeftPanelTab('build'); } else if (!e.ctrlKey && !e.metaKey && !e.altKey && pressed === 'c') { e.preventDefault(); toggleCutterMode(); } else if (!e.ctrlKey && !e.metaKey && !e.altKey && pressed === 'd') { e.preventDefault(); toggleHalfCutterMode(); } else if (!e.ctrlKey && !e.metaKey && !e.altKey && pressed === 'p') { e.preventDefault(); actions.shortcutAlign('page'); } else if (!e.ctrlKey && !e.metaKey && !e.altKey && pressed === 'v') { e.preventDefault(); actions.shortcutAlign('middle'); } else if (!e.ctrlKey && !e.metaKey && !e.altKey && pressed === 'f') { e.preventDefault(); actions.align('center'); } else if (!e.ctrlKey && !e.metaKey && !e.altKey && pressed === 'z') { e.preventDefault(); actions.shortcutAlign('leftCenter'); } else if (!e.ctrlKey && !e.metaKey && !e.altKey && pressed === 'x') { e.preventDefault(); actions.shortcutAlign('rightCenter'); } else if (!e.ctrlKey && !e.metaKey && !e.altKey && pressed === 't') { e.preventDefault(); actions.align('top'); } else if (!e.ctrlKey && !e.metaKey && !e.altKey && pressed === 'b') { e.preventDefault(); actions.align('bottom'); } else if (!e.ctrlKey && !e.metaKey && !e.altKey && pressed === 'l') { e.preventDefault(); actions.align('left'); } else if (!e.ctrlKey && !e.metaKey && !e.altKey && pressed === 'r') { e.preventDefault(); actions.align('right'); } else if (!e.ctrlKey && !e.metaKey && !e.altKey && pressed === '1') { e.preventDefault(); actions.align('distributeX'); } else if (!e.ctrlKey && !e.metaKey && !e.altKey && pressed === '2') { e.preventDefault(); actions.align('distributeY'); } else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); actions.deleteElements(); } else if (e.key === 'Escape') { setSelected([]); setSelectedPhotos([]); setTool('select'); setMenu(null); setBackgroundMode(false); } } window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); });
  useEffect(() => { function key(e: KeyboardEvent) { if (photoDraft || previewMode || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'd') return; if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName) || document.querySelector('[role="dialog"]')) return; e.preventDefault(); e.stopImmediatePropagation(); actions.duplicatePosition(duplicateDirection, duplicateGap); } window.addEventListener('keydown', key, true); return () => window.removeEventListener('keydown', key, true); });
  useEffect(() => { function key(e: KeyboardEvent) { if (photoDraft || e.isComposing) return; if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName) || document.querySelector('[role="dialog"]')) return; const pressed = e.key.toLowerCase(); if ((e.ctrlKey || e.metaKey) && pressed === 'u') { e.preventDefault(); actions.ungroupFrames(); } else if (!e.ctrlKey && !e.metaKey && !e.altKey && pressed === 'e') { e.preventDefault(); actions.fillRectangleSide(); } else if (!e.ctrlKey && !e.metaKey && !e.altKey && pressed === 'o') { e.preventDefault(); actions.removePhotos(); } else if (!e.ctrlKey && !e.metaKey && !e.altKey && pressed === 'q' && !previewMode && !e.repeat) { e.preventDefault(); actions.cycleSelectedPhotos(); } else if (!e.ctrlKey && !e.metaKey && !e.altKey && pressed === 'i' && !previewMode && !e.repeat) { e.preventDefault(); actions.toggleFrameLock(); } else if (!e.ctrlKey && !e.metaKey && !e.altKey && pressed === '`') { e.preventDefault(); void toggleFullscreen(); } } window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); });
  useEffect(() => {
    if (!previewMode) return;
    const plainShortcuts = new Set(['pageup', 'pagedown', 's', 'c', 'd', 'p', 'v', 'f', 'z', 'x', 't', 'b', 'l', 'r', 'e', 'o', 'q', 'i', '1', '2', 'delete', 'backspace', 'f4', ' ']), modifiedShortcuts = new Set(['m', 'z', 'y', 's', 'g', 'u', 'd', 'k']);
    function key(e: KeyboardEvent) {
      const pressed = e.key.toLowerCase();
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); exitPreview(); return; }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); movePreview(e.key === 'ArrowLeft' ? -1 : 1); return; }
      if ((e.ctrlKey || e.metaKey) ? modifiedShortcuts.has(pressed) : !e.altKey && plainShortcuts.has(pressed)) { e.preventDefault(); e.stopImmediatePropagation(); }
    }
    window.addEventListener('keydown', key, true); return () => window.removeEventListener('keydown', key, true);
  });
  async function toggleFullscreen() { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { notify('Full screen is unavailable in this browser window.'); } }
  async function cut(start: Point, end: Point) {
    const frame = actions.selectedElements.length === 1 ? actions.selectedElements[0] : undefined;
    if (!frame || frame.type !== 'frame' || frame.locked || frame.photo || frame.geometry.paths) return notify(frame?.type === 'frame' && frame.locked ? 'Unlock this frame before cutting it.' : 'Select one empty non-union frame before using the cutter.');
    if (busyCut) return; setBusyCut(true); const originalPage = page.id, originalFrame = JSON.stringify(frame);
    try {
      const result = executeLocalCut(frame, start, end, cutGap);
      const active = current.current.pages.find(p => p.id === originalPage), existing = active?.elements.find(e => e.id === frame.id);
      if (JSON.stringify(existing) !== originalFrame) throw new Error('The frame changed while cutting. Please try again.');
      const operationId = uid(), linked = linkCutPieces(frame, start, end, cutGap, result, operationId), pieces = linked.map(piece => ({ ...piece, id: uid() }));
      apply(doc => ({ ...doc, pages: doc.pages.map(p => p.id === originalPage ? { ...p, elements: p.elements.flatMap<AlbumElement>(element => element.id === frame.id ? pieces : [element]) } : p) })); setSelected(pieces.map(p => p.id)); setTool('select');
    } catch (e) { report(e); } finally { setBusyCut(false); }
  }
  function halfCut(direction: 'horizontal' | 'vertical') {
    const frame = actions.selectedElements.length === 1 ? actions.selectedElements[0] : undefined;
    if (!frame || frame.type !== 'frame' || frame.locked || frame.photo || frame.geometry.paths) return notify(frame?.type === 'frame' && frame.locked ? 'Unlock this frame before cutting it.' : 'Select one empty non-union frame to cut it in half.');
    const [start, end] = halfCutLine(frame, direction); void cut(start, end);
  }
  async function divide(direction: DivisionDirection, count: number) {
    const frame = actions.selectedElements.length === 1 ? actions.selectedElements[0] : undefined;
    if (!frame || frame.type !== 'frame' || frame.locked || frame.photo || frame.geometry.paths) return notify(frame?.type === 'frame' && frame.locked ? 'Unlock this frame before dividing it.' : 'Select one empty non-union frame before using Division.');
    if (busyCut) return;
    setBusyCut(true); const originalPage = page.id, originalFrame = JSON.stringify(frame);
    try {
      const pieces = await divideFrame(frame, count, direction, cutGap, executeLocalCut, uid);
      const active = current.current.pages.find(item => item.id === originalPage), existing = active?.elements.find(element => element.id === frame.id);
      if (JSON.stringify(existing) !== originalFrame) throw new Error('The frame changed while dividing. Please try again.');
      apply(doc => ({ ...doc, pages: doc.pages.map(item => item.id === originalPage ? { ...item, elements: item.elements.flatMap<AlbumElement>(element => element.id === frame.id ? pieces : [element]) } : item) }));
      setSelected(pieces.map(piece => piece.id)); setTool('select');
      notify(`Frame divided into ${count} equal ${direction === 'horizontal' ? 'columns' : 'rows'} with a ${formatMeasure(cutGap, project.unit)} ${project.unit} gap.`);
    } catch (error) { report(error); } finally { setBusyCut(false); }
  }
  async function magicSpace(gap: number) {
    const frames = page.elements.filter((element): element is FrameElement => element.type === 'frame'), selection = analyzeCutSelection(frames, selected);
    if (frames.some(frame => frame.locked && selected.includes(frame.id))) return notify('Unlock the selected frames before changing their spacing.');
    if (!selection.valid) return notify(selection.reason);
    if (busySpacer) return;
    setBusySpacer(true); const originalPage = page.id, originals = selection.mode === 'history' ? selection.trees.flatMap(tree => tree.frames) : selection.layouts.flatMap(layout => layout.frames), invalidatedRoots = new Set(selection.mode === 'geometry' ? originals.flatMap(frame => cutPath(frame) ? [cutPath(frame)![0].operationId] : []) : []);
    try {
      const updateMaps = selection.mode === 'history' ? await Promise.all(selection.trees.map(tree => recutCutTree(tree, gap, executeLocalCut))) : selection.layouts.map(layout => resizeGeometricLayout(layout, gap, frame => frame.photo ? libraryRef.current.get(frame.photo.assetId)?.ref : undefined));
      const active = current.current.pages.find(item => item.id === originalPage);
      if (!active || originals.some(original => JSON.stringify(active.elements.find(element => element.id === original.id)) !== JSON.stringify(original))) throw new Error('A selected frame changed while spacing. Please try again.');
      const updates = new Map<string, FrameElement>(); updateMaps.forEach(map => map.forEach((frame, id) => updates.set(id, frame)));
      apply(doc => ({ ...doc, pages: doc.pages.map(item => item.id === originalPage ? { ...item, elements: item.elements.map(element => updates.get(element.id) ?? (element.type === 'frame' && cutPath(element) && invalidatedRoots.has(cutPath(element)![0].operationId) ? { ...element, cutLink: undefined, cutPath: undefined } : element)) } : item) }));
      const cuts = selection.mode === 'history' ? selection.trees.reduce((total, tree) => total + tree.operations.size, 0) : selection.gaps.length;
      notify(`${cuts} cut${cuts === 1 ? '' : 's'} forced to ${formatMeasure(gap, project.unit)} ${project.unit}.`);
    } catch (error) { report(error); } finally { setBusySpacer(false); }
  }
  function saveProject() { setMenu(null); setSaveWarningOpen(true); }
  function downloadProject() {
    try {
      const snapshot = current.current;
      download(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }), `${safeName(snapshot.name)}.can`);
      fileSave.record(snapshot, current.current, '.can', 'downloaded'); setSaveWarningOpen(false);
      notify('Project download started. Keep the .can file from your browser downloads; photos are not included.');
    } catch (error) { report(error); }
  }
  async function saveProjectWithPhotos() {
    setMenu(null);
    try {
      if (!window.showSaveFilePicker) throw new Error('Save with photos requires Chrome or Edge file access.');
      const snapshot = structuredClone(current.current), prepared = prepareProjectPackage(snapshot, libraryRef.current);
      const handle = await window.showSaveFilePicker({ suggestedName: `${safeName(snapshot.name)}.canpack`, types: [{ description: 'CustomAlboom project with photos', accept: { 'application/zip': ['.canpack'] } }] });
      const stream = await handle.createWritable(), controller = new AbortController(); packageAbort.current = controller;
      setPackageTransfer({ kind: 'saving', completed: 0, total: prepared.photos.length + 2, bytesDone: 0, bytesTotal: prepared.bytesTotal });
      await writeProjectPackage(snapshot, libraryRef.current, { write: chunk => stream.write(chunk), close: () => stream.close(), abort: reason => stream.abort(reason) }, { signal: controller.signal, onProgress: progress => setPackageTransfer({ kind: 'saving', ...progress }) });
      fileSave.record(snapshot, current.current, '.canpack', 'saved');
      notify(`Project saved with ${prepared.photos.length} used photo${prepared.photos.length === 1 ? '' : 's'}.`);
    } catch (error) { report(error); }
    finally { packageAbort.current = null; setPackageTransfer(null); }
  }
  async function loadProjectPackage(opened: OpenedProjectPackage) {
    const controller = new AbortController(), nextLibrary: PhotoLibrary = new Map(), bytesTotal = opened.photos.reduce((sum, photo) => sum + photo.file.size, 0); let bytesDone = 0;
    packageAbort.current = controller; setPackageTransfer({ kind: 'opening', completed: 0, total: opened.photos.length, bytesDone: 0, bytesTotal });
    let reader: PhotoReader | undefined;
    try {
      if (opened.photos.length) { reader = new PhotoReader(); controller.signal.addEventListener('abort', () => reader?.dispose(), { once: true }); }
      for (let index = 0; index < opened.photos.length; index++) {
        if (controller.signal.aborted) throw controller.signal.reason ?? new DOMException('The operation was cancelled.', 'AbortError');
        const packaged = opened.photos[index], photo = await reader!.read(packaged.file, packaged.asset.entry, packaged.asset.id);
        nextLibrary.set(photo.ref.id, photo); bytesDone += packaged.file.size;
        setPackageTransfer({ kind: 'opening', completed: index + 1, total: opened.photos.length, bytesDone, bytesTotal });
      }
      history.replace(opened.project); selectPage(opened.project.pages[0].id); replaceEmbeddedLibrary(nextLibrary);
      fileSave.record(opened.project, opened.project, '.canpack', 'opened');
      notify(`Portable project opened with ${opened.photos.length} embedded photo${opened.photos.length === 1 ? '' : 's'}.`);
    } catch (error) { nextLibrary.forEach(photo => URL.revokeObjectURL(photo.previewUrl)); if (!controller.signal.aborted) report(error); }
    finally { reader?.dispose(); packageAbort.current = null; setPackageTransfer(null); }
  }
  async function openProject(file?: File) {
    if (!file) return;
    try {
      if (file.name.toLowerCase().endsWith('.canpack')) {
        const controller = new AbortController(); packageAbort.current = controller; setPackageTransfer({ kind: 'opening', completed: 0, total: 1, bytesDone: 0, bytesTotal: 0 });
        let opened: OpenedProjectPackage;
        try { opened = await readProjectPackage(file, { signal: controller.signal, onProgress: progress => setPackageTransfer({ kind: 'opening', ...progress }) }); }
        finally { packageAbort.current = null; setPackageTransfer(null); }
        setConfirm({ title: 'Open this portable album?', message: `This replaces the current album and loads ${opened.photos.length} embedded photo${opened.photos.length === 1 ? '' : 's'}. Save your current project first if you want to keep a separate copy.`, action: () => void loadProjectPackage(opened) });
      } else {
        const p = parseProject(await readJson(file));
        setConfirm({ title: 'Open this album?', message: 'This replaces the current album. Save your current project first if you want to keep a separate copy.', action: () => { replaceEmbeddedLibrary(new Map()); history.replace(p); fileSave.record(p, p, '.can', 'opened'); selectPage(p.pages[0].id); notify('Album opened. Reopen the photo folder if any photos are missing.'); } });
      }
    } catch (e) { report(e); }
    finally { if (projectInput.current) projectInput.current.value = ''; }
  }
  async function chooseTemplateFolder() { try { const directory = await chooseDirectory('readwrite'); setTemplateFolder(directory); await storeValue('templateFolder', directory); const loaded = await loadTemplates(directory); setTemplates(loaded.templates); setTemplateTab('saved'); if (loaded.errors.length) notify(`${loaded.errors.length} invalid template file(s) were skipped.`); } catch (e) { report(e); } }
  const loadOnlineTemplates = useCallback(async () => {
    setOnlineStatus('loading');
    try {
      const response = await fetch('/api/templates', { cache: 'no-store' }), body = await response.json() as PublicTemplateCatalog & { error?: string };
      if (!response.ok) throw new Error(body.error || 'More Templates could not be loaded.');
      setOnlineCatalog({ categories: body.categories, templates: body.templates }); setOnlineStatus('ready');
    } catch (error) { setOnlineStatus('error'); report(error); }
  }, [report]);
  useEffect(() => { if (layoutOpen && templateTab === 'more' && onlineStatus === 'idle') void loadOnlineTemplates(); }, [layoutOpen, templateTab, onlineStatus, loadOnlineTemplates]);
  async function saveTemplate() {
    if (!templateName.trim() || !saveTemplateScope) return; setSavingTemplate(true);
    try {
      const template = saveTemplateScope === 'current' ? asTemplate(page, templateName.trim()) : asAlbumTemplate(project.pages, templateName.trim()), name = `${safeName(template.name)}-${template.id.slice(0, 8)}`;
      download(new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' }), `${name}.lca`);
      setSaveTemplateOpen(false); notify(saveTemplateScope === 'current' ? 'Layout template downloaded as an .lca file.' : `${project.pages.length}-page album template downloaded as an .lca file.`);
    } catch (e) { report(e); } finally { setSavingTemplate(false); }
  }
  function applyTemplate(t: LayoutTemplate) {
    if (t.kind === 'album-template') {
      const action = () => { let next = structuredClone(t.page); next.id = page.id; next.elements.forEach(e => e.id = uid()); next = setPageFramesLocked(next, project.framesLocked); actions.updatePage(() => next); setSelected([]); setLayoutOpen(false); notify(`“${t.name}” applied. Drag photos into the frames or use Auto-fill.`); };
      if (page.elements.length || page.backgroundPhoto) setConfirm({ title: 'Apply this layout?', message: 'This replaces the current page layout and its photos, using the template’s size and page mode. You can undo this change.', action }); else action();
      return;
    }
    const action = () => { const pages = structuredClone(t.pages).map(item => ({ ...item, id: uid(), elements: item.elements.map(element => ({ ...element, id: uid(), ...(element.type === 'frame' ? { locked: project.framesLocked } : {}) })) })); apply(doc => ({ ...doc, pages })); setPageId(pages[0].id); setSelected([]); setLayoutOpen(false); notify(`“${t.name}” applied as ${pages.length} pages. Drag photos into the frames or use Auto-fill.`); };
    const hasContent = project.pages.some(item => item.elements.length || item.backgroundPhoto);
    if (hasContent || project.pages.length > 1) setConfirm({ title: 'Apply all page layouts?', message: `This replaces all ${project.pages.length} current pages with the ${t.pages.length}-page template. Photos placed on the current pages will be removed. You can undo this change once.`, action }); else action();
  }
  async function openOnlineTemplate(summary: PublicTemplate) {
    setLoadingOnlineId(summary.id);
    try {
      const response = await fetch(`/api/templates/${encodeURIComponent(summary.id)}`, { cache: 'no-store' }), body = await response.json() as { template?: unknown; error?: string };
      if (!response.ok || !body.template) throw new Error(body.error || 'Template could not be loaded.');
      setOnlineDrilldown({ template: parseTemplate(body.template), summary });
    } catch (error) { report(error); }
    finally { setLoadingOnlineId(''); }
  }
  function addOnlinePages(source: Page[], templateName: string) {
    const pages = structuredClone(source).map(item => ({ ...item, id: uid(), elements: item.elements.map(element => ({ ...element, id: uid(), ...(element.type === 'frame' ? { locked: project.framesLocked } : {}) })) }));
    apply(document => {
      const active = document.pages.findIndex(item => item.id === page.id), insertion = active < 0 ? document.pages.length : active + 1;
      return { ...document, pages: [...document.pages.slice(0, insertion), ...pages, ...document.pages.slice(insertion)] };
    });
    setPageId(pages[0].id); setSelected([]); setOnlineDrilldown(null); setLayoutOpen(false);
    notify(pages.length === 1 ? `One page from “${templateName}” was added after the active page.` : `${pages.length} pages from “${templateName}” were added after the active page.`);
  }
  async function startExport(kind: ExportKind) { setMenu(null); const controller = new AbortController(); abortExport.current = controller; setExporting({ kind, done: 0, total: kind === 'jpg' ? 1 : project.pages.length }); try { const { exportAlbum } = await import('../io/export'); await exportAlbum(structuredClone(project), structuredClone(page), library, kind, controller.signal, (done, total) => setExporting({ kind, done, total })); notify('Your export is ready.'); } catch (e) { report(e); } finally { setExporting(null); abortExport.current = null; } }
  function deletePage(id: string) { if (project.pages.length <= 1) return; setConfirm({ title: 'Remove this page?', message: 'Its layout will be removed from the album. You can restore it with Undo.', action: () => { apply(doc => ({ ...doc, pages: doc.pages.filter(p => p.id !== id) })); if (id === page.id) selectPage(project.pages.find(p => p.id !== id)!.id); } }); }
  const missing = project.assets.filter(a => usage.has(a.id) && !library.has(a.id)).length;
  const folderManagerBusy = !!(photoDraft || importing || exporting || packageTransfer);
  const layouts = useMemo(() => builtinLayouts(page), [page.baseWidth, page.height, page.mode, page.padding]);
  const filteredOnlineTemplates = useMemo(() => {
    const query = onlineQuery.trim().toLocaleLowerCase();
    return onlineCatalog.templates.filter(item => (onlineCategory === 'all' || item.categoryId === onlineCategory) && (!query || item.title.toLocaleLowerCase().includes(query)));
  }, [onlineCatalog.templates, onlineCategory, onlineQuery]);
  const showMode = () => { setModeChoice('left'); setModeOpen(true); };
  if (!ready) return <div className="loading-screen"><img className="loading-logo" src="/customalboom-logo.png" alt="" width={72} height={72}/><h1>CustomAlboom.com</h1><p>Preparing your workspace…</p><Loader2 className="spin" size={18}/></div>;
  return <main className={`editor theme-${theme}${previewMode ? ' preview-mode' : ''}${photoDraft ? ' photo-edit-mode' : ''}`} onContextMenu={event => event.preventDefault()}>
    <header className="app-header"><div className="brand brand-simple"><img className="brand-logo" src="/customalboom-logo.png" alt="" width={32} height={32}/><span>CustomAlboom.com</span></div><CoffeeSupportButton onClick={() => setCoffeeOpen(true)}/>
      <div className="document-title"><input aria-label="Album name" value={project.name} maxLength={120} onChange={e => apply(p => ({ ...p, name: e.target.value || 'Untitled album' }))}/><span><i/>{saveStatus}</span></div>
      <div className="header-actions"><button title={isFullscreen ? 'Exit full screen (Ctrl + F or `)' : 'Enter full screen (Ctrl + F or `)'} className="header-button fullscreen-button" onClick={toggleFullscreen}>{isFullscreen ? <Minimize2 size={15}/> : <Maximize2 size={15}/>} {isFullscreen ? 'Exit Full Screen' : 'Full Screen'}</button><button title={theme === 'light' ? 'Switch to Gray mode' : 'Switch to Light mode'} className="icon-button" onClick={() => setTheme(t => t === 'light' ? 'gray' : 'light')}>{theme === 'light' ? <Moon size={17}/> : <Sun size={17}/>}</button><button title="Editor help" className="icon-button" onClick={() => setHelpOpen(true)}><CircleHelp size={17}/></button><span className="separator"/><div className="menu-wrap"><button className="header-button" onClick={() => setMenu(menu === 'file' ? null : 'file')}><FolderOpen size={15}/> File <ChevronDown size={13}/></button>{menu === 'file' && <div className="dropdown"><button onClick={saveProject}><Save size={15}/><span>Save project<small>Layout only · small .can file</small></span><kbd>Ctrl S</kbd></button><button onClick={() => void saveProjectWithPhotos()}><FileArchive size={15}/><span>Save project with photos<small>Used originals · portable .canpack</small></span></button><button onClick={() => { projectInput.current?.click(); setMenu(null); }}><FolderOpen size={15}/>Open project</button><button onClick={() => { setMenu(null); setConfirm({ title: 'Start a new album?', message: 'Save your current album as a project file before starting fresh.', action: () => { const p = makeProject(); replaceEmbeddedLibrary(new Map()); history.replace(p); fileSave.reset(p); selectPage(p.pages[0].id); } }); }}><FilePlus2 size={15}/>New album</button></div>}</div>
      <div className="menu-wrap"><button className="primary export-button" onClick={() => setMenu(menu === 'export' ? null : 'export')}><ArrowDownToLine size={15}/> Export <ChevronDown size={13}/></button>{menu === 'export' && <div className="dropdown export-menu"><button className="coffee-export-banner" onClick={() => { setMenu(null); setCoffeeOpen(true); }}><span><strong>Belanjalah saya<br/>kopi plzzz..</strong></span><img src="/coffee-cat-wink.png" alt=""/></button><button onClick={() => startExport('jpg')}><FileImage size={17}/><span>Current page JPG<small>{page.dpi} DPI · high quality</small></span></button><button onClick={() => startExport('zip')}><Grid2X2 size={17}/><span>All pages as JPG<small>Numbered images in a ZIP</small></span></button><button onClick={() => startExport('pdf')}><FileText size={17}/><span>Album PDF<small>Original page sizes</small></span></button></div>}</div></div>
    </header>
    <div className="workspace-toolbar"><div className="canvas-toolbar"><div className="history-buttons"><button title="Undo (Ctrl Z)" disabled={!history.canUndo} onClick={history.undo}><Undo2 size={16}/></button><button title="Redo (Ctrl Shift Z)" disabled={!history.canRedo} onClick={history.redo}><Redo2 size={16}/></button><span className="separator"/><span className="page-dimensions">{formatMeasure(page.height, project.unit)} × {formatMeasure(pageWidth(page), project.unit)} {project.unit}<small>{page.mode === 'spread' ? 'SPREAD' : 'SINGLE'}</small><small>{page.dpi} DPI</small></span><button className="preview-button" title="Toggle Preview (Ctrl + P)" onClick={enterPreview}><Eye size={14}/> Preview</button>{page.mode === 'spread' && <button className="flip-side-button" title="Mirror layout positions across the spread without flipping photos" onClick={actions.flipSide}><ArrowLeftRight size={14}/> Flip Side</button>}<button className={`frame-lock-button${project.framesLocked ? ' active' : ''}`} title={project.framesLocked ? 'Allow every frame in this album to move and resize (I)' : 'Prevent every frame in this album, including new frames, from moving or resizing (I)'} aria-pressed={project.framesLocked} onClick={actions.toggleFrameLock}>{project.framesLocked ? <LockOpen size={14}/> : <Lock size={14}/>} {project.framesLocked ? 'Unlock Frame' : 'Lock Frame'}</button></div><div className="layout-actions"><button className="text-button" onClick={() => { setTemplateName(''); setSaveTemplateScope(null); setSaveTemplateOpen(true); }}><Save size={14}/> Save layout</button><button className="layout-button" onClick={() => setLayoutOpen(true)}><LayoutGrid size={15}/> Layouts</button><PrintShopButton onClick={() => setPrintShopsOpen(true)}/></div></div><div className="page-count">{project.pages.length} {project.pages.length === 1 ? 'page' : 'pages'}</div></div>
    <div className="editor-body"><LeftPanel tab={leftPanelTab} onTab={setLeftPanelTab} photoPanel={photoDraft?.photo && library.get(photoDraft.photo.assetId) ? <PhotoAdjustmentsPanel frame={photoDraft} asset={library.get(photoDraft.photo.assetId)!} onChange={setPhotoDraft} compare={comparePhoto} onCompare={setComparePhoto} onFinish={finishPhotoEdit}/> : undefined} page={page} unit={project.unit} setUnit={unit => apply(p => ({ ...p, unit }))} selected={actions.selectedElements} fonts={typefaces} onAdd={kind => { actions.addElement(kind); setTool('select'); setLeftPanelTab('build'); }} onPage={requestPageSettings} onElement={actions.updateElement} onDelete={actions.deleteElements} onAlign={actions.align} onLayer={actions.layer} onMode={showMode} onBackground={() => { setBackgroundMode(true); if (!visiblePhotoIds.size) setFolderManagerOpen(true); else notify('Click a photo in the tray to use as the background.'); }} onFastKeys={() => setHelpOpen(true)}/>
      <div className="center-workspace">{previewMode && <div className="preview-controls"><button autoFocus className="preview-exit" onClick={exitPreview}><X size={15}/> Exit Preview</button><button aria-label="Previous preview page" className="preview-nav preview-nav-left" disabled={previewIndex <= 0} onClick={() => movePreview(-1)}><ChevronLeft size={24}/></button><button aria-label="Next preview page" className="preview-nav preview-nav-right" disabled={previewIndex >= project.pages.length - 1} onClick={() => movePreview(1)}><ChevronRight size={24}/></button><span className="preview-counter" aria-live="polite">Page {previewIndex + 1} of {project.pages.length}</span></div>}{missing > 0 && <div className="missing-banner"><span>{missing} used photo{missing === 1 ? '' : 's'} need reconnecting.</span><button onClick={() => setFolderManagerOpen(true)}>Manage folders</button></div>}<Canvas photoDraft={photoDraft} onPhotoDraft={setPhotoDraft} onPhotoEdit={beginPhotoEdit} onPhotoDone={() => finishPhotoEdit(true)} comparePhoto={comparePhoto} preview={previewMode} page={previewMode ? previewPage : page} library={library} allowDuplicates={project.allowDuplicates} unit={project.unit} selected={previewMode ? [] : selected} onSelect={ids => { setSelected(ids); if (ids.length) setLeftPanelTab('build'); }} onChange={actions.setElements} onDrop={actions.assignPhoto} onCut={cut} onHalfCut={halfCut} onDivide={divide} divisionBusy={busyCut} onCutGap={setCutGap} onMagicSpace={magicSpace} magicBusy={busySpacer} onFlip={actions.flip} duplicateGap={duplicateGap} onDuplicateGap={setDuplicateGap} duplicateDirection={duplicateDirection} onDuplicateDirection={setDuplicateDirection} cutGap={cutGap} tool={tool} setTool={setTool} onLayout={() => setLayoutOpen(true)} onFrame={() => { actions.addElement('rect'); setLeftPanelTab('build'); }} notify={notify}/><PhotosPanel project={project} library={library} visiblePhotoIds={visiblePhotoIds} folderCount={photoFolders.length} usage={usage} importing={importing} onManageFolders={() => setFolderManagerOpen(true)} onAutoFill={ids => actions.autoFill(ids, [...visiblePhotoIds])} onDuplicate={allowDuplicates => apply(p => ({ ...p, allowDuplicates }))} onPhoto={(id, additive) => { if (additive) { setSelectedPhotos(ids => ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]); return; } setSelectedPhotos([id]); const target = actions.selectedElements.find(element => element.type === 'frame'); if (backgroundMode || target) { actions.assignPhoto(id, target?.id, backgroundMode); if (backgroundMode) setBackgroundMode(false); } }} selectedPhotos={selectedPhotos} backgroundMode={backgroundMode}/></div>
      <PagesPanel project={project} current={page.id} library={library} version={library.size} onSelect={selectPage} onAdd={() => selectPage(actions.addPage())} onDuplicate={id => selectPage(actions.duplicatePage(id))} onDelete={deletePage} onMove={actions.movePage} onReorder={actions.reorderPage}/>
    </div>
    <input ref={projectInput} type="file" accept=".canpack,.can,.json,.album-project.json" hidden onChange={e => void openProject(e.target.files?.[0])}/>
    {menu && <div className="menu-dismiss" onClick={() => setMenu(null)}/>}
    {toast && <div className="toast" role="status"><Check size={16}/><span>{toast}</span><button aria-label="Dismiss message" onClick={() => setToast('')}><X size={14}/></button></div>}
    {layoutOpen && <Modal title={onlineDrilldown ? onlineDrilldown.summary.title : "A starting point for every story."} onClose={() => { setOnlineDrilldown(null); setLayoutOpen(false); }} wide>
      {onlineDrilldown ? <OnlineTemplateDrilldown template={onlineDrilldown.template} onBack={() => setOnlineDrilldown(null)} onPage={item => addOnlinePages([item], onlineDrilldown.summary.title)} onAll={() => addOnlinePages(templatePages(onlineDrilldown.template), onlineDrilldown.summary.title)}/> : <>
      <div className="modal-toolbar"><div className="panel-tabs"><button className={templateTab === 'starter' ? 'active' : ''} onClick={() => setTemplateTab('starter')}>Basic <span>{layouts.length}</span></button><button className={templateTab === 'more' ? 'active' : ''} onClick={() => setTemplateTab('more')}>More Layouts <span>{onlineCatalog.templates.length || ''}</span></button><button className={templateTab === 'saved' ? 'active' : ''} onClick={() => setTemplateTab('saved')}>Your Layout <span>{templates.length}</span></button></div>{templateTab === 'saved' && <button className="wide-button" onClick={chooseTemplateFolder}><FolderOpen size={15}/>{templateFolder ? 'Change folder' : 'Choose layout folder'}</button>}</div>
      {templateTab === 'more' && onlineStatus === 'ready' && <div className="online-template-tools"><div className="online-template-categories"><button className={onlineCategory === 'all' ? 'active' : ''} onClick={() => setOnlineCategory('all')}>All</button>{onlineCatalog.categories.map(category => <button key={category.id} className={onlineCategory === category.id ? 'active' : ''} onClick={() => setOnlineCategory(category.id)}>{category.name}</button>)}</div><label><Search size={14}/><input aria-label="Search More Templates" placeholder="Search templates" value={onlineQuery} onChange={event => setOnlineQuery(event.target.value)}/></label></div>}
      {templateTab !== 'more' && <div className="layout-grid">{(templateTab === 'starter' ? layouts : templates).map(t => <LayoutTemplateCard key={t.id} template={t} onUse={() => applyTemplate(t)}/>)}</div>}
      {templateTab === 'more' && onlineStatus === 'ready' && !!filteredOnlineTemplates.length && <div className="layout-grid">{filteredOnlineTemplates.map(template => <OnlineTemplateCard key={template.id} template={template} category={onlineCatalog.categories.find(category => category.id === template.categoryId)?.name ?? ''} busy={loadingOnlineId === template.id} onUse={() => void openOnlineTemplate(template)}/>)}</div>}
      {templateTab === 'more' && onlineStatus === 'loading' && <div className="modal-empty"><Loader2 className="spin" size={32}/><h3>Loading More Templates…</h3></div>}
      {templateTab === 'more' && onlineStatus === 'error' && <div className="modal-empty"><LayoutGrid size={36}/><h3>Templates could not be loaded.</h3><p>Check your connection and try again.</p><button className="primary" onClick={() => void loadOnlineTemplates()}>Try again</button></div>}
      {templateTab === 'more' && onlineStatus === 'ready' && !onlineCatalog.templates.length && <div className="modal-empty"><LayoutGrid size={36}/><h3>No templates yet.</h3><p>Published templates will appear here.</p></div>}
      {templateTab === 'more' && onlineStatus === 'ready' && !!onlineCatalog.templates.length && !filteredOnlineTemplates.length && <div className="modal-empty"><Search size={36}/><h3>No matching templates.</h3><p>Try another category or search term.</p></div>}
      {templateTab === 'saved' && !templates.length && <div className="modal-empty"><LayoutGrid size={36}/><h3>Your collection starts here.</h3><p>Save a layout from your canvas, or choose a folder<br/>containing your .lca files.</p><button className="primary" onClick={chooseTemplateFolder}><FolderOpen size={15}/> Choose folder</button></div>}<div className="modal-footnote">{templateFolder && templateTab === 'saved' ? `Folder: ${templateFolder.name} · ` : ''}Templates contain layouts only. Your photos remain yours.</div></>}
    </Modal>}
    {coffeeOpen && <CoffeeSupportModal onClose={() => setCoffeeOpen(false)} notify={notify}/>}
    {printShopsOpen && <PrintShopModal onClose={() => setPrintShopsOpen(false)}/>}
    {saveWarningOpen && <Modal title="Before you save this project." onClose={() => setSaveWarningOpen(false)}><p className="modal-description project-save-explanation">This small .can project file does not include:</p><ul className="project-save-exclusions"><li>Your original photo files</li><li>Photo folder links and browser permissions</li></ul><p className="modal-description project-save-note">Its pages and layout remain complete, but the original folders must be reconnected before photos can be displayed or exported. Choose “Save project with photos” from the File menu when you need one portable .canpack.</p><div className="modal-actions"><button onClick={() => setSaveWarningOpen(false)}>Cancel</button><button className="primary" onClick={downloadProject}>Save small .can</button></div></Modal>}
    {paddingWarning && <Modal title="Cut objects to the new padding?" onClose={() => setPaddingWarning(null)}><div className="padding-warning"><strong>{paddingWarning.frames + paddingWarning.texts} object{paddingWarning.frames + paddingWarning.texts === 1 ? '' : 's'} will be cut.</strong><p>The new inner padding overlaps {paddingWarning.frames} frame{paddingWarning.frames === 1 ? '' : 's'} and {paddingWarning.texts} text object{paddingWarning.texts === 1 ? '' : 's'}. Their overlapping areas will be permanently trimmed to fit inside the inner box without moving or stretching the photos.</p><p>Reducing the padding later will not restore the trimmed areas. You can use Undo immediately after applying this change.</p></div><div className="modal-actions"><button onClick={() => setPaddingWarning(null)}>Cancel</button><button className="primary" onClick={() => { const pending = paddingWarning.patch, next = clipPageToSafeArea({ ...page, ...pending, clipContentToPadding: false }); setPaddingWarning(null); actions.updatePage(() => next); setSelected(ids => ids.filter(id => next.elements.some(element => element.id === id))); }}>Cut &amp; Apply</button></div></Modal>}
    {folderManagerOpen && <PhotoFolderManagerModal folders={photoFolders} busy={folderManagerBusy} importingFolderId={importingFolderId} removal={folderRemoval} onClose={() => { setFolderRemoval(undefined); setFolderManagerOpen(false); }} onAdd={() => void addPhotoFolder()} onToggle={togglePhotoFolder} onRefresh={id => void importFolder(id)} onRequestRemove={requestFolderRemoval} onCancelRemove={() => setFolderRemoval(undefined)} onConfirmRemove={() => void confirmFolderRemoval()}/>}
    {saveTemplateOpen && <Modal title={saveTemplateScope ? 'Name this layout.' : 'What would you like to save?'} onClose={() => !savingTemplate && setSaveTemplateOpen(false)}>{!saveTemplateScope ? <><p className="modal-description">Choose whether this template should contain only the page you are viewing or the complete album layout. Photos are always excluded.</p><div className="save-layout-scope"><button onClick={() => setSaveTemplateScope('current')}><LayoutGrid size={22}/><span><strong>Current Layout</strong><small>Save only the current page.</small></span></button><button onClick={() => setSaveTemplateScope('all')}><BookOpen size={22}/><span><strong>All Pages Layout</strong><small>Bundle all {project.pages.length} pages in their current order.</small></span></button></div><div className="modal-actions"><button onClick={() => setSaveTemplateOpen(false)}>Cancel</button></div></> : <><p className="modal-description">{saveTemplateScope === 'current' ? 'The current page will be saved as one reusable layout.' : `All ${project.pages.length} pages will be saved together as one reusable album template.`} Photos and photo backgrounds are excluded.</p><label className="field"><span>Layout name</span><input autoFocus aria-label="Layout name" value={templateName} maxLength={100} placeholder={saveTemplateScope === 'current' ? 'e.g. Wedding — three moments' : 'e.g. Complete wedding album'} onChange={e => setTemplateName(e.target.value)}/></label><p className="hint">A reusable .lca template file will be downloaded by your browser.</p><div className="modal-actions"><button onClick={() => setSaveTemplateScope(null)} disabled={savingTemplate}>Back</button><button onClick={() => setSaveTemplateOpen(false)} disabled={savingTemplate}>Cancel</button><button className="primary" disabled={!templateName.trim() || savingTemplate} onClick={saveTemplate}>{savingTemplate ? <Loader2 className="spin" size={15}/> : <Save size={15}/>} Download template</button></div></>}</Modal>}
    {modeOpen && <Modal title={page.mode === 'single' ? 'Give your story more room.' : 'Choose the side to keep.'} eyebrow="CHANGE PAGE MODE" onClose={() => setModeOpen(false)}><p className="modal-description">{page.mode === 'single' ? 'Create a spread with twice the width. Move the existing layout without changing its size, or start with a blank canvas.' : 'Keep the left or right half as a single page. Objects crossing the boundary are clipped. This change can be undone.'}</p><div className="mode-choices">{(page.mode === 'single' ? ['blank', 'left', 'right'] : ['left', 'right']).map(choice => <button key={choice} className={modeChoice === choice ? 'active' : ''} onClick={() => setModeChoice(choice as 'blank' | 'left' | 'right')}>{choice === 'blank' ? 'Start blank' : `${page.mode === 'single' ? 'Move' : 'Keep'} ${choice}`}</button>)}</div><div className="mode-preview"><PagePreview page={convertPage(page, modeChoice)} library={library}/></div><div className="modal-actions"><button onClick={() => setModeOpen(false)}>Cancel</button><button className="primary" onClick={() => { actions.updatePage(() => convertPage(page, modeChoice)); setSelected([]); setModeOpen(false); }}>Apply change</button></div></Modal>}
    {helpOpen && <Modal title="App Fast Keys" onClose={() => setHelpOpen(false)} wide><div className="help-list">{[['Ctrl + M', 'Show or hide this shortcut guide.'], ['Ctrl + F / `', 'Enter or exit full screen.'], ['Ctrl + P', 'Enter or exit Preview without opening browser print.'], ['Ctrl + D', 'Duplicate the selection using the active arrow and spacing value.'], ['S', 'Add a rectangle frame to the current page.'], ['I', 'Lock or unlock every frame in the album.'], ['F4', 'Fit the current page inside the canvas.'], ['Page Up / Page Down', 'Go to the previous / next album page.'], ['Ctrl + ↑ / Ctrl + ↓', 'Go to the previous / next album page.'], ['Ctrl + K', 'Merge touching or overlapping empty frames into one Union Shape.'], ['Ctrl + G', 'Group selected frames.'], ['Ctrl + U', 'Ungroup the selected frame group.'], ['Q', 'Swap or cycle photos between the selected frames.'], ['E', 'Fill one selected rectangle across its page side and center it.'], ['O', 'Remove photos from the selected frame or frames.'], ['C', 'Start or exit the free-angle cutter for one selected empty frame.'], ['D', 'Start or exit the 50/50 cutter for one selected empty frame.'], ['T', 'Align selected objects to the top.'], ['B', 'Align selected objects to the bottom.'], ['F', 'Align selected objects to the horizontal center.'], ['L / R', 'Align selected objects to the left / right.'], ['P', 'Center selected objects horizontally and vertically on the page.'], ['V', 'Center selected objects vertically.'], ['Z / X', 'Center on the left / right side of a spread; both center on a single page.'], ['1 / 2', 'Distribute selected objects horizontally / vertically.'], ['Drag empty space', 'Draw a selection box around frames and text. Add Shift to toggle items in the current selection.'], ['Alt + drag', 'Duplicate a frame or text object. Add Shift for a straight path.'], ['Double-click', 'Reposition and zoom a photo inside its frame.'], ['Shift + resize', 'Resize proportionally.'], ['Shift + drag', 'Move horizontally or vertically.'], ['Shift + click', 'Select several frames or text objects.'], ['Shift + click photo', 'Select several tray photos for Auto-fill.'], ['Esc', 'Clear selected objects and Auto-fill photos, or cancel the active editor action.'], ['Space + drag', 'Pan around the canvas.'], ['Ctrl + scroll', 'Zoom in and out.'], ['Ctrl + Z', 'Undo. Ctrl + Shift + Z to redo.'], ['Ctrl + S', 'Save a small layout-only .can project.'], ['Delete', 'Remove selected objects.']].map(([key, desc]) => <p key={key}><kbd>{key}</kbd><span>{desc}</span></p>)}</div><p className="modal-footnote">Use File → Save project with photos to create a portable .canpack containing every original photo currently used on the album pages.</p></Modal>}
    {confirm && <Modal title={confirm.title} onClose={() => setConfirm(null)}><p className="modal-description">{confirm.message}</p><div className="modal-actions"><button onClick={() => setConfirm(null)}>Cancel</button><button className="primary" onClick={() => { const action = confirm.action; setConfirm(null); action(); }}>Continue</button></div></Modal>}
    {exporting && <Modal title="Preparing your album." eyebrow="EXPORTING ORIGINAL QUALITY" onClose={() => abortExport.current?.abort()}><p className="modal-description">Rendering page {Math.min(exporting.done + 1, exporting.total)} of {exporting.total}. Your original photos stay on this computer.</p><div className="progress-bar"><div style={{ width: `${exporting.done / exporting.total * 100}%` }}/></div><div className="modal-actions"><span className="hint">{exporting.done} / {exporting.total} complete</span><button onClick={() => abortExport.current?.abort()}>Cancel export</button></div></Modal>}
    {packageTransfer && <Modal title={packageTransfer.kind === 'saving' ? 'Saving portable project.' : 'Opening portable project.'} eyebrow="PROJECT WITH ORIGINAL PHOTOS" onClose={() => packageAbort.current?.abort()}><p className="modal-description">{packageTransfer.kind === 'saving' ? 'Writing the project and its used photos directly to your .canpack file.' : 'Checking and preparing the embedded photos. The current album will stay unchanged until this completes.'}</p><div className="progress-bar"><div style={{ width: `${Math.min(100, packageTransfer.bytesTotal ? packageTransfer.bytesDone / packageTransfer.bytesTotal * 100 : packageTransfer.total ? packageTransfer.completed / packageTransfer.total * 100 : 100)}%` }}/></div><div className="modal-actions"><span className="hint">{packageTransfer.completed} / {packageTransfer.total} complete{packageTransfer.bytesTotal ? ` · ${(packageTransfer.bytesDone / 1_000_000).toFixed(1)} MB` : ''}</span><button onClick={() => packageAbort.current?.abort()}>Cancel</button></div></Modal>}
  </main>;
}
const COFFEE_MESSAGES = ['Belanja la saya kopi ^_^ plis.', 'Buy me a coffee please ^_^'], COFFEE_ACTIONS = ['Klik Sini', 'Click Here'];
function CoffeeSupportButton({ onClick }: { onClick: () => void }) {
  const [message, setMessage] = useState(COFFEE_MESSAGES[0]), [language, setLanguage] = useState(0);
  useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout>, current = 0;
    const later = (action: () => void, delay: number) => { timer = setTimeout(() => { if (!stopped) action(); }, delay); };
    const rotate = () => {
      const outgoing = COFFEE_MESSAGES[current], next = (current + 1) % COFFEE_MESSAGES.length; let length = outgoing.length;
      const erase = () => { length--; setMessage(outgoing.slice(0, Math.max(0, length))); if (length > 0) later(erase, 28); else { current = next; setLanguage(current); let typed = 0; const type = () => { typed++; setMessage(COFFEE_MESSAGES[current].slice(0, typed)); if (typed < COFFEE_MESSAGES[current].length) later(type, 42); else later(rotate, 50000); }; later(type, 180); } };
      erase();
    };
    later(rotate, 50000);
    return () => { stopped = true; clearTimeout(timer); };
  }, []);
  return <div className="coffee-support-button"><Coffee size={14}/><span key={language} className="coffee-support-copy" aria-hidden="true">{message}</span><button type="button" className="coffee-support-action" onClick={onClick}>{COFFEE_ACTIONS[language]}</button></div>;
}
function CoffeeSupportModal({ onClose, notify }: { onClose: () => void; notify: (message: string) => void }) {
  const [language, setLanguage] = useState<'ms' | 'en'>('ms'), [copied, setCopied] = useState('');
  const [settings, setSettings] = useState<SupportSettings>(DEFAULT_SUPPORT_SETTINGS);
  const malay = language === 'ms';
  useEffect(() => { const controller = new AbortController(); fetch('/api/support', { cache: 'no-store', signal: controller.signal }).then(response => response.ok ? response.json() as Promise<SupportSettings> : Promise.reject()).then(setSettings).catch(() => {}); return () => controller.abort(); }, []);
  async function copy(value: string, key: string) {
    try { await navigator.clipboard.writeText(value); setCopied(key); }
    catch { notify(malay ? 'Tidak dapat menyalin. Sila salin secara manual.' : 'Could not copy. Please copy it manually.'); }
  }
  const title = malay ? settings.titleMs : settings.titleEn;
  return <Modal title={title} onClose={onClose} className="coffee-modal">
    <div className="coffee-language" role="tablist" aria-label="Language"><button role="tab" aria-selected={malay} className={malay ? 'active' : ''} onClick={() => setLanguage('ms')}>Melayu</button><span aria-hidden="true">/</span><button role="tab" aria-selected={!malay} className={!malay ? 'active' : ''} onClick={() => setLanguage('en')}>English</button></div>
    <div className="coffee-message"><SupportMessage settings={settings} language={language}/></div>
    {!!settings.accounts.length && <div className="coffee-payment-grid" style={settings.accounts.length === 1 ? { gridTemplateColumns: '1fr' } : undefined}>{settings.accounts.map(account => { const copyField = account.fields.find(field => field.copy), online = /paypal|email|online/i.test(account.name); return <article className="coffee-payment-card" key={account.id}><div className="coffee-payment-heading"><span>{online ? <AtSign size={16}/> : <Landmark size={16}/>}</span><div><small>{malay ? 'KAEDAH BAYARAN' : 'PAYMENT METHOD'}</small><h3>{account.name}</h3></div></div><dl>{account.fields.map(field => <div key={field.id}><dt>{malay ? field.labelMs : field.labelEn}</dt><dd className={field.copy && /^[\d\s-]+$/.test(field.value) ? 'coffee-account-number' : undefined}>{field.value}</dd></div>)}</dl>{copyField && <button onClick={() => void copy(copyField.value, account.id)}>{copied === account.id ? <Check size={14}/> : <Copy size={14}/>} {copied === account.id ? (malay ? 'Disalin' : 'Copied') : `${malay ? 'Salin' : 'Copy'} ${malay ? copyField.labelMs : copyField.labelEn}`}</button>}</article>; })}</div>}
  </Modal>;
}
function PrintShopButton({ onClick }: { onClick: () => void }) {
  const [shining, setShining] = useState(false);
  useEffect(() => {
    let active = true, nextTimer: ReturnType<typeof setTimeout>, offTimer: ReturnType<typeof setTimeout>;
    const schedule = () => { nextTimer = setTimeout(() => { if (!active) return; setShining(true); offTimer = setTimeout(() => { if (active) setShining(false); }, 950); schedule(); }, 3000 + Math.random() * 5000); };
    schedule();
    return () => { active = false; clearTimeout(nextTimer); clearTimeout(offTimer); };
  }, []);
  return <button type="button" className={`print-shop-button${shining ? ' shining' : ''}`} onClick={onClick}><Store size={14}/><span>Pilih Kedai Cetak Album</span></button>;
}
function templatePages(template: LayoutTemplate) { return template.kind === 'album-template' ? [template.page] : template.pages; }
const EMPTY_LIBRARY: PhotoLibrary = new Map();
function LayoutTemplateCard({ template, onUse }: { template: LayoutTemplate; onUse: () => void }) {
  const pages = templatePages(template), frames = pages.reduce((total, item) => total + item.elements.filter(element => element.type === 'frame').length, 0);
  return <button className="layout-card" onClick={onUse}><PagePreview page={pages[0]} library={EMPTY_LIBRARY}/><div><strong>{template.name}</strong><span>{template.kind === 'album-template-set' ? `${pages.length} pages · ${frames} frames` : `${frames} frames`}</span></div></button>;
}
function OnlineTemplateCard({ template, category, busy, onUse }: { template: PublicTemplate; category: string; busy: boolean; onUse: () => void }) {
  return <button className="layout-card online-layout-card" disabled={busy} onClick={onUse}><div className="online-template-preview"><img src={template.previewUrl} alt=""/>{busy && <span><Loader2 className="spin" size={20}/></span>}</div><div><strong>{template.title}</strong><span><i>{category}</i><b>{template.kind === 'album-template-set' ? `${template.pageCount} pages · ` : ''}{template.frameCount} frames</b></span></div></button>;
}
function OnlineTemplateDrilldown({ template, onBack, onPage, onAll }: { template: LayoutTemplate; onBack: () => void; onPage: (page: Page) => void; onAll: () => void }) {
  const pages = templatePages(template);
  return <div className="online-template-drilldown"><div className="online-drilldown-heading"><button onClick={onBack}><ChevronLeft size={15}/> Back to More Layouts</button><div><strong>{pages.length} {pages.length === 1 ? 'page layout' : 'page layouts'}</strong><span>Select one page, or add the complete template after your active page.</span></div>{pages.length > 1 && <button className="primary" onClick={onAll}><BookOpen size={15}/> Add All {pages.length} Pages</button>}</div><div className="online-page-grid">{pages.map((item, index) => <article key={item.id}><PagePreview page={item} library={EMPTY_LIBRARY}/><div><span><strong>Page {String(index + 1).padStart(2, '0')}</strong><small>{item.mode === 'spread' ? 'Spread' : 'Single page'} · {item.elements.filter(element => element.type === 'frame').length} frames</small></span><button className="primary" onClick={() => onPage(item)}><Plus size={14}/> Add This Page</button></div></article>)}</div>{pages.length > 1 && <div className="online-drilldown-footer"><span>Existing album pages will remain unchanged.</span><button className="primary" onClick={onAll}><BookOpen size={15}/> Add All {pages.length} Pages</button></div>}</div>;
}
