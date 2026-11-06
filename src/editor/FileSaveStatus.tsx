import { Save } from 'lucide-react';
import { FileSaveState } from './fileSaveState';

export default function FileSaveStatus({ state, reminder, busy, onSave, onLater }: {
  state: FileSaveState | null; reminder: boolean; busy: boolean; onSave: () => void; onLater: () => void;
}) {
  const event = state?.event;
  const time = event ? new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const date = event ? new Date(event.at).toLocaleString() : '';
  const label = !state ? 'Checking file status…' : !event ? 'No project-file save recorded' : event.action === 'downloaded' ? `Last ${event.format} download started at ${time}` : event.action === 'opened' ? `Opened ${event.format} at ${time}` : `Last ${event.format} file saved at ${time}`;
  const details = event?.action === 'downloaded' ? `${date}. Check your browser downloads to confirm the file was kept.` : event ? `${date}. ${event.action === 'opened' ? 'Opening a file does not save later edits.' : 'File writing completed.'}` : 'Use Save project to keep a separate file. Browser autosave is not a project-file backup.';
  return <div className={`file-save-bar${reminder ? ' file-save-reminder' : ''}`}>
    <Save size={14} aria-hidden="true"/>
    <div className="file-save-copy">
      <span title={details}>{label}{state && state.dirtySince !== null ? ' · Unsaved changes' : ''}</span>
      {reminder && <strong role="status">Time to save a project file. Browser autosave does not update your saved files.</strong>}
    </div>
    {reminder && <button disabled={busy} onClick={onLater}>Remind me later</button>}
    <button className="file-save-action" disabled={busy || !state} onClick={onSave}>Save project</button>
  </div>;
}
