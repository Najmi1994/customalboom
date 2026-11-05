import { AlertTriangle, FolderOpen, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { ManagedPhotoFolder } from '../io/photoFolders';
import Modal from './Modal';

export type FolderRemovalDetails = {
  folder: ManagedPhotoFolder;
  frames: number;
  backgrounds: number;
  pages: number;
  exclusivePhotos: number;
};

type Props = {
  folders: ManagedPhotoFolder[];
  busy: boolean;
  importingFolderId?: string;
  removal?: FolderRemovalDetails;
  onClose: () => void;
  onAdd: () => void;
  onToggle: (id: string, show: boolean) => void;
  onRefresh: (id: string) => void;
  onRequestRemove: (id: string) => void;
  onCancelRemove: () => void;
  onConfirmRemove: () => void;
};

export default function PhotoFolderManagerModal({ folders, busy, importingFolderId, removal, onClose, onAdd, onToggle, onRefresh, onRequestRemove, onCancelRemove, onConfirmRemove }: Props) {
  if (removal) {
    const used = removal.frames + removal.backgrounds;
    return <Modal title={used ? 'Remove folder and placed photos?' : 'Remove this photo folder?'} onClose={onCancelRemove} className="folder-remove-modal">
      {used ? <div className="folder-danger-warning"><AlertTriangle size={23}/><div><strong>This cannot be undone.</strong><p>Removing <b>{removal.folder.name}</b> will remove {removal.frames} photo placement{removal.frames === 1 ? '' : 's'} from frames and {removal.backgrounds} page background{removal.backgrounds === 1 ? '' : 's'} across {removal.pages} page{removal.pages === 1 ? '' : 's'}.</p></div></div> : <p className="modal-description">Remove <b>{removal.folder.name}</b> from this browser? Its {removal.exclusivePhotos} exclusive photo{removal.exclusivePhotos === 1 ? '' : 's'} will no longer appear in the tray.</p>}
      <p className="folder-remove-note">Photos also available in another managed folder will stay linked. Frames, layouts and page colours remain in place.</p>
      <div className="modal-actions"><button onClick={onCancelRemove}>Cancel</button><button className="destructive-button" onClick={onConfirmRemove}>{used ? 'Remove Folder & Photos' : 'Remove Folder'}</button></div>
    </Modal>;
  }

  return <Modal title="Manage photo folders" onClose={onClose} wide className="folder-manager-modal">
    <div className="folder-manager-list">
      {folders.map(folder => {
        const loading = importingFolderId === folder.id;
        return <div className="folder-manager-row" key={folder.id}>
          <label className="folder-show-toggle"><input type="checkbox" checked={folder.show} disabled={busy} onChange={event => onToggle(folder.id, event.target.checked)}/><span>Show</span></label>
          <span className={`folder-manager-icon ${folder.status}`}><FolderOpen size={20}/></span>
          <div className="folder-manager-info"><strong>{folder.name}</strong><span>{folder.photoCount} photo{folder.photoCount === 1 ? '' : 's'} · <i className={folder.status}>{folder.status === 'connected' ? 'Connected' : 'Reconnect required'}</i></span></div>
          <button disabled={busy} className="folder-row-action" onClick={() => onRefresh(folder.id)}>{loading ? <Loader2 className="spin" size={14}/> : <RefreshCw size={14}/>} {folder.status === 'connected' ? 'Refresh' : 'Reconnect'}</button>
          <button disabled={busy} className="folder-row-action danger" onClick={() => onRequestRemove(folder.id)}><Trash2 size={14}/> Remove</button>
        </div>;
      })}
      {!folders.length && <div className="folder-manager-empty"><FolderOpen size={30}/><strong>No photo folders yet.</strong><span>Add a folder to begin. Your photos stay on this computer.</span></div>}
    </div>
    <div className="folder-manager-footer"><span>{folders.length} managed folder{folders.length === 1 ? '' : 's'}</span><button className="primary" disabled={busy} onClick={onAdd}><Plus size={15}/> Add Folder</button></div>
  </Modal>;
}
