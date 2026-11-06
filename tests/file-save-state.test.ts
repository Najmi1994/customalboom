import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFrame, makeProject, projectSchema } from '../src/domain/model';
import { FILE_SAVE_REMINDER_MS as delay, fileReminderAt, observeFileChanges, recordFileEvent, restoreFileSaveState, snoozeFileReminder } from '../src/editor/fileSaveState';

test('new untouched project does not trigger reminders; subsequent edits do', () => {
  const project = makeProject(), initial = restoreFileSaveState(project, null, false, 100);
  assert.equal(fileReminderAt(initial), null);
  const edited = observeFileChanges(initial, { ...project, name: 'Edited' }, 200);
  assert.equal(fileReminderAt(edited), 200 + delay);
  assert.equal(observeFileChanges(edited, { ...project, name: 'More edits' }, 500).dirtySince, 200);
});

test('browser-restored work without a known file gets a reminder, not a saved claim', () => {
  const state = restoreFileSaveState(makeProject(), null, true, 100);
  assert.equal(state.event, null);
  assert.equal(fileReminderAt(state), 100 + delay);
});

test('successful file save clears changes; undo/redo toggles them correctly', () => {
  const project = makeProject(), changed = { ...project, name: 'Edited' };
  const saved = recordFileEvent(project, project, { at: 100, format: '.canpack', action: 'saved' });
  assert.equal(saved.dirtySince, null);
  const edited = observeFileChanges(saved, changed, 200);
  assert.equal(edited.dirtySince, 200);
  const undone = observeFileChanges(edited, structuredClone(project), 300);
  assert.equal(fileReminderAt(undone), null);
  assert.equal(observeFileChanges(undone, changed, 400).dirtySince, 400);
});

test('edits made during async save remain unsaved against the written snapshot', () => {
  const project = makeProject(), active = { ...project, name: 'Changed during package save' };
  const saved = recordFileEvent(project, active, { at: 100, format: '.canpack', action: 'saved' });
  assert.equal(saved.dirtySince, 100);
  assert.equal(saved.event?.action, 'saved');
});

test('download request and opening a file are distinct from a confirmed disk save', () => {
  const project = makeProject();
  for (const action of ['downloaded', 'opened'] as const) {
    const state = recordFileEvent(project, project, { at: 100, format: '.can', action });
    assert.equal(state.event?.action, action);
    assert.equal(fileReminderAt(state), null);
  }
});

test('snooze lasts ten minutes and editing does not reset or remove it', () => {
  const project = makeProject(), dirty = restoreFileSaveState(project, null, true, 100);
  const snoozed = snoozeFileReminder(dirty, delay + 100);
  assert.equal(fileReminderAt(snoozed), 2 * delay + 100);
  assert.equal(fileReminderAt(observeFileChanges(snoozed, { ...project, name: 'Edited' }, delay + 200)), 2 * delay + 100);
});

test('refresh restores the last file event and checks current browser content', () => {
  const project = makeProject(), saved = recordFileEvent(project, project, { at: 100, format: '.canpack', action: 'saved' });
  assert.equal(restoreFileSaveState(project, saved, true, 200).dirtySince, null);
  const changed = restoreFileSaveState({ ...project, name: 'Browser-only edit' }, saved, true, 200);
  assert.equal(changed.event?.at, 100);
  assert.equal(changed.dirtySince, 200);
});

test('schema normalization and reordered keys on refresh do not create false changes', () => {
  const project = makeProject();
  project.pages[0].elements = [makeFrame('rect', 0, 0, 200, 300)];
  const saved = recordFileEvent(project, project, { at: 100, format: '.can', action: 'downloaded' });
  const parsed = projectSchema.parse(JSON.parse(JSON.stringify(project)));
  assert.equal(restoreFileSaveState(parsed, saved, true, 200).dirtySince, null);
});

test('malformed metadata and another project cannot claim a file save', () => {
  const project = makeProject(), saved = recordFileEvent(project, project, { at: 100, format: '.can', action: 'downloaded' });
  for (const record of [null, [], { ...saved, event: { at: 'bad' } }, { ...saved, projectId: 'another-project' }]) {
    assert.equal(restoreFileSaveState(project, record, true, 200).event, null);
  }
  assert.equal(observeFileChanges(saved, makeProject(), 200).event, null);
});

test('merely importing unused assets does not trigger a file reminder', () => {
  const project = makeProject(), saved = recordFileEvent(project, project, { at: 100, format: '.can', action: 'downloaded' });
  const imported = { ...project, assets: [{ id: 'a'.repeat(64), name: 'unused.jpg', relativePath: 'unused.jpg', width: 300, height: 200, size: 100, lastModified: 100 }] };
  assert.equal(observeFileChanges(saved, imported, 200).dirtySince, null);
});
