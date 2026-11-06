import { z } from 'zod';

export const BUILTIN_FONTS = ['Inter', 'Lora', 'DM Sans'] as const;
export const MAX_GOOGLE_FONTS = 30;

export const fontFamilySchema = z.string().trim()
  .min(1, 'Nama font diperlukan.')
  .max(80, 'Nama font terlalu panjang.')
  .regex(/^[\p{L}\p{N} ._-]+$/u, 'Nama font mengandungi aksara yang tidak dibenarkan.');

export function googleFontsStylesheet(families: readonly string[]): string {
  const params = new URLSearchParams();
  for (const family of families) params.append('family', family.trim());
  params.set('display', 'swap');
  return `https://fonts.googleapis.com/css2?${params.toString()}`;
}

export function uniqueFontFamilies(families: readonly string[]): string[] {
  const seen = new Set<string>();
  return families.filter(family => {
    const key = family.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
