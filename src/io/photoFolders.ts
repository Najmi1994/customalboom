export const PHOTO_FOLDERS_KEY = 'photoFolders';

export type StoredPhotoFolder = {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  show: boolean;
  knownAssetIds: string[];
};

export type ManagedPhotoFolder = StoredPhotoFolder & {
  status: 'connected' | 'reconnect';
  currentAssetIds: string[];
  photoCount: number;
};

export type PhotoFolderStore = { version: 1; folders: StoredPhotoFolder[] };

export function restorePhotoFolders(value: unknown): ManagedPhotoFolder[] {
  if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 1 || !Array.isArray((value as { folders?: unknown }).folders)) return [];
  return (value as PhotoFolderStore).folders.flatMap(folder => {
    if (!folder || typeof folder.id !== 'string' || typeof folder.name !== 'string' || !folder.handle || folder.handle.kind !== 'directory') return [];
    const knownAssetIds = Array.isArray(folder.knownAssetIds) ? folder.knownAssetIds.filter(id => typeof id === 'string') : [];
    return [{ ...folder, show: folder.show !== false, knownAssetIds, status: 'reconnect' as const, currentAssetIds: [], photoCount: knownAssetIds.length }];
  });
}

export function storePhotoFolders(folders: ManagedPhotoFolder[]): PhotoFolderStore {
  return { version: 1, folders: folders.map(({ id, name, handle, show, knownAssetIds }) => ({ id, name, handle, show, knownAssetIds })) };
}

export async function* readPhotoFolder(directory: FileSystemDirectoryHandle): AsyncGenerator<{ file: File; path: string }> {
  for await (const [name, entry] of directory.entries()) {
    if (entry.kind === 'file' && /\.(jpe?g|png|webp)$/i.test(name)) yield { file: await entry.getFile(), path: name };
  }
}

export function exclusiveFolderAssetIds(folder: ManagedPhotoFolder, others: ManagedPhotoFolder[]) {
  const shared = new Set(others.flatMap(item => item.knownAssetIds));
  return new Set(folder.knownAssetIds.filter(id => !shared.has(id)));
}
