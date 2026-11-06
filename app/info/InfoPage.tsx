'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, FolderOpen, Files, PackageOpen, Check, Minus } from 'lucide-react';
import type { PublicInfoBanner } from '../../src/info/domain';

const copy = {
  ms: {
    back: 'Buka editor',
    photoTitle: 'Kami tidak simpan gambar anda.', photoIntro: 'Gambar album tidak dimuat naik atau disimpan pada server kami. Editor membaca gambar terus daripada folder yang anda benarkan pada komputer.',
    photoNote: 'Pilih folder yang betul — folder yang mengandungi gambar itu sendiri. Subfolder tidak dibaca secara automatik. Jika gambar ada dalam “Reefa & Asrul → Nikah”, pilih “Nikah”.',
    photoFoot: 'Preview digunakan dalam browser untuk mengedit. Fail asal tidak diubah. Jika folder dipindahkan, akses terputus atau gambar hilang, sambungkan semula folder melalui Manage folders.',
    saveTitle: 'Maklumat bila “Save File”', saveIntro: 'Bayangkan album sebagai satu pelan susunan, dan gambar sebagai bahan untuk membinanya.',
    canTitle: 'Pelan sahaja', canDesc: 'Seperti menyimpan pelan rumah tanpa membawa bahan binaan. Susunan, teks dan rujukan gambar ada; gambar asal kekal dalam folder.',
    canPros: ['Fail kecil, cepat disimpan dan mudah diurus.', 'Sesuai untuk kerja harian. Ctrl+S menggunakan format ini.'],
    canCons: ['Perlu folder asal atau gambar yang sama untuk sambung mengedit dan export.', 'Menghantar fail ini sahaja tidak membawa gambar bersama.'],
    packTitle: 'Pelan + bahan dalam satu beg', packDesc: 'Seperti membawa pelan bersama bahan yang sudah digunakan. Layout dan gambar asal yang digunakan dalam frame atau background dibungkus sekali.',
    packPros: ['Mudah pindah komputer atau berkongsi projek bersama gambar.', 'Boleh edit dan export tanpa membuka folder asal. Gambar berulang disimpan sekali.'],
    packCons: ['Fail lebih besar, hampir jumlah saiz gambar asal yang digunakan; mesti kurang daripada 2 GB.', 'Gambar yang belum digunakan tidak disertakan. Save disekat jika gambar digunakan belum disambungkan.'],
    pros: 'Kelebihan', cons: 'Perlu tahu', packNote: 'Fail .canpack disimpan pada lokasi yang anda pilih, bukan pada server. Selepas refresh atau browser ditutup, buka semula .canpack untuk mendapatkan gambarnya.',
    openTitle: 'Bila anda buka semula…', openIntro: 'Pilih File → Open project. Simpan projek semasa dahulu jika anda mahu menyimpannya sebelum membuka projek lain.',
    openCan: ['Layout dan teks dipulihkan.', 'Jika gambar yang sepadan sudah tersedia, ia dipaparkan terus.', 'Jika gambar tiada, placeholder dipaparkan. Pilih folder yang betul dalam Manage folders; export yang memerlukan gambar itu disekat sehingga disambung.'],
    openPack: ['Pakej diperiksa sebelum menggantikan projek aktif.', 'Layout serta gambar dalam pakej dimuatkan ke sesi browser dan muncul dalam photo tray.', 'Anda boleh terus mengedit dan export. Folder yang masih tersambung turut tersedia.'],
    autosave: 'Autosave membantu memulihkan layout dalam browser ini. Ia bukan salinan sandaran gambar atau pengganti fail save. Simpan projek secara berkala.',
    ads: 'RUANG IKLAN', adsTitle: 'Pilihan untuk anda', cta: 'Ketahui lanjut', footer: 'Reka dengan tenang. Simpan dengan yakin.',
  },
  en: {
    back: 'Open editor',
    photoTitle: 'We do not store your photos.', photoIntro: 'Album photos are never uploaded to or stored on our server. The editor reads them directly from a folder you allow on your computer.',
    photoNote: 'Choose the folder that actually contains your photos. Subfolders are not read automatically. If your photos are in “Reefa & Asrul → Nikah”, select “Nikah”.',
    photoFoot: 'Previews are used in your browser for editing. Original files stay unchanged. If a folder moves, access is lost or photos are missing, reconnect the folder through Manage folders.',
    saveTitle: 'What happens when you “Save File”', saveIntro: 'Think of your album as a building plan, and your photos as the materials that bring it to life.',
    canTitle: 'Just the plan', canDesc: 'Like keeping a house plan without carrying the building materials. Layout, text and photo references are saved; original photos stay in their folder.',
    canPros: ['Small files that are quick to save and easy to manage.', 'Ideal for everyday work. Ctrl+S uses this format.'],
    canCons: ['You need the original folder or matching photos to continue editing and export.', 'Sending this file alone does not include the photos.'],
    packTitle: 'Plan + materials in one bag', packDesc: 'Like packing the plan with the materials already in use. It includes the layout and original photos used in frames or page backgrounds.',
    packPros: ['Easy to move computers or share a project with its photos.', 'Edit and export without the original folder. Repeated photos are included only once.'],
    packCons: ['Larger files, roughly the total size of used originals; must stay below 2 GB.', 'Unused photos are excluded. Saving is blocked if a used photo is not connected.'],
    pros: 'Advantages', cons: 'Keep in mind', packNote: 'The .canpack is saved to a location you choose, not our server. After a refresh or closing the browser, reopen the .canpack to restore its photos.',
    openTitle: 'When you open it again…', openIntro: 'Choose File → Open project. Save your current project first if you want to keep it before opening another one.',
    openCan: ['Your layout and text are restored.', 'Matching photos already available in the editor appear immediately.', 'Missing photos show placeholders. Reconnect the correct folder in Manage folders; exports that need those photos stay blocked until they are available.'],
    openPack: ['The package is checked before replacing your active project.', 'Its layout and photos load into your browser session and appear in the photo tray.', 'You can edit and export immediately. Folders that are still connected remain available too.'],
    autosave: 'Autosave helps restore the layout in this browser. It is not a photo backup or a replacement for saved project files. Save your project regularly.',
    ads: 'ADVERTISEMENT', adsTitle: 'Selected for you', cta: 'Learn more', footer: 'Create with ease. Save with confidence.',
  },
};

export default function InfoPage({ banners }: { banners: PublicInfoBanner[] }) {
  const [language, setLanguage] = useState<'ms' | 'en'>('en');
  const t = copy[language];
  return <main className="info-page" lang={language}>
    <header className="info-header"><Link href="/" className="info-brand"><Image src="/customalboom-logo.png" alt="" width={42} height={42}/><span>CustomAlboom<span>.com</span></span></Link><div className="info-header-actions"><div className="info-language" role="group" aria-label="Language / Bahasa"><button aria-pressed={language === 'ms'} onClick={() => setLanguage('ms')}>BM</button><button aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>English</button></div><Link className="info-editor" href="/">{t.back}<ArrowUpRight size={16}/></Link></div></header>
    <div className="info-content">
      <section className="info-section"><div className="info-section-heading"><span className="info-icon"><FolderOpen/></span><div><h1>{t.photoTitle}</h1></div></div><p className="info-lead">{t.photoIntro}</p><aside className="info-callout">{t.photoNote}</aside><p>{t.photoFoot}</p></section>
      <section className="info-section"><div className="info-section-heading"><span className="info-icon"><Files/></span><div><h2>{t.saveTitle}</h2></div></div><p>{t.saveIntro}</p><div className="info-save-grid">{[
        { ext: '.can', name: 'Save project', title: t.canTitle, description: t.canDesc, pros: t.canPros, cons: t.canCons },
        { ext: '.canpack', name: 'Save project with photos', title: t.packTitle, description: t.packDesc, pros: t.packPros, cons: t.packCons },
      ].map(item => <article className="info-save-card" key={item.ext}><div className="info-file-heading"><strong>{item.ext}</strong><span>{item.name}</span></div><h3>{item.title}</h3><p>{item.description}</p><h4>{t.pros}</h4><ul>{item.pros.map(line => <li key={line}><Check size={15}/><span>{line}</span></li>)}</ul><h4>{t.cons}</h4><ul>{item.cons.map(line => <li key={line}><Minus size={15}/><span>{line}</span></li>)}</ul></article>)}</div><aside className="info-callout">{t.packNote}</aside></section>
      <section className="info-section"><div className="info-section-heading"><span className="info-icon"><PackageOpen/></span><div><h2>{t.openTitle}</h2></div></div><p>{t.openIntro}</p><div className="info-open-grid">{[{ ext: '.can', steps: t.openCan }, { ext: '.canpack', steps: t.openPack }].map(item => <article key={item.ext}><h3>{item.ext}</h3><ol>{item.steps.map(line => <li key={line}>{line}</li>)}</ol></article>)}</div><aside className="info-callout">{t.autosave}</aside></section>
      {banners.length > 0 && <section className="info-ad-section" aria-label={t.ads}><h2>{t.adsTitle}</h2><div className="info-banner-grid">{banners.map(banner => <article className="info-banner" key={banner.id}>{banner.url ? <a href={banner.url} target="_blank" rel="sponsored noopener noreferrer"><img src={`/api/info-banners/${banner.id}`} alt={banner.title} width={600} height={900} loading="lazy"/><span>{banner.title}<span>{t.cta} <ArrowUpRight size={16}/></span></span></a> : <><img src={`/api/info-banners/${banner.id}`} alt={banner.title} width={600} height={900} loading="lazy"/><p>{banner.title}</p></>}</article>)}</div></section>}
      <footer className="info-footer"><span>CustomAlboom.com</span><span>{t.footer}</span></footer>
    </div>
  </main>;
}
