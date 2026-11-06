import type { Metadata } from 'next';
import { readStyleStore } from '../../src/print-shops/store';
import { DEFAULT_SUPPORT_SETTINGS, publicSupportSettings } from '../../src/print-shops/domain';
import TipsPage from './TipsPage';
import '../info/info.css';
import './tips.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Custom Album Tips | CustomAlboom.com',
  description: 'Tips for creating custom albums faster, from planning your shoot to choosing your standout photos.',
  alternates: { canonical: '/tips' },
};

export default async function Page() {
  const snapshot = await readStyleStore();
  return <TipsPage support={publicSupportSettings(snapshot?.data.supportSettings ?? DEFAULT_SUPPORT_SETTINGS)}/>;
}
