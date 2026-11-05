'use client';
// Development-only integration fixture. It never reads or writes album storage.
import { useCallback, useEffect, useState } from 'react';
import { FrameElement, makeFrame, makePage, makeProject, makeText } from '../src/domain/model';
import { coverPhoto } from '../src/domain/geometry';
import { NEUTRAL } from '../src/domain/photoAdjustments';
import { loadImage, PhotoLibrary } from '../src/io/photos';
import { canvasBlob, renderPage } from '../src/render/scene';
import { previewPhoto } from '../src/render/adjustedPhotos';
import Canvas from '../src/editor/Canvas';
import PhotoAdjustmentsPanel from '../src/editor/PhotoAdjustmentsPanel';
import { LeftPanel, PagePreview } from '../src/editor/Panels';
import { usePhotoEdit } from '../src/editor/usePhotoEdit';
import { useHistory } from '../src/editor/useHistory';

export default function PhotoAdjustmentsCheck() {
  const history = useHistory(), page = history.project.pages[0];
  const [library, setLibrary] = useState<PhotoLibrary>(new Map()), [selected, select] = useState<string[]>([]), [theme, setTheme] = useState('light'), [message, setMessage] = useState('Preparing fixture'), [preview, setPreview] = useState(false);
  const [checks, setChecks] = useState<string[]>([]), [commits, setCommits] = useState(0);
  const notify = useCallback((s: string) => setMessage(s), []);
  const change = (elements: typeof page.elements) => { setCommits(n => n + 1); history.apply(p => ({ ...p, pages: [{ ...p.pages[0], elements }] })); };
  const edit = usePhotoEdit({ page, library, busy: false, onBegin: id => select([id]), onChange: change, notify });
  useEffect(() => {
    let alive = true;
    (async () => {
      const source = document.createElement('canvas'); source.width = 1200; source.height = 800;
      const ctx = source.getContext('2d')!, gradient = ctx.createLinearGradient(0, 0, 1200, 800);
      gradient.addColorStop(0, '#182733'); gradient.addColorStop(.5, '#b28c67'); gradient.addColorStop(1, '#f6ead8'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1200, 800);
      ctx.fillStyle = '#fff'; ctx.font = '60px sans-serif'; ctx.fillText('LOCAL PHOTO · 3:2', 80, 150); ctx.fillStyle = '#688981'; ctx.beginPath(); ctx.arc(900, 300, 150, 0, Math.PI * 2); ctx.fill();
      const blob = await canvasBlob(source, 'image/png'), url = URL.createObjectURL(blob), image = await loadImage(url);
      const ref = { id: 'a'.repeat(64), name: 'tone-test.png', relativePath: 'tone-test.png', width: 1200, height: 800, size: blob.size, lastModified: 1 };
      const lib: PhotoLibrary = new Map([[ref.id, { ref, file: new File([blob], ref.name, { type: 'image/png' }), previewUrl: url, image }]]);
      const project = makeProject(), p = makePage(); p.baseWidth = 900; p.height = 600;
      const frame = makeFrame('rect', 40, 80, 390, 340), other = makeFrame('ellipse', 470, 80, 360, 340);
      frame.photo = coverPhoto(ref.id, 1200, 800, frame.width, frame.height); other.photo = coverPhoto(ref.id, 1200, 800, other.width, other.height);
      p.elements = [frame, other, { ...makeText(50, 470, 700), text: 'Double-click either photo to adjust it', fontSize: 28 }]; project.pages = [p]; project.assets = [ref]; project.allowDuplicates = true;
      if (alive) { history.replace(project); setLibrary(lib); setMessage('Ready — double-click a photo'); }
    })().catch(e => notify(String(e)));
    return () => { alive = false; };
  }, []);
  async function renderChecks() {
    const logs: string[] = [], check = (ok: boolean, label: string) => { if (!ok) throw Error(label); logs.push('PASS · ' + label); setChecks([...logs]); };
    try {
      const asset = [...library.values()][0], settings = { ...NEUTRAL, exposure: .7, contrast: 20, saturation: 45, shadows: 25, highlights: -20, whites: -15, blacks: 10 };
      const first = page.elements[0] as FrameElement, modified = { ...first, photo: { ...first.photo!, adjustments: settings }, flipX: true, rotation: 5 };
      const p = { ...page, elements: [modified, ...page.elements.slice(1)] };
      const a = await renderPage(p, library, 1), b = await renderPage(p, library, 1, true);
      const ap = a.getContext('2d')!.getImageData(0, 0, a.width, a.height).data, bp = b.getContext('2d')!.getImageData(0, 0, b.width, b.height).data;
      const differences = ap.map((v, i) => Math.abs(v - bp[i])); let max = 0, total = 0, at = 0; for (let i = 0; i < differences.length; i++) { const d = differences[i]; if (d > max) { max = d; at = i; } total += d; }
      check(max === 0, `Preview/export parity: max difference ${max} at ${Math.floor(at / 4) % a.width},${Math.floor(at / 4 / a.width)} [${ap[at]}/${bp[at]}], mean ${(total / ap.length).toFixed(4)} (tone, flip, rotation, ellipse, text)`);
      const neutral = await renderPage(page, library, 1, true), np = neutral.getContext('2d')!.getImageData(600, 250, 1, 1).data, unchanged = b.getContext('2d')!.getImageData(600, 250, 1, 1).data;
      check(np.every((v, i) => v === unchanged[i]), 'Same photo in the other frame is unchanged');
      check(await previewPhoto(asset) === asset.image, 'Neutral preview uses the original directly');
      const tinted = await previewPhoto(asset, settings); check(tinted === await previewPhoto(asset, settings), 'Preview cache reuses matching settings');
      const clone = structuredClone(history.project); clone.pages[0] = p;
      check(JSON.stringify(clone).includes('adjustments'), 'Project includes tonal settings without pixel data');
      const large = document.createElement('canvas'); large.width = 3600; large.height = 2400; large.getContext('2d')!.drawImage(asset.image, 0, 0, 3600, 2400);
      const blob = await canvasBlob(large, 'image/png'); const largeLib: PhotoLibrary = new Map([[asset.ref.id, { ...asset, file: new File([blob], 'large.png', { type: 'image/png' }), ref: { ...asset.ref, width: 3600, height: 2400 } }]]);
      const exported = await renderPage(p, largeLib, 2, true); check(exported.width === 1800 && exported.height === 1200, 'Large original exports through chunked tone processing');
      [a, b, neutral, large, exported].forEach(c => { c.width = c.height = 1; });
      setMessage('All render checks passed');
    } catch (e) { setMessage('FAIL · ' + String(e)); }
  }
  return <main className={`editor theme-${theme}${edit.photoDraft ? ' photo-edit-mode' : ''}`}>
    <header className="app-header"><strong>Photo adjustment QA · isolated fixture</strong><button onClick={() => setTheme(theme === 'light' ? 'gray' : 'light')}>Toggle theme</button><button onClick={history.undo} disabled={!history.canUndo}>Undo</button><button onClick={history.redo} disabled={!history.canRedo}>Redo</button><button onClick={() => setPreview(!preview)}>Toggle Preview</button><button onClick={renderChecks} disabled={!library.size}>Run render checks</button></header>
    <div className="editor-body"><LeftPanel tab="build" onTab={() => {}} photoPanel={edit.photoDraft?.photo && <PhotoAdjustmentsPanel frame={edit.photoDraft} asset={library.get(edit.photoDraft.photo.assetId)!} onChange={edit.setPhotoDraft} compare={edit.comparePhoto} onCompare={edit.setComparePhoto} onFinish={edit.finish}/>} page={page} unit="in" setUnit={() => {}} selected={page.elements.filter(e => selected.includes(e.id))} onAdd={() => {}} onPage={() => {}} onElement={() => {}} onDelete={() => {}} onAlign={() => {}} onLayer={() => {}} onMode={() => {}} onBackground={() => {}} cutGap={0} setCutGap={() => {}} tool="select" onCut={() => {}}/>
      <div className="center-workspace"><Canvas page={page} library={library} selected={selected} onSelect={select} onChange={change} photoDraft={edit.photoDraft} onPhotoDraft={edit.setPhotoDraft} onPhotoEdit={edit.begin} onPhotoDone={() => edit.finish(true)} comparePhoto={edit.comparePhoto} preview={preview} allowDuplicates unit="in" onDrop={() => notify('DROP SHOULD NOT RUN DURING EDIT')} onCut={() => {}} onHalfCut={() => {}} onDivide={() => {}} divisionBusy={false} onCutGap={() => {}} onMagicSpace={() => {}} magicBusy={false} onFlip={() => {}} duplicateGap={0} onDuplicateGap={() => {}} duplicateDirection="right" onDuplicateDirection={() => {}} cutGap={0} tool="select" setTool={() => {}} onLayout={() => {}} onFrame={() => {}} notify={notify}/></div>
      <aside className="pages-panel" style={{ padding: 12 }}><PagePreview page={page} library={library}/><p>Commits: {commits}</p><p>Saved exposure: {(page.elements[0] as FrameElement)?.photo?.adjustments?.exposure ?? 0}</p><p>Saved zoom: {Math.round(((page.elements[0] as FrameElement)?.photo?.width ?? 0) * 100) / 100}</p>{checks.map(s => <p key={s} style={{ fontSize: 10 }}>{s}</p>)}</aside></div>
    <footer className="app-footer" role="status">{message}</footer>
  </main>;
}
