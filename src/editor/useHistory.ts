import { useCallback, useRef, useState } from 'react';
import { AlbumProject, makeProject, purgePhotoAssets } from '../domain/model';
export function useHistory() {
  const [project, setProject] = useState<AlbumProject>(makeProject);
  const current = useRef(project), past = useRef<AlbumProject[]>([]), future = useRef<AlbumProject[]>([]);
  const apply = useCallback((fn: (p: AlbumProject) => AlbumProject) => {
    const next = fn(current.current); if (next === current.current) return;
    past.current = [...past.current.slice(-79), current.current]; future.current = []; current.current = next; setProject(next);
  }, []);
  const replace = useCallback((p: AlbumProject) => { current.current = p; past.current = []; future.current = []; setProject(p); }, []);
  const mergeAssets = useCallback((assets: AlbumProject['assets']) => { const p = { ...current.current, assets: [...new Map([...current.current.assets, ...assets].map(a => [a.id, a])).values()] }; current.current = p; setProject(p); }, []);
  const purgeAssets = useCallback((assetIds: ReadonlySet<string>) => {
    if (!assetIds.size) return;
    const clean = (value: AlbumProject) => purgePhotoAssets(value, assetIds);
    past.current = past.current.map(clean); future.current = future.current.map(clean);
    const next = clean(current.current); current.current = next; setProject(next);
  }, []);
  const undo = useCallback(() => { const p = past.current.pop(); if (p) { future.current.push(current.current); const next = { ...p, assets: current.current.assets }; current.current = next; setProject(next); } }, []);
  const redo = useCallback(() => { const p = future.current.pop(); if (p) { past.current.push(current.current); const next = { ...p, assets: current.current.assets }; current.current = next; setProject(next); } }, []);
  return { project, current, apply, replace, mergeAssets, purgeAssets, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}
