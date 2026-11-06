'use client';
// Development fixture: synthetic photos and history only; never touches album storage.
import { useEffect, useState } from 'react';
import { FrameElement, makeFrame, makeProject } from '../src/domain/model';
import { coverPhoto } from '../src/domain/geometry';
import { PhotoLibrary } from '../src/io/photos';
import { useHistory } from '../src/editor/useHistory';
import { useEditorActions } from '../src/editor/useEditorActions';
import FileSaveStatus from '../src/editor/FileSaveStatus';
import { FILE_SAVE_REMINDER_MS, FileSaveState, fileReminderAt, observeFileChanges, recordFileEvent, restoreFileSaveState, snoozeFileReminder } from '../src/editor/fileSaveState';

export default function ProductivityCheck() {
  const history = useHistory(), page = history.project.pages[0];
  const [library, setLibrary] = useState<PhotoLibrary>(new Map()), [message, setMessage] = useState('Load a fixture to start.'), [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<'normal' | 'selected' | 'duplicate'>('normal');
  const [saveState, setSaveState] = useState<FileSaveState | null>(null);
  const actions = useEditorActions(history, page, selected, setSelected, library, setMessage);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key.toLowerCase() === 'q' && !event.repeat) { event.preventDefault(); actions.cycleSelectedPhotos(); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });
  function fixture(nextMode: typeof mode) {
    const project = makeProject(), photos: PhotoLibrary = new Map();
    for (const [index, width, height] of [[1, 300, 200], [2, 200, 300], [3, 200, 200], [4, 300, 200]]) {
      const id = String(index).repeat(64), name = `${index}.jpg`;
      photos.set(id, { ref: { id, name, relativePath: name, width, height, size: 1, lastModified: 1 }, file: new File(['x'], name), previewUrl: '', image: new Image() });
    }
    const p = project.pages[0];
    p.elements = [makeFrame('rect', 0, 0, 100, 150), makeFrame('rect', 160, 0, 150, 100), makeFrame('ellipse', 340, 0, 100, 100), { ...makeFrame('rect', 500, 0, 150, 100), photo: coverPhoto('4'.repeat(64), 300, 200, 150, 100) }];
    project.assets = [...photos.values()].map(photo => photo.ref);
    project.allowDuplicates = nextMode === 'duplicate';
    setMode(nextMode); setLibrary(photos); setSelected(p.elements.map(element => element.id)); history.replace(project);
    setSaveState(restoreFileSaveState(project, null, false, Date.now())); setMessage('Fixture ready.');
  }
  function fill() {
    actions.autoFill(mode === 'selected' ? ['1'.repeat(64), '2'.repeat(64)] : [], mode === 'duplicate' ? ['2'.repeat(64)] : ['1'.repeat(64), '2'.repeat(64), '3'.repeat(64)]);
    const frames = history.current.current.pages[0].elements as FrameElement[];
    const actual = frames.map(frame => frame.photo?.assetId[0] ?? '-').join(',');
    const expected = mode === 'normal' ? '2,1,3,4' : mode === 'selected' ? '2,1,-,4' : '2,2,2,4';
    setMessage(`${actual === expected ? 'PASS' : 'FAIL'} · ${mode} auto-fill: ${actual}; expected ${expected}. Existing photo 4 preserved.`);
  }
  function dueReminder() {
    const now = Date.now(), saved = recordFileEvent(history.project, history.project, { at: now - FILE_SAVE_REMINDER_MS * 2, format: '.canpack', action: 'saved' });
    setSaveState({ ...observeFileChanges(saved, { ...history.project, name: 'Edited' }, now - FILE_SAVE_REMINDER_MS), now });
  }
  const deadline = saveState ? fileReminderAt(saveState) : null;
  return <main className="editor" style={{ padding: 24, gap: 16 }}>
    <h1>Auto-fill, Q photo cycle and file reminder browser checks</h1>
    <div><button onClick={() => fixture('normal')}>Load mixed orientations</button><button onClick={() => fixture('selected')}>Load selected-only case</button><button onClick={() => fixture('duplicate')}>Load duplicate case</button></div>
    <div><button disabled={!library.size} onClick={fill}>Run auto-fill check</button><button disabled={!history.canUndo} onClick={history.undo}>Undo</button><button disabled={!history.canRedo} onClick={history.redo}>Redo</button><button onClick={dueReminder}>Show overdue reminder</button></div>
    <p>All fixture frames are selected. After Auto-fill, press Q to cycle their photo slots.</p>
    <p role="status">{message}</p>
    <ul>{page.elements.map(element => <li key={element.id}>{element.width} × {element.height}: photo {element.type === 'frame' ? element.photo?.assetId[0] ?? 'empty' : ''}</li>)}</ul>
    <FileSaveStatus state={saveState} reminder={!!saveState && deadline !== null && saveState.now >= deadline} busy={false} onSave={() => setSaveState(recordFileEvent(history.project, history.project, { at: Date.now(), format: '.can', action: 'downloaded' }))} onLater={() => setSaveState(state => state ? snoozeFileReminder(state, Date.now()) : state)}/>
  </main>;
}
