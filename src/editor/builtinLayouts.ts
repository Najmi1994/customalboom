import { PageLayoutTemplate, Page, makeFrame, makeText, uid, pageWidth } from '../domain/model';
import { SafeRegion, safeRegions } from '../domain/geometry';
export function builtinLayouts(page: Page): PageLayoutTemplate[] {
  const w = pageWidth(page), h = page.height, pad = Math.max(page.padding, Math.min(w, h) * .045), gap = Math.min(w, h) * .018, iw = w - 2 * pad, ih = h - 2 * pad;
  const base: Page = { ...page, background: '#ffffff', backgroundPhoto: undefined, padding: pad };
  const regions = safeRegions(base);
  if (regions.length > 1) return regionalLayouts(base, regions, gap);
  const layouts: [string, Page['elements']][] = [];
  layouts.push(['The full story', [makeFrame('rect', pad, pad, iw, ih)]]);
  layouts.push(['Side by side', [makeFrame('rect', pad, pad, (iw - gap) / 2, ih), makeFrame('rect', pad + (iw + gap) / 2, pad, (iw - gap) / 2, ih)]]);
  layouts.push(['Three moments', [makeFrame('rect', pad, pad, iw * .6 - gap / 2, ih), makeFrame('rect', pad + iw * .6 + gap / 2, pad, iw * .4 - gap / 2, (ih - gap) / 2), makeFrame('rect', pad + iw * .6 + gap / 2, pad + (ih + gap) / 2, iw * .4 - gap / 2, (ih - gap) / 2)]]);
  layouts.push(['The collection', [0, 1, 2, 3].map(i => makeFrame('rect', pad + i % 2 * (iw + gap) / 2, pad + Math.floor(i / 2) * (ih + gap) / 2, (iw - gap) / 2, (ih - gap) / 2))]);
  const size = Math.min(ih * .75, iw * .36);
  layouts.push(['A softer frame', [makeFrame('ellipse', pad + iw * .25 - size / 2, pad + (ih - size) / 2, size, size), makeFrame('ellipse', pad + iw * .75 - size / 2, pad + (ih - size) / 2, size, size)]]);
  const title = { ...makeText(pad, pad + ih * .78, iw), text: 'Our beautiful days', align: 'center' as const, fontSize: ih * .055, height: ih * .12 };
  layouts.push(['A quiet chapter', [makeFrame('rect', pad + iw * .15, pad, iw * .7, ih * .72), title]]);
  return layouts.map(([name, elements]) => ({ schemaVersion: 1, kind: 'album-template', id: 'builtin-' + name, name, page: { ...base, id: uid(), elements } }));
}

function regionalLayouts(base: Page, regions: SafeRegion[], gap: number): PageLayoutTemplate[] {
  const perRegion = (recipe: (region: SafeRegion, gap: number) => Page['elements']) => regions.flatMap(region => recipe(region, gap));
  const recipes: [string, (region: SafeRegion, gap: number) => Page['elements']][] = [
    ['The full story', r => [makeFrame('rect', r.x, r.y, r.right - r.x, r.bottom - r.y)]],
    ['Side by side', (r, g) => { const w = r.right - r.x, h = r.bottom - r.y; return [makeFrame('rect', r.x, r.y, (w - g) / 2, h), makeFrame('rect', r.x + (w + g) / 2, r.y, (w - g) / 2, h)]; }],
    ['Three moments', (r, g) => { const w = r.right - r.x, h = r.bottom - r.y; return [makeFrame('rect', r.x, r.y, w * .6 - g / 2, h), makeFrame('rect', r.x + w * .6 + g / 2, r.y, w * .4 - g / 2, (h - g) / 2), makeFrame('rect', r.x + w * .6 + g / 2, r.y + (h + g) / 2, w * .4 - g / 2, (h - g) / 2)]; }],
    ['The collection', (r, g) => { const w = r.right - r.x, h = r.bottom - r.y; return [0, 1, 2, 3].map(i => makeFrame('rect', r.x + i % 2 * (w + g) / 2, r.y + Math.floor(i / 2) * (h + g) / 2, (w - g) / 2, (h - g) / 2)); }],
    ['A softer frame', (r, g) => { const w = r.right - r.x, h = r.bottom - r.y, size = Math.min(h * .75, (w - g) * .46); return [makeFrame('ellipse', r.x + w * .25 - size / 2, r.y + (h - size) / 2, size, size), makeFrame('ellipse', r.x + w * .75 - size / 2, r.y + (h - size) / 2, size, size)]; }],
    ['A quiet chapter', r => { const w = r.right - r.x, h = r.bottom - r.y, title = { ...makeText(r.x, r.y + h * .78, w), text: 'Our beautiful days', align: 'center' as const, fontSize: h * .055, height: h * .12 }; return [makeFrame('rect', r.x + w * .15, r.y, w * .7, h * .72), title]; }],
  ];
  return recipes.map(([name, recipe]) => ({ schemaVersion: 1, kind: 'album-template', id: 'builtin-' + name, name, page: { ...base, id: uid(), elements: perRegion(recipe) } }));
}
