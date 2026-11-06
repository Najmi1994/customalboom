'use client';
import { useEffect, useState, type FormEvent } from 'react';
import type { PublicInfoBanner } from '../../../src/info/domain';
import { MAX_BANNER_BYTES } from '../../../src/info/domain';

type Payload = { revision: number; banners: PublicInfoBanner[] };
async function request(init?: RequestInit): Promise<Payload> {
  const response = await fetch('/api/kingkong/info-banners', init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Tidak dapat menyimpan banner.');
  return payload;
}
export default function InfoBanners() {
  const [data, setData] = useState<Payload | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => { let alive = true; request().then(value => { if (alive) setData(value); }).catch(cause => { if (alive) setError(cause.message); }); return () => { alive = false; }; }, []);
  async function save(event: FormEvent<HTMLFormElement>, banner?: PublicInfoBanner) {
    event.preventDefault();
    if (!data) return;
    const formElement = event.currentTarget, form = new FormData(formElement);
    setError(''); setNotice(''); setBusy(true);
    try {
      if (banner) {
        setData(await request({ method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: banner.id, revision: data.revision, title: form.get('title'), url: form.get('url') }) }));
      } else {
        const file = form.get('image');
        if (!(file instanceof File) || !file.size || file.size > MAX_BANNER_BYTES) throw new Error('Pilih gambar maksimum 3 MB.');
        // Decode before uploading so corrupt images do not become public banners.
        const preview = await createImageBitmap(file);
        preview.close();
        form.set('revision', String(data.revision));
        setData(await request({ method: 'POST', body: form }));
        formElement.reset();
      }
      setNotice('Banner disimpan. Perubahan tersedia di /info.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Gagal menyimpan banner.'); }
    finally { setBusy(false); }
  }
  async function remove(banner: PublicInfoBanner) {
    if (!data || !window.confirm(`Buang banner “${banner.title}”?`)) return;
    setBusy(true); setError(''); setNotice('');
    try { setData(await request({ method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: banner.id, revision: data.revision }) })); setNotice('Banner dibuang.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Gagal membuang banner.'); }
    finally { setBusy(false); }
  }
  async function reload() {
    setBusy(true);
    try { setData(await request()); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Gagal memuat semula.'); } finally { setBusy(false); }
  }
  return <section className="kk-settings-card kk-info-banners"><header><div><h2>Banner halaman Info</h2><p>Maksimum 5 banner. Semua dipaparkan terus mengikut turutan ditambah, tanpa rotation.</p><p>Nisbah lebar:tinggi 1:1.5 · Cadangan 600 × 900 px · PNG, JPEG, WebP · Maksimum 3 MB. Gambar iklan ini dimuat naik ke server.</p><a href="/info" target="_blank" rel="noopener noreferrer">Lihat halaman /info ↗</a></div></header>
    {error && <div className="kk-alert error" role="alert">{error}<button disabled={busy} onClick={() => void reload()}>Muat semula</button></div>}{notice && <div className="kk-alert success" role="status">{notice}</div>}
    {!data && !error && <p>Memuatkan banner…</p>}
    {data && <><p>{data.banners.length} / 5 banner</p><div className="kk-banner-list">{data.banners.map(banner => <form key={`${banner.id}:${data.revision}`} onSubmit={event => void save(event, banner)}><img src={`/api/info-banners/${banner.id}`} alt={banner.title} width={120} height={180}/><div><label>Nama / teks alternatif<input name="title" defaultValue={banner.title} maxLength={120} required disabled={busy}/></label><label>URL CTA (pilihan)<input name="url" type="url" defaultValue={banner.url} maxLength={2048} placeholder="https://…" disabled={busy}/></label><div className="kk-banner-actions"><button className="kk-primary" disabled={busy}>Simpan perubahan</button><button type="button" disabled={busy} onClick={() => void remove(banner)}>Buang</button></div></div></form>)}</div>
    {data.banners.length < 5 ? <form className="kk-banner-add" onSubmit={event => void save(event)}><h3>Tambah banner</h3><label>Nama / teks alternatif<input name="title" maxLength={120} required disabled={busy}/></label><label>Gambar banner<input type="file" name="image" accept="image/png,image/jpeg,image/webp" required disabled={busy}/></label><label>URL CTA (pilihan)<input type="url" name="url" maxLength={2048} placeholder="https://…" disabled={busy}/></label><button className="kk-primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Upload & paparkan'}</button></form> : <p>Had 5 banner dicapai. Buang satu banner untuk menambah yang baharu.</p>}</>}
  </section>;
}
