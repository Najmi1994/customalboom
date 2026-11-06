import { useCallback, useEffect, useState } from 'react';
import { AlbumProject } from '../domain/model';
import { storeValue } from '../io/storage';
import { FILE_SAVE_RECORD_KEY, FileEvent, FileSaveState, fileReminderAt, observeFileChanges, recordFileEvent, restoreFileSaveState, snoozeFileReminder } from './fileSaveState';

export function useFileSaveReminder() {
  const [state, setState] = useState<FileSaveState | null>(null);
  const reset = useCallback((project: AlbumProject, restored = false, record: unknown = null) => {
    setState(restoreFileSaveState(project, record, restored, Date.now()));
  }, []);
  const observe = useCallback((project: AlbumProject) => {
    setState(previous => previous ? observeFileChanges(previous, project, Date.now()) : previous);
  }, []);
  const record = useCallback((snapshot: AlbumProject, active: AlbumProject, format: FileEvent['format'], action: FileEvent['action']) => {
    const next = recordFileEvent(snapshot, active, { at: Date.now(), format, action });
    setState(next);
    // Metadata only; a storage failure must not turn a successful file save into a failure.
    void storeValue(FILE_SAVE_RECORD_KEY, { projectId: next.projectId, baseline: next.baseline, event: next.event }).catch(() => {});
  }, []);
  const snooze = useCallback(() => setState(previous => previous ? snoozeFileReminder(previous, Date.now()) : previous), []);
  const deadline = state ? fileReminderAt(state) : null;
  useEffect(() => {
    if (deadline === null) return;
    const timer = setTimeout(() => setState(previous => previous ? { ...previous, now: Date.now() } : previous), Math.max(0, deadline - Date.now()));
    return () => clearTimeout(timer);
  }, [deadline]);
  return { state, reset, observe, record, snooze, reminder: !!state && deadline !== null && state.now >= deadline };
}
