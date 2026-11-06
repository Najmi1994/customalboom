import { Zip, ZipPassThrough } from 'fflate';
import { z } from 'zod';
import type { AlbumProject } from '../domain/model';
import type { PhotoLibrary } from './photos';
import { parseProject } from './storage';

export const PROJECT_PACKAGE_EXTENSION = '.canpack';
export const PROJECT_PACKAGE_MAX_BYTES = 2_000_000_000;
const PROJECT_ENTRY = 'project.json';
const MANIFEST_ENTRY = 'manifest.json';
const MAX_PACKAGE_PHOTO_BYTES = 100_000_000;

const packageAssetSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{64}$/),
  entry: z.string().regex(/^photos\/[0-9a-f]{64}\.(?:jpg|png|webp)$/),
  originalName: z.string().min(1).max(512),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  size: z.number().int().min(0).max(MAX_PACKAGE_PHOTO_BYTES),
  lastModified: z.number().finite().min(0),
}).strict();

export const projectPackageManifestSchema = z.object({
  kind: z.literal('customalboom-project-package'),
  version: z.literal(1),
  project: z.literal(PROJECT_ENTRY),
  assets: z.array(packageAssetSchema).max(10000),
}).strict();

export type ProjectPackageManifest = z.infer<typeof projectPackageManifestSchema>;
export type ProjectPackageProgress = { completed: number; total: number; bytesDone: number; bytesTotal: number };
export type ProjectPackageWritable = {
  write(chunk: Uint8Array<ArrayBuffer>): Promise<void>;
  close(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
};
export type OpenedProjectPackage = {
  project: AlbumProject;
  manifest: ProjectPackageManifest;
  photos: Array<{ asset: ProjectPackageManifest['assets'][number]; file: File }>;
};

type PackageOptions = { signal?: AbortSignal; onProgress?: (progress: ProjectPackageProgress) => void };
type PreparedPackage = { manifest: ProjectPackageManifest; projectBytes: Uint8Array; manifestBytes: Uint8Array; photos: Array<{ entry: string; file: File }>; bytesTotal: number };

export function usedProjectPhotoIds(project: AlbumProject) {
  const ids = new Set<string>();
  for (const page of project.pages) {
    if (page.backgroundPhoto) ids.add(page.backgroundPhoto.assetId);
    for (const element of page.elements) if (element.type === 'frame' && element.photo) ids.add(element.photo.assetId);
  }
  return [...ids];
}

function packagePhotoType(file: File) {
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (file.type === 'image/jpeg' || extension === 'jpg' || extension === 'jpeg') return { mimeType: 'image/jpeg' as const, extension: 'jpg' };
  if (file.type === 'image/png' || extension === 'png') return { mimeType: 'image/png' as const, extension: 'png' };
  if (file.type === 'image/webp' || extension === 'webp') return { mimeType: 'image/webp' as const, extension: 'webp' };
  throw new Error(`“${file.name}” is not a supported JPEG, PNG or WebP photo.`);
}

function estimatedZipBytes(entries: Array<{ name: string; size: number }>) {
  return entries.reduce((total, entry) => total + entry.size + 92 + new TextEncoder().encode(entry.name).length * 2, 22);
}

export function prepareProjectPackage(project: AlbumProject, library: PhotoLibrary): PreparedPackage {
  const ids = usedProjectPhotoIds(project), assets: ProjectPackageManifest['assets'] = [], photos: PreparedPackage['photos'] = [];
  for (const id of ids) {
    const photo = library.get(id);
    if (!photo) throw new Error('Some used photos are missing. Reconnect their folder before saving with photos.');
    if (photo.file.size > MAX_PACKAGE_PHOTO_BYTES) throw new Error(`“${photo.file.name}” exceeds the 100 MB photo limit.`);
    const type = packagePhotoType(photo.file), entry = `photos/${id}.${type.extension}`;
    assets.push({ id, entry, originalName: photo.file.name, mimeType: type.mimeType, size: photo.file.size, lastModified: photo.file.lastModified });
    photos.push({ entry, file: photo.file });
  }
  const manifest: ProjectPackageManifest = { kind: 'customalboom-project-package', version: 1, project: PROJECT_ENTRY, assets };
  const projectBytes = new TextEncoder().encode(JSON.stringify(project, null, 2));
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  const entries = [{ name: MANIFEST_ENTRY, size: manifestBytes.length }, { name: PROJECT_ENTRY, size: projectBytes.length }, ...photos.map(photo => ({ name: photo.entry, size: photo.file.size }))];
  const bytesTotal = estimatedZipBytes(entries);
  if (bytesTotal >= PROJECT_PACKAGE_MAX_BYTES) throw new Error('This project package would reach the 2 GB limit. Remove some used photos or save a smaller album.');
  return { manifest, projectBytes, manifestBytes, photos, bytesTotal };
}

function abortError() { return new DOMException('The operation was cancelled.', 'AbortError'); }
function checkAbort(signal?: AbortSignal) { if (signal?.aborted) throw signal.reason ?? abortError(); }

export async function writeProjectPackage(project: AlbumProject, library: PhotoLibrary, writable: ProjectPackageWritable, options: PackageOptions = {}) {
  const prepared = prepareProjectPackage(project, library), { signal, onProgress } = options;
  let writeChain = Promise.resolve(), zipError: Error | undefined, bytesDone = 0, completed = 0;
  const total = prepared.photos.length + 2;
  const zip = new Zip((error, chunk) => {
    if (error) { zipError = error; return; }
    if (chunk?.length) writeChain = writeChain.then(() => writable.write(chunk as Uint8Array<ArrayBuffer>));
  });
  const report = () => onProgress?.({ completed, total, bytesDone, bytesTotal: prepared.bytesTotal });
  const addEntry = async (name: string, source: Blob) => {
    checkAbort(signal);
    const entry = new ZipPassThrough(name); zip.add(entry);
    const reader = source.stream().getReader();
    try {
      let pushed = false;
      while (true) {
        checkAbort(signal);
        const { done, value } = await reader.read();
        if (done) break;
        pushed = true; entry.push(value, false); bytesDone += value.byteLength; await writeChain;
        if (zipError) throw zipError; report();
      }
      entry.push(new Uint8Array(), true);
      if (!pushed && source.size) throw new Error(`Unable to read ${name}.`);
      await writeChain; if (zipError) throw zipError;
      completed++; report();
    } finally { reader.releaseLock(); }
  };
  try {
    report();
    await addEntry(MANIFEST_ENTRY, new Blob([prepared.manifestBytes as Uint8Array<ArrayBuffer>]));
    await addEntry(PROJECT_ENTRY, new Blob([prepared.projectBytes as Uint8Array<ArrayBuffer>]));
    for (const photo of prepared.photos) await addEntry(photo.entry, photo.file);
    checkAbort(signal); zip.end(); await writeChain;
    if (zipError) throw zipError;
    bytesDone = prepared.bytesTotal; completed = total; report();
    await writable.close();
  } catch (error) {
    zip.terminate();
    try { await writable.abort(error); } catch { /* The browser may already have discarded the temporary file. */ }
    throw error;
  }
  return prepared.manifest;
}

type StoredZipEntry = { name: string; blob: Blob; size: number; crc: number };
const decoder = new TextDecoder('utf-8', { fatal: true });
const u16 = (view: DataView, offset: number) => view.getUint16(offset, true);
const u32 = (view: DataView, offset: number) => view.getUint32(offset, true);

function safeEntryName(name: string) {
  if (!name || name.startsWith('/') || name.includes('\\') || name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('The project package contains an unsafe file path.');
}

async function readStoredZip(file: File, signal?: AbortSignal, onProgress?: (progress: ProjectPackageProgress) => void) {
  checkAbort(signal);
  if (file.size >= PROJECT_PACKAGE_MAX_BYTES) throw new Error('This project package reaches or exceeds the 2 GB limit.');
  const tailStart = Math.max(0, file.size - 65_557), tail = new Uint8Array(await file.slice(tailStart).arrayBuffer()), tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let eocd = -1;
  for (let offset = tail.length - 22; offset >= 0; offset--) if (u32(tailView, offset) === 0x06054b50) { eocd = offset; break; }
  if (eocd < 0 || eocd + 22 > tail.length) throw new Error('This is not a valid .canpack file.');
  const disk = u16(tailView, eocd + 4), centralDisk = u16(tailView, eocd + 6), diskEntries = u16(tailView, eocd + 8), totalEntries = u16(tailView, eocd + 10), centralSize = u32(tailView, eocd + 12), centralOffset = u32(tailView, eocd + 16);
  if (disk || centralDisk || diskEntries !== totalEntries || totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) throw new Error('Multi-disk and ZIP64 packages are not supported.');
  if (totalEntries > 10002 || centralOffset + centralSize > tailStart + eocd) throw new Error('The project package directory is invalid.');
  const central = new Uint8Array(await file.slice(centralOffset, centralOffset + centralSize).arrayBuffer()), view = new DataView(central.buffer, central.byteOffset, central.byteLength), entries = new Map<string, StoredZipEntry>();
  let offset = 0;
  for (let index = 0; index < totalEntries; index++) {
    checkAbort(signal);
    if (offset + 46 > central.length || u32(view, offset) !== 0x02014b50) throw new Error('The project package directory is damaged.');
    const flags = u16(view, offset + 8), compression = u16(view, offset + 10), crc = u32(view, offset + 16), compressedSize = u32(view, offset + 20), size = u32(view, offset + 24), nameLength = u16(view, offset + 28), extraLength = u16(view, offset + 30), commentLength = u16(view, offset + 32), localOffset = u32(view, offset + 42), end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > central.length || flags & 1 || compression !== 0 || compressedSize !== size) throw new Error('The project package must contain uncompressed, unencrypted entries.');
    const name = decoder.decode(central.subarray(offset + 46, offset + 46 + nameLength)); safeEntryName(name);
    if (entries.has(name)) throw new Error('The project package contains duplicate file entries.');
    const localBytes = new Uint8Array(await file.slice(localOffset, localOffset + 30).arrayBuffer());
    if (localBytes.length !== 30) throw new Error('The project package contains a truncated file entry.');
    const local = new DataView(localBytes.buffer, localBytes.byteOffset, localBytes.byteLength);
    if (u32(local, 0) !== 0x04034b50) throw new Error('The project package contains an invalid file entry.');
    const dataOffset = localOffset + 30 + u16(local, 26) + u16(local, 28);
    if (dataOffset + size > centralOffset) throw new Error('The project package contains an out-of-bounds file entry.');
    entries.set(name, { name, blob: file.slice(dataOffset, dataOffset + size), size, crc }); offset = end;
    onProgress?.({ completed: index + 1, total: totalEntries + 2, bytesDone: 0, bytesTotal: 0 });
  }
  if (offset !== central.length) throw new Error('The project package directory has unexpected data.');
  return entries;
}

let crcTable: Uint32Array | undefined;
function crc32(bytes: Uint8Array) {
  crcTable ??= Uint32Array.from({ length: 256 }, (_, value) => { let crc = value; for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; return crc >>> 0; });
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function readJsonEntry(entries: Map<string, StoredZipEntry>, name: string, maxBytes: number) {
  const entry = entries.get(name);
  if (!entry || entry.size > maxBytes) throw new Error(`The project package is missing a valid ${name}.`);
  const bytes = new Uint8Array(await entry.blob.arrayBuffer());
  if (crc32(bytes) !== entry.crc) throw new Error(`${name} is damaged.`);
  try { return JSON.parse(decoder.decode(bytes)); } catch { throw new Error(`${name} is not valid JSON.`); }
}

export async function readProjectPackage(file: File, options: PackageOptions = {}): Promise<OpenedProjectPackage> {
  const entries = await readStoredZip(file, options.signal, options.onProgress), total = entries.size + 2;
  const manifestResult = projectPackageManifestSchema.safeParse(await readJsonEntry(entries, MANIFEST_ENTRY, 2_000_000));
  if (!manifestResult.success) throw new Error('The project package manifest is invalid or uses an unsupported version.');
  const manifest = manifestResult.data;
  options.onProgress?.({ completed: entries.size + 1, total, bytesDone: 0, bytesTotal: 0 }); checkAbort(options.signal);
  const project = parseProject(await readJsonEntry(entries, manifest.project, 10_000_000));
  options.onProgress?.({ completed: total, total, bytesDone: 0, bytesTotal: 0 });
  const used = new Set(usedProjectPhotoIds(project)), ids = new Set<string>(), paths = new Set<string>(), expectedEntries = new Set([MANIFEST_ENTRY, PROJECT_ENTRY]);
  for (const asset of manifest.assets) {
    checkAbort(options.signal);
    if (ids.has(asset.id) || paths.has(asset.entry)) throw new Error('The project package contains duplicate photo records.');
    if (!asset.entry.startsWith(`photos/${asset.id}.`)) throw new Error('A packaged photo path does not match its asset ID.');
    ids.add(asset.id); paths.add(asset.entry); expectedEntries.add(asset.entry);
    const entry = entries.get(asset.entry);
    if (!entry || entry.size !== asset.size) throw new Error(`The packaged photo “${asset.originalName}” is missing or has the wrong size.`);
  }
  if (used.size !== ids.size || [...used].some(id => !ids.has(id))) throw new Error('The package photo list does not match the photos used by the project.');
  if (entries.size !== expectedEntries.size || [...entries.keys()].some(name => !expectedEntries.has(name))) throw new Error('The project package contains unexpected file entries.');
  const photos = manifest.assets.map(asset => ({ asset, file: new File([entries.get(asset.entry)!.blob], asset.originalName, { type: asset.mimeType, lastModified: asset.lastModified }) }));
  return { project, manifest, photos };
}
