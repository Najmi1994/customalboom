'use client';
import { useState } from 'react';
import type { SupportSettings } from '../print-shops/domain';
import styles from './support.module.css';

export default function SupportMessage({ settings, language }: { settings: SupportSettings; language: 'ms' | 'en' }) {
  const [failedId, setFailedId] = useState('');
  const portrait = settings.portrait, showPhoto = portrait && portrait.id !== failedId;
  return <div className={showPhoto ? styles.withPhoto : undefined}>
    {/* Uploaded portrait is served from the same origin without image optimisation. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {showPhoto && <img className={styles.portrait} src={`/api/support/photo/${portrait.id}`} alt={language === 'ms' ? 'Pencipta CustomAlboom.com' : 'Creator of CustomAlboom.com'} onError={() => setFailedId(portrait.id)}/>}
    <p className={styles.message}>{language === 'ms' ? settings.messageMs : settings.messageEn}</p>
  </div>;
}
