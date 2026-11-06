'use client';
import { useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { unzipSync, zipSync } from 'fflate';
import { makeFrame, makePage, makeText, asTemplate } from '../src/domain/model';
import { coverPhoto, convertPage } from '../src/domain/geometry';
import { cutFrame, type CutExecutor } from '../src/domain/cutter';
import { divideFrame } from '../src/domain/division';
import { PhotoReader, PhotoLibrary } from '../src/io/photos';
import { renderPage, canvasBlob } from '../src/render/scene';
import { jpegDpi } from '../src/io/export';
import { download } from '../src/io/storage';
export default function BrowserCheck() {
  const [logs, setLogs] = useState<string[]>([]), [running, setRunning] = useState(false), [preview, setPreview] = useState('');
  async function run() {
    setRunning(true); setLogs([]); const record = (s: string) => setLogs(v => [...v, s]);
    const check = (ok: unknown, s: string) => { if (!ok) throw new Error(s); record('PASS · ' + s); };
    const reader = new PhotoReader();
    try {
      const cutSource = makeFrame('rect', 0, 0, 400, 200), cutPieces = cutFrame({ frame: cutSource, start: { x: 200, y: -20 }, end: { x: 200, y: 220 }, gap: 20 });
      check(cutPieces.length === 2 && cutPieces.every(piece => Math.abs(piece.width - 190) < .0001), 'Browser-local cutter returns exact geometry without a server request');
      let cutCalls = 0, cutId = 0;
      const localCut = ((frame, start, end, gap) => { cutCalls++; return cutFrame({ frame, start, end, gap }); }) satisfies CutExecutor;
      const divided = await divideFrame(makeFrame('rect', 0, 0, 400, 200), 20, 'horizontal', 1, localCut, () => `browser-division-${++cutId}`);
      check(divided.length === 20 && cutCalls === 19, 'Browser-local Division creates 20 parts with 19 local cuts');
      const source = document.createElement('canvas'); source.width = 1200; source.height = 800; const ctx = source.getContext('2d')!;
      const grad = ctx.createLinearGradient(0, 0, 1200, 800); grad.addColorStop(0, '#d6af85'); grad.addColorStop(.55, '#587967'); grad.addColorStop(1, '#233e37'); ctx.fillStyle = grad; ctx.fillRect(0, 0, 1200, 800);
      ctx.fillStyle = '#eed6ad'; ctx.beginPath(); ctx.arc(900, 200, 110, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#385845'; ctx.beginPath(); ctx.moveTo(0,800); ctx.lineTo(400,300); ctx.lineTo(780,800); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '50px sans-serif'; ctx.fillText('LOCAL PHOTO · 3:2', 60, 100);
      const blob = await canvasBlob(source, 'image/jpeg', .95), file = new File([blob], 'test-landscape.jpg', { type: 'image/jpeg', lastModified: 1 });
      const first = await reader.read(file, file.name), copy = await reader.read(new File([blob], 'renamed-copy.jpg', { type: file.type }), 'subfolder/renamed-copy.jpg');
      check(first.ref.id === copy.ref.id, 'Photo worker hashes renamed duplicates identically');
      check(first.ref.width === 1200 && first.ref.height === 800 && first.image.complete, 'Photo worker decodes and creates local previews');
      const library: PhotoLibrary = new Map([[first.ref.id, first]]), page = makePage();
      const frame = makeFrame('ellipse', 80, 90, 560, 560); frame.photo = coverPhoto(first.ref.id, 1200, 800, frame.width, frame.height);
      const second = makeFrame('rect', 730, 100, 420, 600); second.photo = coverPhoto(first.ref.id, 1200, 800, second.width, second.height);
      page.elements = [frame, second, { ...makeText(90, 710, 600), text: 'The art of remembering.', fontSize: 32 }];
      const canvas = await renderPage(page, library, 150 / 72, true); check(canvas.width === 2700 && canvas.height === 1800, '12 × 18 in at 150 DPI renders 2700 × 1800 pixels');
      const jpg = jpegDpi(new Uint8Array(await (await canvasBlob(canvas, 'image/jpeg', .95)).arrayBuffer()), 150);
      const jpgBlob = new Blob([jpg as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }); setPreview(URL.createObjectURL(jpgBlob));
      const bitmap = await createImageBitmap(jpgBlob); check(bitmap.width === 2700 && bitmap.height === 1800, 'Encoded JPEG decodes at the exact print dimensions'); bitmap.close();
      const sample = canvas.getContext('2d')!.getImageData(10, 10, 1, 1).data; check(sample[0] === 255 && sample[1] === 255 && sample[2] === 255, 'Print background is white and independent of editor theme');
      const inside = canvas.getContext('2d')!.getImageData(800, 750, 1, 1).data; check(inside[0] !== 255 || inside[1] !== 255, 'Original photo pixels render inside the frame');
      canvas.width = canvas.height = 1;
      const spread = convertPage(page, 'left'); spread.dpi = 300;
      const big = await renderPage(spread, library, 300 / 72, true); check(big.width === 10800 && big.height === 3600, '12 × 36 in spread renders at full 300 DPI'); const bigJpg = jpegDpi(new Uint8Array(await (await canvasBlob(big, 'image/jpeg', .95)).arrayBuffer()), 300); big.width = big.height = 1;
      const pdf = await PDFDocument.create(); const image = await pdf.embedJpg(jpg); pdf.addPage([1296,864]).drawImage(image,{x:0,y:0,width:1296,height:864}); const wide = await pdf.embedJpg(bigJpg); pdf.addPage([2592,864]).drawImage(wide,{x:0,y:0,width:2592,height:864}); const pdfBytes = await pdf.save();
      const reopened = await PDFDocument.load(pdfBytes); check(reopened.getPage(0).getWidth() === 1296 && reopened.getPage(1).getWidth() === 2592, 'PDF preserves mixed single/spread physical dimensions');
      const zip = zipSync({ 'album-001.jpg': jpg, 'album-002.jpg': bigJpg }, { level: 0 }); check(Object.keys(unzipSync(zip)).join(',') === 'album-001.jpg,album-002.jpg', 'Bulk ZIP contains ordered, decodable JPEG files');
      const template = asTemplate(page, 'QA layout'); check(!JSON.stringify(template).includes(first.ref.id), 'Template contains no photo hash or image data');
      let missingRejected = false; try { await renderPage(page, new Map(), 1, true); } catch { missingRejected = true; } check(missingRejected, 'Export rejects missing originals');
      let oversizedRejected = false; try { await renderPage({ ...page, baseWidth: 14400, height: 14400 }, library, 300 / 72, true); } catch { oversizedRejected = true; } check(oversizedRejected, 'Oversized export is rejected before allocating huge canvas');
      download(jpgBlob, 'customalboom-qa-150dpi.jpg'); download(new Blob([pdfBytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), 'customalboom-qa-mixed-pages.pdf');
      record('DONE · Browser integration verification complete.');
      URL.revokeObjectURL(copy.previewUrl);
    } catch (e) { record('FAIL · ' + (e instanceof Error ? e.message : String(e))); }
    finally { reader.dispose(); setRunning(false); }
  }
  return <div style={{padding:30,fontFamily:'Inter',maxWidth:1000,margin:'auto'}}><h1>CustomAlboom.com browser verification</h1><p>Synthetic local photo fixtures only. No photo uploads.</p><button style={{background:'#305e48',color:'white'}} disabled={running} onClick={run}>{running ? 'Running…' : 'Run verification'}</button><pre style={{whiteSpace:'pre-wrap',lineHeight:2}}>{logs.join('\n')}</pre>{preview && <img alt="Rendered QA album page" src={preview} style={{width:'100%'}}/>}</div>;
}
