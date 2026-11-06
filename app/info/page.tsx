import type { Metadata } from 'next';
import { readStyleStore } from '../../src/print-shops/store';
import { publicInfoBanners } from '../../src/info/domain';
import InfoPage from './InfoPage';
import './info.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Panduan & Info | CustomAlboom.com',
  description: 'Fahami cara gambar lokal, save projek dan open projek berfungsi di CustomAlboom.',
  alternates: { canonical: '/info' },
};
export default async function Page() {
  const snapshot = await readStyleStore();
  return <InfoPage banners={publicInfoBanners(snapshot?.data.infoBanners ?? [])}/>;
}
