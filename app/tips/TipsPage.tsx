'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ArrowUpRight, Camera, Check, Coffee, Copy, Landmark } from 'lucide-react';
import type { SupportSettings } from '../../src/print-shops/domain';
import SupportMessage from '../../src/support/SupportMessage';

const copy = {
  ms: {
    back: 'Buka editor', title: 'Tips buat custom album dengan cepat',
    tips: [
      ['Rancang sebelum majlis', 'Rancang cara anda mengambil gambar sebelum majlis pelanggan. Fikirkan gambar yang diperlukan untuk menceritakan perjalanan majlis dalam album.'],
      ['Beri ruang untuk crop', 'Sentiasa ambil gambar dengan mengambil kira ruang cropping. Elakkan komposisi yang terlalu ketat atau “fit”, kerana anda boleh crop gambar semasa memasukkannya ke dalam frame.'],
      ['Siapkan touch up dan editing', 'Pastikan gambar anda telah dibetulkan dari segi touch up, warna dan editing sebelum mula menyusun album.'],
      ['Susun folder ikut kronologi', 'Susun gambar siap-siap dalam folder mengikut kronologi majlis supaya mudah dicari dan dimasukkan ke dalam album. Contohnya:'],
      ['Gambar power, paparkan besar', 'Pilih gambar yang anda rasa paling awesome dan jadikannya highlight utama pada sebuah page. Beri ruang lebih besar supaya gambar itu menyerlah.'],
    ],
    folders: ['Make up', 'Akad Nikah', 'Gambar Nikah Keluarga', 'Gambar Berdua', 'Outdoor'],
    ps: 'P/s: Semoga CustomAlboom.com memudahkan kerja anda.',
    coffee: 'Belanja saya kopi', payment: 'KAEDAH BAYARAN', copy: 'Salin', copied: 'Disalin',
    copyError: 'Tidak dapat menyalin. Sila salin maklumat secara manual.', footer: 'Susun cerita. Abadikan kenangan.',
  },
  en: {
    back: 'Open editor', title: 'Tips for creating custom albums faster',
    tips: [
      ['Plan before the event', 'Plan how you will photograph your client’s event beforehand. Think about the photos you need to tell the story throughout the album.'],
      ['Leave room to crop', 'Keep cropping in mind when taking photos. Avoid framing too tightly: you can crop the photo when placing it into an album frame.'],
      ['Finish your retouching and editing', 'Make sure your photos have been retouched, colour-corrected and edited before you start arranging the album.'],
      ['Organise folders chronologically', 'Sort your photos into folders following the order of the event, so they are easy to find and place in the album. For example:'],
      ['Give standout photos more space', 'Choose your most awesome photo and make it the main highlight of a page. Display it larger so it gets the attention it deserves.'],
    ],
    folders: ['Makeup', 'Wedding ceremony', 'Family portraits', 'Couple portraits', 'Outdoor'],
    ps: 'P.S. We hope CustomAlboom.com makes your work easier.',
    coffee: 'Buy me a coffee', payment: 'PAYMENT METHOD', copy: 'Copy', copied: 'Copied',
    copyError: 'Could not copy. Please copy the details manually.', footer: 'Tell the story. Keep the memories.',
  },
};

const tipImages = [
  '/tips/01-plan-before-event.jpg',
  '/tips/02-leave-room-to-crop.jpg',
  '/tips/03-finish-retouching.jpg',
  '/tips/04-organise-chronologically.jpg',
  '/tips/05-highlight-best-photo.jpg',
];

export default function TipsPage({ support }: { support: SupportSettings }) {
  const [language, setLanguage] = useState<'en' | 'ms'>('en');
  const [copied, setCopied] = useState(''), [copyError, setCopyError] = useState(false);
  const t = copy[language], malay = language === 'ms';
  async function copyValue(value: string, id: string) {
    setCopyError(false);
    try { await navigator.clipboard.writeText(value); setCopied(id); }
    catch { setCopied(''); setCopyError(true); }
  }
  return <main className="info-page tips-page" lang={language}>
    <header className="info-header">
      <Link href="/" className="info-brand"><Image src="/customalboom-logo.png" alt="" width={42} height={42}/><span>CustomAlboom<span>.com</span></span></Link>
      <div className="info-header-actions">
        <div className="info-language" role="group" aria-label="Language / Bahasa"><button aria-pressed={malay} onClick={() => setLanguage('ms')}>BM</button><button aria-pressed={!malay} onClick={() => setLanguage('en')}>English</button></div>
        <Link className="info-editor" href="/">{t.back}<ArrowUpRight size={16}/></Link>
      </div>
    </header>
    <div className="info-content">
      <section className="info-section">
        <div className="info-section-heading"><span className="info-icon"><Camera/></span><h1>{t.title}</h1></div>
        <ol className="tips-list">{t.tips.map(([title, description], index) => <li key={index}>
          <Image className="tips-image" src={tipImages[index]} alt="" width={1200} height={800} sizes="(max-width: 760px) calc(100vw - 72px), 280px" loading={index === 0 ? 'eager' : 'lazy'}/>
          <span className="tips-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <div><h2>{title}</h2><p>{description}</p>{index === 3 && <ol className="tips-folders" aria-label={title}>{t.folders.map((folder, i) => <li key={folder}>{i > 0 && <ArrowRight size={14} aria-hidden="true"/>}<span>{folder}</span></li>)}</ol>}</div>
        </li>)}</ol>
        <aside className="info-callout">{t.ps}</aside>
      </section>
      <section className="info-section tips-support" aria-labelledby="tips-coffee-title">
        <div className="info-section-heading"><span className="info-icon"><Coffee/></span><h2 id="tips-coffee-title">{t.coffee}</h2></div>
        <SupportMessage settings={support} language={language}/>
        <div className="tips-payment-grid">{support.accounts.map(account => {
          const fieldToCopy = account.fields.find(field => field.copy);
          return <article className="tips-payment-card" key={account.id}>
            <div className="tips-payment-heading"><Landmark size={20}/><div><small>{t.payment}</small><h3>{account.name}</h3></div></div>
            <dl>{account.fields.map(field => <div key={field.id}><dt>{malay ? field.labelMs : field.labelEn}</dt><dd>{field.value}</dd></div>)}</dl>
            {fieldToCopy && <button onClick={() => void copyValue(fieldToCopy.value, account.id)}>{copied === account.id ? <Check size={15}/> : <Copy size={15}/>} {copied === account.id ? t.copied : `${t.copy} ${malay ? fieldToCopy.labelMs : fieldToCopy.labelEn}`}</button>}
          </article>;
        })}</div>
        <p role="status" aria-live="polite">{copyError ? t.copyError : copied ? t.copied : ''}</p>
      </section>
      <footer className="info-footer"><span>CustomAlboom.com</span><span>{t.footer}</span></footer>
    </div>
  </main>;
}
