'use client';
import { useState, type FormEvent } from 'react';
import type { SupportSettings } from '../../src/print-shops/domain';
import styles from './support-photo.module.css';

type Portrait = SupportSettings['portrait'];
export default function SupportPhoto({ portrait, revision, busy, onBusy, onSaved }: {
  portrait: Portrait; revision: number; busy: boolean; onBusy: (busy: boolean) => void;
  onSaved: (revision: number, portrait: Portrait) => void;
}) {
  const [file, setFile] = useState<File | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  async function save(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const remove = !event;
    if (busy || (!remove && !file)) return;
    const formElement = event?.currentTarget;
    onBusy(true); setError(''); setNotice('');
    try {
      let body: FormData | string;
      if (remove) body = JSON.stringify({ revision });
      else {
        if (!file!.size || file!.size > 3 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file!.type)) throw new Error('Pilih PNG, JPEG atau WebP, maksimum 3 MB.');
        const bitmap = await createImageBitmap(file!).catch(() => { throw new Error('Gambar tidak dapat dibaca. Pilih gambar yang sah.'); });
        const pixels = bitmap.width * bitmap.height; bitmap.close();
        if (pixels > 40_000_000) throw new Error('Gambar terlalu besar. Pilih gambar di bawah 40 megapiksel.');
        body = new FormData(); body.set('revision', String(revision)); body.set('image', file!);
      }
      const response = await fetch('/api/kingkong/support-photo', { method: remove ? 'DELETE' : 'POST', ...(remove ? { headers: { 'Content-Type': 'application/json' } } : {}), body });
      const result = await response.json() as { revision: number; portrait: Portrait | null; error?: string };
      if (!response.ok) throw new Error(result.error || 'Gagal menyimpan gambar.');
      onSaved(result.revision, result.portrait ?? undefined); setFile(null); formElement?.reset();
      setNotice(remove ? 'Gambar dibuang. Paparan kopi kembali kepada teks sahaja.' : 'Gambar disimpan untuk popup kopi dan halaman Tips.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Gagal menyimpan gambar.'); }
    finally { onBusy(false); }
  }
  return <section className={styles.panel}>
    <h2>Gambar “Belanja saya kopi”</h2>
    <p>Gambar anda akan dipaparkan di sebelah kiri mesej pada popup kopi dan halaman Tips. Tanpa gambar, hanya teks dipaparkan.</p>
    <p>PNG, JPEG atau WebP · maksimum 3 MB. Gambar ini akan dipaparkan kepada umum selepas dimuat naik.</p>
    <div className={styles.controls}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {portrait && <img src={`/api/support/photo/${portrait.id}`} alt="Gambar kopi semasa"/>}
      <form onSubmit={save}>
        <label>Pilih gambar<input type="file" accept="image/png,image/jpeg,image/webp" required disabled={busy} onChange={event => setFile(event.target.files?.[0] ?? null)}/></label>
        <div className={styles.actions}><button className="kk-primary" disabled={busy || !file}>{busy ? 'Menyimpan…' : portrait ? 'Ganti gambar' : 'Upload gambar'}</button>
        {portrait && <button type="button" disabled={busy} onClick={() => { if (window.confirm('Buang gambar daripada semua paparan kopi?')) void save(); }}>Buang gambar</button>}</div>
      </form>
    </div>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </section>;
}
