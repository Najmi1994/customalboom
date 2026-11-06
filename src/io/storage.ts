import { AlbumProject, LayoutTemplate, projectSchema, setProjectFramesLocked, templateSchema } from '../domain/model';
import { clipPageToSafeArea, validPage } from '../domain/geometry';

let database: Promise<IDBDatabase> | undefined;
const DATABASE_NAME = 'customalboom-com';
const LEGACY_DATABASE_NAMES = ['customalbum-net', ['fol', 'io-album'].join('')];
function openDatabase(name: string) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('settings');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function migrateLegacy(target: IDBDatabase) {
  if (!('databases' in indexedDB)) return;
  const targetCount = await new Promise<number>((resolve, reject) => { const request = target.transaction('settings').objectStore('settings').count(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  if (targetCount) return;
  const existing = new Set((await indexedDB.databases()).map(item => item.name).filter((name): name is string => Boolean(name)));
  for (const name of LEGACY_DATABASE_NAMES) if (existing.has(name)) {
    const legacy = await openDatabase(name);
    const entries = await new Promise<[IDBValidKey[], unknown[]]>((resolve, reject) => { const store = legacy.transaction('settings').objectStore('settings'), keys = store.getAllKeys(), values = store.getAll(); let done = 0; const finish = () => { if (++done === 2) resolve([keys.result, values.result]); }; keys.onsuccess = finish; values.onsuccess = finish; keys.onerror = () => reject(keys.error); values.onerror = () => reject(values.error); });
    legacy.close();
    if (!entries[0].length) continue;
    await new Promise<void>((resolve, reject) => { const tx = target.transaction('settings', 'readwrite'), store = tx.objectStore('settings'); entries[0].forEach((key, index) => store.put(entries[1][index], key)); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    return;
  }
}
function db() { return database ??= openDatabase(DATABASE_NAME).then(async target => { await migrateLegacy(target); return target; }); }
export async function storeValue(key: string, value: unknown) {
  const database = await db();
  return new Promise<void>((resolve, reject) => { const tx = database.transaction('settings', 'readwrite'); tx.objectStore('settings').put(value, key); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
}
export async function readValue<T>(key: string): Promise<T | undefined> {
  const database = await db();
  return new Promise((resolve, reject) => { const request = database.transaction('settings').objectStore('settings').get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
export function safeName(name: string) { return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').replace(/\.+$/g, '').trim().slice(0, 90) || 'album'; }
export function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
export async function saveFile(blob: Blob, filename: string, directory?: FileSystemDirectoryHandle) {
  if (directory) { const handle = await directory.getFileHandle(filename, { create: true }), stream = await handle.createWritable(); try { await stream.write(blob); await stream.close(); } catch (e) { await stream.abort(); throw e; } }
  else download(blob, filename);
}
export async function chooseDirectory(mode: 'read' | 'readwrite' = 'read'): Promise<FileSystemDirectoryHandle> {
  if (!('showDirectoryPicker' in window)) throw new Error('Folder access needs Chrome or Edge on desktop.');
  return window.showDirectoryPicker({ mode, id: mode === 'read' ? 'customalboom-photos' : 'customalboom-templates' });
}
export async function permission(handle: FileSystemDirectoryHandle, mode: 'read' | 'readwrite', prompt = true) {
  if (await handle.queryPermission({ mode }) === 'granted') return true;
  return prompt && await handle.requestPermission({ mode }) === 'granted';
}
export async function* walkFolder(directory: FileSystemDirectoryHandle, path = '', depth = 0): AsyncGenerator<{ file: File; path: string }> {
  if (depth > 20) return;
  for await (const [name, entry] of directory.entries()) {
    if (entry.kind === 'directory') yield* walkFolder(entry, path + name + '/', depth + 1);
    else if (/\.(jpe?g|png|webp)$/i.test(name)) yield { file: await entry.getFile(), path: path + name };
  }
}
function checkProject(project: AlbumProject) {
  if (!project.pages.every(validPage)) throw new Error('The file contains objects outside its page padding.');
  const ids = [project.id, ...project.pages.map(p => p.id), ...project.pages.flatMap(p => p.elements.map(e => e.id))];
  if (new Set(ids).size !== ids.length) throw new Error('The file contains duplicate object IDs.');
  const assets = new Set(project.assets.map(a => a.id));
  for (const p of project.pages) for (const key of [p.backgroundPhoto?.assetId, ...p.elements.map(e => e.type === 'frame' ? e.photo?.assetId : undefined)]) if (key && !assets.has(key)) throw new Error('A photo reference is missing from the project.');
  return project;
}
export function parseProject(raw: unknown) {
  const legacyLockState = !!raw && typeof raw === 'object' && !Object.prototype.hasOwnProperty.call(raw, 'framesLocked');
  const project = projectSchema.parse(raw);
  const frames = project.pages.flatMap(page => page.elements.filter(element => element.type === 'frame'));
  const framesLocked = legacyLockState ? frames.length > 0 && frames.every(frame => frame.locked) : project.framesLocked;
  const synchronized = setProjectFramesLocked(project, framesLocked);
  const pages = synchronized.pages.map(page => page.clipContentToPadding ? clipPageToSafeArea(page) : page);
  return checkProject({ ...synchronized, pages });
}
export function parseTemplate(raw: unknown): LayoutTemplate {
  const parsed = templateSchema.parse(raw), pages = (parsed.kind === 'album-template' ? [parsed.page] : parsed.pages).map(page => page.clipContentToPadding ? clipPageToSafeArea(page) : page);
  if (pages.some(page => page.backgroundPhoto || page.elements.some(e => e.type === 'frame' && e.photo))) throw new Error('Templates must not contain photos.');
  if (!pages.every(validPage)) throw new Error('Template objects must fit inside the padding.');
  return parsed.kind === 'album-template' ? { ...parsed, page: pages[0] } : { ...parsed, pages };
}
export async function readJson(file: File) { if (file.size > 10_000_000) throw new Error('This layout file is too large (maximum 10 MB).'); return JSON.parse(await file.text()); }
export function isLayoutTemplateFile(name: string) { return name.toLowerCase().endsWith('.lca') || name.toLowerCase().endsWith('.album-template.json'); }
export async function loadTemplates(directory: FileSystemDirectoryHandle) {
  const templates: LayoutTemplate[] = [], errors: string[] = [];
  for await (const [name, entry] of directory.entries()) if (entry.kind === 'file' && isLayoutTemplateFile(name)) {
    try { templates.push(parseTemplate(await readJson(await entry.getFile()))); } catch { errors.push(name); }
  }
  return { templates: templates.sort((a, b) => a.name.localeCompare(b.name)), errors };
}
