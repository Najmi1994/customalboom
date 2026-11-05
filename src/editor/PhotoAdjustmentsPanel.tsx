'use client';
import { useEffect, useState } from 'react';
import { Eye, RotateCcw, SlidersHorizontal } from 'lucide-react';
import type { FrameElement, PhotoAdjustments } from '../domain/model';
import { NEUTRAL, adjustmentKeys, isNeutral } from '../domain/photoAdjustments';
import { clampPhoto } from '../domain/geometry';
import type { LocalPhoto } from '../io/photos';

export function photoZoom(frame: FrameElement, asset: LocalPhoto) {
  return frame.photo!.width / (asset.ref.width * Math.max(frame.width / asset.ref.width, frame.height / asset.ref.height));
}
export function zoomPhoto(frame: FrameElement, asset: LocalPhoto, value: number): FrameElement {
  const p = frame.photo!, cover = Math.max(frame.width / asset.ref.width, frame.height / asset.ref.height);
  const width = asset.ref.width * cover * value, height = asset.ref.height * cover * value, ratio = width / p.width;
  return { ...frame, photo: clampPhoto({ ...p, width, height, x: frame.width / 2 - (frame.width / 2 - p.x) * ratio, y: frame.height / 2 - (frame.height / 2 - p.y) * ratio }, frame.width, frame.height) };
}

type Props = { frame: FrameElement; asset: LocalPhoto; onChange: (frame: FrameElement) => void; compare: boolean; onCompare: (value: boolean) => void; onFinish: (save: boolean) => void };
export default function PhotoAdjustmentsPanel({ frame, asset, onChange, compare, onCompare, onFinish }: Props) {
  const settings = { ...NEUTRAL, ...frame.photo!.adjustments };
  useEffect(() => {
    const release = () => onCompare(false);
    window.addEventListener('blur', release); document.addEventListener('visibilitychange', release);
    return () => { window.removeEventListener('blur', release); document.removeEventListener('visibilitychange', release); };
  }, [onCompare]);
  function update(key: keyof PhotoAdjustments, value: number) {
    const adjustments = { ...settings, [key]: value };
    onChange({ ...frame, photo: { ...frame.photo!, adjustments: isNeutral(adjustments) ? undefined : adjustments } });
  }
  return <aside className="left-panel photo-adjustments" aria-label="Photo Adjustments">
    <div className="adjustment-heading"><SlidersHorizontal size={17}/><h2>Photo Adjustments</h2></div>
    <div className="adjustment-scroll">
      <div className="adjustment-file"><strong title={asset.ref.name}>{asset.ref.name}</strong><small>{asset.ref.width.toLocaleString()} × {asset.ref.height.toLocaleString()} px</small></div>
      <div className="adjustment-zoom"><label htmlFor="photo-zoom">Zoom <output>{Math.round(photoZoom(frame, asset) * 100)}%</output></label><input autoFocus id="photo-zoom" aria-label="Photo zoom" type="range" min="1" max={Math.max(5, photoZoom(frame, asset))} step="0.01" value={photoZoom(frame, asset)} onChange={e => onChange(zoomPhoto(frame, asset, Number(e.target.value)))}/><p>Drag the image or resize with corner handles.</p></div>
      <div className="adjustment-sliders">{adjustmentKeys.map(key => <AdjustmentSlider key={key} name={key} value={settings[key]} onChange={value => update(key, value)}/>)}</div>
      <div className="adjustment-tools"><button disabled={isNeutral(settings)} onClick={() => onChange({ ...frame, photo: { ...frame.photo!, adjustments: undefined } })}><RotateCcw size={14}/> Reset Adjustments</button>
        <button className={compare ? 'comparing' : ''} aria-pressed={compare} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); onCompare(true); }} onPointerUp={() => onCompare(false)} onPointerCancel={() => onCompare(false)} onLostPointerCapture={() => onCompare(false)} onBlur={() => onCompare(false)} onKeyDown={e => { if (e.key === ' ') { e.preventDefault(); onCompare(true); } }} onKeyUp={e => { if (e.key === ' ') { e.preventDefault(); onCompare(false); } }}><Eye size={14}/>{compare ? 'Showing original' : 'Hold to Compare'}</button></div>
    </div>
    <div className="adjustment-actions"><button onClick={() => onFinish(false)}>Cancel</button><button className="adjustment-done" title="Done (Enter)" aria-keyshortcuts="Enter" onClick={() => onFinish(true)}>Done</button></div>
  </aside>;
}

function AdjustmentSlider({ name, value, onChange }: { name: keyof PhotoAdjustments; value: number; onChange: (value: number) => void }) {
  const exposure = name === 'exposure', min = exposure ? -2 : -100, max = -min, step = exposure ? .05 : 1;
  const label = name[0].toUpperCase() + name.slice(1), display = (v: number) => exposure ? v.toFixed(2) : String(v);
  const [draft, setDraft] = useState(display(value));
  useEffect(() => setDraft(display(value)), [value]);
  const commit = () => {
    const n = Number(draft);
    if (draft.trim() && Number.isFinite(n)) { const valid = Number((Math.round(Math.max(min, Math.min(max, n)) / step) * step).toFixed(2)); setDraft(display(valid)); onChange(valid); }
    else setDraft(display(value));
  };
  return <div className="adjustment-slider"><div><label htmlFor={`tone-${name}`}>{label}{exposure && <small> EV</small>}</label><input aria-label={`${label} value`} type="number" min={min} max={max} step={step} value={draft} onChange={e => { setDraft(e.target.value); const n = Number(e.target.value); if (e.target.value.trim() && Number.isFinite(n) && n >= min && n <= max) onChange(n); }} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') { commit(); e.currentTarget.blur(); } }}/></div><input id={`tone-${name}`} aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}/></div>;
}
