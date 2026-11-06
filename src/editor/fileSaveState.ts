import { AlbumProject, photoUsage } from '../domain/model';

export const FILE_SAVE_REMINDER_MS = 10 * 60 * 1000;
export const FILE_SAVE_RECORD_KEY = 'project-file-save-v1';
export type FileEvent = { at: number; format: '.can' | '.canpack'; action: 'saved' | 'downloaded' | 'opened' };
export type FileSaveRecord = { projectId: string; baseline: string | null; event: FileEvent | null };
export type FileSaveState = FileSaveRecord & { dirtySince: number | null; snoozedUntil: number; now: number };

// Imported but unused photos do not make a layout need another file save.
export function projectSaveSnapshot(project: AlbumProject) {
  const used = photoUsage(project);
  return JSON.stringify({ ...project, assets: project.assets.filter(asset => used.has(asset.id)).sort((a, b) => a.id.localeCompare(b.id)) }, (_key, value: unknown) => {
    // Schema parsing on refresh can reorder object keys without changing the layout.
    if (value && typeof value === 'object' && !Array.isArray(value)) return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
    return value;
  });
}

export function restoreFileSaveState(project: AlbumProject, record: unknown, restored: boolean, now: number): FileSaveState {
  const candidate = record as Partial<FileSaveRecord> | null;
  const event = candidate?.event;
  if (candidate?.projectId === project.id && typeof candidate.baseline === 'string' && event && Number.isFinite(event.at) && event.at > 0 && ['.can', '.canpack'].includes(event.format) && ['saved', 'downloaded', 'opened'].includes(event.action)) {
    return observeFileChanges({ projectId: project.id, baseline: candidate.baseline, event, dirtySince: null, snoozedUntil: 0, now }, project, now);
  }
  return { projectId: project.id, baseline: restored ? null : projectSaveSnapshot(project), event: null, dirtySince: restored ? now : null, snoozedUntil: 0, now };
}

export function observeFileChanges(state: FileSaveState, project: AlbumProject, now: number): FileSaveState {
  if (state.projectId !== project.id) return restoreFileSaveState(project, null, false, now);
  const dirty = projectSaveSnapshot(project) !== state.baseline;
  return { ...state, dirtySince: dirty ? state.dirtySince ?? now : null, snoozedUntil: dirty ? state.snoozedUntil : 0, now };
}

export function recordFileEvent(snapshot: AlbumProject, active: AlbumProject, event: FileEvent): FileSaveState {
  return observeFileChanges({ projectId: snapshot.id, baseline: projectSaveSnapshot(snapshot), event, dirtySince: null, snoozedUntil: 0, now: event.at }, active, event.at);
}

export function fileReminderAt(state: FileSaveState) {
  return state.dirtySince === null ? null : Math.max(state.dirtySince + FILE_SAVE_REMINDER_MS, state.snoozedUntil);
}

export function snoozeFileReminder(state: FileSaveState, now: number): FileSaveState {
  return { ...state, snoozedUntil: now + FILE_SAVE_REMINDER_MS, now };
}
