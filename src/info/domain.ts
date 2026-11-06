import { z } from 'zod';

export const MAX_INFO_BANNERS = 5;
export const MAX_BANNER_BYTES = 3 * 1024 * 1024;
export const bannerInputSchema = z.object({
  title: z.string().trim().min(1, 'Nama banner diperlukan.').max(120),
  url: z.string().trim().max(2048).default('').refine(value => {
    if (!value) return true;
    try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
  }, 'Gunakan URL http atau https yang sah.'),
}).strict();
export const infoBannerSchema = bannerInputSchema.extend({
  id: z.string().uuid(),
  key: z.string().regex(/^info-banners\/[a-f0-9-]+\.(png|jpg|webp)$/),
  contentType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
});
export const infoBannersSchema = z.array(infoBannerSchema).max(MAX_INFO_BANNERS).refine(items => new Set(items.map(item => item.id)).size === items.length, 'Duplicate banner ID.');
export type InfoBanner = z.infer<typeof infoBannerSchema>;
export type PublicInfoBanner = Pick<InfoBanner, 'id' | 'title' | 'url'>;
export function publicInfoBanners(items: InfoBanner[]): PublicInfoBanner[] {
  return items.map(({ id, title, url }) => ({ id, title, url }));
}
export function detectBanner(bytes: Uint8Array): { contentType: InfoBanner['contentType']; extension: string } | null {
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) return { contentType: 'image/png', extension: 'png' };
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { contentType: 'image/jpeg', extension: 'jpg' };
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP') return { contentType: 'image/webp', extension: 'webp' };
  return null;
}
