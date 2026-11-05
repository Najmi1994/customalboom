import type { PhotoAdjustments, PhotoPlacement } from './model';

export const NEUTRAL: Readonly<PhotoAdjustments> = Object.freeze({ exposure: 0, contrast: 0, saturation: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 });
export const adjustmentKeys = Object.keys(NEUTRAL) as (keyof PhotoAdjustments)[];
export const isNeutral = (value?: PhotoAdjustments) => !value || adjustmentKeys.every(key => (value[key] ?? 0) === 0);
export const adjustmentKey = (value?: PhotoAdjustments) => adjustmentKeys.map(key => value?.[key] ?? 0).join(',');
export function samePhoto(a?: PhotoPlacement, b?: PhotoPlacement) {
  if (!a || !b) return a === b;
  return a.assetId === b.assetId && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height && adjustmentKey(a.adjustments) === adjustmentKey(b.adjustments);
}
const smooth = (a: number, b: number, value: number) => { const t = Math.max(0, Math.min(1, (value - a) / (b - a))); return t * t * (3 - 2 * t); };
const linear = (v: number) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
const srgb = (v: number) => v <= .0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - .055;

/** Shared sRGB tone transform. Alpha and transparent pixels are left untouched. */
export function adjustPixels(pixels: Uint8ClampedArray, settings?: PhotoAdjustments) {
  if (isNeutral(settings)) return;
  const a = settings!, exposure = 2 ** a.exposure, contrast = 2 ** (a.contrast / 100), saturation = 1 + (a.saturation ?? 0) / 100;
  // A lookup table handles exposure/contrast without per-pixel power functions.
  const lut = Array.from({ length: 256 }, (_, i) => {
    const v = Math.max(0, Math.min(1, srgb(linear(i / 255) * exposure)));
    return v < .5 ? .5 * (2 * v) ** contrast : 1 - .5 * (2 * (1 - v)) ** contrast;
  });
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const r = lut[pixels[i]], g = lut[pixels[i + 1]], b = lut[pixels[i + 2]], luminance = .2126 * r + .7152 * g + .0722 * b;
    const lift = .35 * (a.highlights / 100 * smooth(.4, .9, luminance) + a.shadows / 100 * (1 - smooth(.1, .6, luminance)))
      + .25 * (a.whites / 100 * smooth(.7, 1, luminance) + a.blacks / 100 * (1 - smooth(0, .3, luminance)));
    const tr = r + lift * (lift > 0 ? 1 - r : r), tg = g + lift * (lift > 0 ? 1 - g : g), tb = b + lift * (lift > 0 ? 1 - b : b);
    const gray = .2126 * tr + .7152 * tg + .0722 * tb;
    for (let c = 0; c < 3; c++) {
      const toned = c === 0 ? tr : c === 1 ? tg : tb;
      const value = saturation === 1 ? toned : gray + (toned - gray) * saturation;
      pixels[i + c] = 255 * Math.max(0, Math.min(1, value));
    }
  }
}
