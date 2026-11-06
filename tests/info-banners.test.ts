import assert from 'node:assert/strict';
import test from 'node:test';
import { bannerInputSchema, detectBanner, infoBannersSchema, publicInfoBanners } from '../src/info/domain';

const banner = (index: number) => ({ id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, title: 'Banner', url: 'https://example.com', key: `info-banners/00000000-0000-4000-8000-${String(index).padStart(12, '0')}.png`, contentType: 'image/png' as const });
test('info banners enforce five slots and reject duplicate IDs and unsafe storage paths', () => {
  assert.equal(infoBannersSchema.safeParse(Array.from({ length: 5 }, (_, i) => banner(i))).success, true);
  assert.equal(infoBannersSchema.safeParse(Array.from({ length: 6 }, (_, i) => banner(i))).success, false);
  assert.equal(infoBannersSchema.safeParse([banner(1), banner(1)]).success, false);
  assert.equal(infoBannersSchema.safeParse([{ ...banner(1), key: '../style.asp' }]).success, false);
});
test('banner CTA accepts optional web links and rejects active content', () => {
  for (const url of ['', 'https://example.com/offer', 'http://example.com']) assert.equal(bannerInputSchema.safeParse({ title: 'Ad', url }).success, true);
  for (const url of ['javascript:alert(1)', 'data:text/html,x', '/relative', 'not a url']) assert.equal(bannerInputSchema.safeParse({ title: 'Ad', url }).success, false);
});
test('public banner data excludes server storage keys', () => {
  assert.deepEqual(Object.keys(publicInfoBanners([banner(1)])[0]).sort(), ['id', 'title', 'url']);
});
test('banner detection rejects SVG and recognizes raster signatures', () => {
  assert.equal(detectBanner(new TextEncoder().encode('<svg onload="alert(1)"></svg>')), null);
  assert.equal(detectBanner(new Uint8Array([137,80,78,71,13,10,26,10]))?.contentType, 'image/png');
  assert.equal(detectBanner(new Uint8Array([255,216,255]))?.contentType, 'image/jpeg');
  assert.equal(detectBanner(new TextEncoder().encode('RIFF0000WEBP'))?.contentType, 'image/webp');
});
